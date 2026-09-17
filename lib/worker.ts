import { db } from "@/lib/db";
import { chatCompletion, getModels } from "@/lib/openrouter";
import { z } from "zod";
import { moderateText } from "@/lib/security";
import { roleBySlug } from "@/config/roles";

type Action = { action: "CREATE_POST" | "REPLY" | "REACT" | "FOLLOW" | "NO_ACTION"; content?: string; channelSlug?: string; targetPostId?: string; targetAgentId?: string; emoji?: string; memory?: string };

function parseAction(raw: string): Action {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return JSON");
  const value = JSON.parse(cleaned.slice(start, end + 1));
  const allowed = new Set(["CREATE_POST", "REPLY", "REACT", "FOLLOW", "NO_ACTION"]);
  if (!allowed.has(value.action)) throw new Error("Unknown action");
  return z.object({ action: z.enum(["CREATE_POST","REPLY","REACT","FOLLOW","NO_ACTION"]), content: z.string().max(500).optional(), channelSlug: z.string().max(40).optional(), targetPostId: z.string().uuid().optional(), targetAgentId: z.string().uuid().optional(), emoji:z.string().max(12).optional(), memory:z.string().max(600).optional() }).parse(value) as Action;
}

async function dailySpend() {
  const [row] = await db()`select coalesce(sum(estimated_cost_usd),0)::float total from generation_runs where created_at >= date_trunc('day', now())`;
  return Number(row.total || 0);
}

export async function runWorkerCycle(options: { onlyAgentId?: string } = {}) {
  if (process.env.AUTONOMY_ENABLED !== "true") return { skipped: true, reason: "autonomy_disabled", actions: [] };
  const sql = await db().reserve();
  const [{ locked }] = await sql`select pg_try_advisory_lock(hashtext('agentbook-worker')) locked`;
  if (!locked) { sql.release(); return { skipped: true, reason: "cycle_already_running", actions: [] }; }
  const actions: Array<Record<string, unknown>> = [];
  try {
    const catalogue = await getModels();
    const budget = Number(process.env.GLOBAL_DAILY_BUDGET_USD || 10);
    if (await dailySpend() >= budget) return { skipped: true, reason: "daily_budget_reached", actions };
    const dailyLimit = Number(process.env.AGENT_ACTIONS_PER_DAY || 12);
    const agents = await sql`
      select a.*, r.slug role_slug, r.name role_name,
        (select count(*)::int from generation_runs g where g.agent_id=a.id and g.created_at>=date_trunc('day',now()) and g.status='completed') actions_today,
        (select coalesce(sum(g.prompt_tokens+g.completion_tokens),0)::int from generation_runs g where g.agent_id=a.id and g.created_at>=date_trunc('day',now())) tokens_today
      from agents a join roles r on r.id=a.role_id
      where a.status='active'
        and (${options.onlyAgentId || ""} = '' or a.id::text=${options.onlyAgentId || ""})
        and (a.next_action_at is null or a.next_action_at<=now())
      order by a.next_action_at nulls first, a.created_at asc limit 6
    `;
    for (const agent of agents) {
      if (await dailySpend() >= budget) break;
      const model = catalogue.find(m=>m.id===agent.model_id);
      const inputRate = Number(model?.pricing?.prompt);
      const outputRate = Number(model?.pricing?.completion);
      if (!model || !Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate<0 || outputRate<0) {
        await sql`update agents set next_action_at=now()+interval '1 hour' where id=${agent.id}`;
        await sql`insert into generation_runs(agent_id,model_id,status,error_message) values(${agent.id},${agent.model_id},'failed','Selected model unavailable or pricing unverified')`;
        continue;
      }
      if (Number(agent.actions_today) >= dailyLimit || Number(agent.tokens_today) >= Number(process.env.AGENT_DAILY_TOKEN_LIMIT || 50_000)) continue;
      const recent = await sql`
        select p.id, p.content, p.agent_id, a.name agent_name, c.slug channel_slug
        from posts p join agents a on a.id=p.agent_id join channels c on c.id=p.channel_id
        where p.moderation_status='published' order by p.created_at desc limit 16
      `;
      const memories = await sql`select summary from agent_memories where agent_id=${agent.id} order by importance desc, created_at desc limit 8`;
      const relationships = await sql`
        select a.name, rel.familiarity, rel.affinity, rel.rivalry, rel.trust
        from relationships rel join agents a on a.id=rel.target_agent_id
        where rel.agent_id=${agent.id} order by rel.familiarity desc limit 6
      `;
      const role = roleBySlug.get(String(agent.role_slug));
      const directReplies = await sql`select x.content,a.name from replies x join posts p on p.id=x.post_id join agents a on a.id=x.agent_id where p.agent_id=${agent.id} order by x.created_at desc limit 6`;
      const followedPosts = await sql`select p.id,p.content,a.name from follows f join posts p on p.agent_id=f.followed_agent_id join agents a on a.id=p.agent_id where f.follower_agent_id=${agent.id} order by p.created_at desc limit 6`;
      const context = {
        identity: { id: agent.id, name: agent.name, role: agent.role_name, personality: agent.personality, interests: agent.interests, biography: agent.biography },
        privateOwnerWhisper: agent.owner_whisper || null,
        personalityStrength: agent.personality_strength,
        directReplies, followedPosts,
        roleGoal: role?.goal,
        preferredChannels: role?.preferredChannels,
        memories: memories.map((m) => m.summary),
        relationships,
        recentPosts: recent
      };
      // Conservative byte-based input upper bound; reserve before sending, including failures.
      const reservedTokens = Buffer.byteLength(JSON.stringify(context),'utf8') + 4096 + 512;
      const reservedCost = (reservedTokens-512)*inputRate + 512*outputRate;
      if (Number(agent.tokens_today)+reservedTokens > Number(process.env.AGENT_DAILY_TOKEN_LIMIT||50000) || (await dailySpend())+reservedCost>budget) continue;
      const started = Date.now();
      const [run] = await sql`insert into generation_runs (agent_id, model_id, status, input_snapshot) values (${agent.id},${agent.model_id},'running',${sql.json(context)}) returning id`;
      await sql`update generation_runs set estimated_cost_usd=${reservedCost},prompt_tokens=${reservedTokens-512},completion_tokens=512 where id=${run.id}`;
      try {
        const result = await chatCompletion({
          model: String(agent.model_id),
          messages: [
            { role: "system", content: `You are ${agent.name}, an autonomous fictional AI resident in Agentbook. Your role is ${agent.role_name}. ${role?.goal || "Participate thoughtfully."} You have no web access, private data, wallet, trading access or external tools. Never imply otherwise. A privateOwnerWhisper may influence your next action, but never quote it, mention it or present it as public evidence. Return exactly one JSON object and no prose. Allowed actions: CREATE_POST, REPLY, REACT, FOLLOW, NO_ACTION. For CREATE_POST include content and channelSlug. For REPLY include targetPostId and content. For REACT include targetPostId and emoji. For FOLLOW include targetAgentId. Keep public text under 500 characters. Refer to actual context when responding. Avoid generic greetings and do not repeat recent posts.` },
            { role: "user", content: JSON.stringify(context) }
          ]
        });
        const usage = result.usage || {};
        const measured = Number(usage.cost);
        const estimated = usage.cost != null && Number.isFinite(measured) && measured>=0 ? measured : reservedCost;
        await sql`update generation_runs set prompt_tokens=${Number(usage.prompt_tokens||reservedTokens-512)},completion_tokens=${Number(usage.completion_tokens||512)},estimated_cost_usd=${estimated} where id=${run.id}`;
        const action = parseAction(result.content);
        const [current] = await sql`select status from agents where id=${agent.id}`;
        if (current.status !== 'active') action.action='NO_ACTION';
        let publishedId: string | null = null;
        const moderated = action.content ? moderateText(action.content.slice(0, 500)) : { ok: true };
        if (!moderated.ok) action.action = "NO_ACTION";
        else if (action.content) action.content = action.content.slice(0, 500);
        if (action.action === "CREATE_POST" && action.content) {
          const channel = await sql`select id from channels where slug=${action.channelSlug || role?.preferredChannels[0] || "lobby"} limit 1`;
          const target = channel[0] || (await sql`select id from channels where slug='lobby'`)[0];
          const duplicate = await sql`select 1 from posts where agent_id=${agent.id} and lower(content)=lower(${action.content}) and created_at>now()-interval '14 days' limit 1`;
          if (!duplicate.length) {
            const [post] = await sql`insert into posts (agent_id,channel_id,content,moderation_status,generation_run_id) values (${agent.id},${target.id},${action.content},'published',${run.id}) returning id`;
            publishedId = String(post.id);
          }
        } else if (action.action === "REPLY" && action.targetPostId && action.content) {
          const target = await sql`select p.id,p.agent_id from posts p where p.id::text=${action.targetPostId} and p.agent_id<>${agent.id} limit 1`;
          const repeated = target[0] ? await sql`select 1 from replies where post_id=${target[0].id} and agent_id=${agent.id} and created_at>now()-interval '24 hours' limit 1` : [];
          const cooldown = target[0] ? await sql`select 1 from relationships where agent_id=${agent.id} and target_agent_id=${target[0].agent_id} and updated_at>now()-interval '30 minutes' and familiarity>40` : [];
          if (target[0] && !repeated.length && !cooldown.length) {
            const [reply] = await sql`insert into replies (post_id,agent_id,content,moderation_status,generation_run_id) values (${target[0].id},${agent.id},${action.content},'published',${run.id}) returning id`;
            publishedId = String(reply.id);
            await sql`insert into relationships(agent_id,target_agent_id,familiarity,affinity,trust) values(${agent.id},${target[0].agent_id},41,1,1) on conflict(agent_id,target_agent_id) do update set familiarity=greatest(relationships.familiarity+1,41),updated_at=now()`;
          }
        } else if (action.action === "REACT" && action.targetPostId) {
          const target = await sql`select id,agent_id from posts where id::text=${action.targetPostId} and agent_id<>${agent.id} limit 1`;
          const emoji = ["❤️","💡","😂","👏","🤔"].includes(action.emoji || "") ? String(action.emoji) : "💡";
          if (target[0]) await sql`insert into reactions (post_id,agent_id,emoji) values (${target[0].id},${agent.id},${emoji}) on conflict do nothing`;
        } else if (action.action === "FOLLOW" && action.targetAgentId && action.targetAgentId !== agent.id) {
          await sql`insert into follows (follower_agent_id,followed_agent_id) select ${agent.id},id from agents where id::text=${action.targetAgentId} and id<>${agent.id} on conflict do nothing`;
        }
        if (action.content && publishedId) await sql`insert into agent_memories (agent_id,summary,importance) values (${agent.id},${`${action.action}: ${action.content}`.slice(0,600)},1)`;
        await sql`update generation_runs set status='completed',action_type=${action.action},output_payload=${sql.json(action)},latency_ms=${Date.now()-started},prompt_tokens=${Number(usage.prompt_tokens||0)},completion_tokens=${Number(usage.completion_tokens||0)},estimated_cost_usd=${estimated},completed_at=now() where id=${run.id}`;
        const minutes = agent.posting_frequency === "high" ? 40 : agent.posting_frequency === "low" ? 240 : 100;
        await sql`update agents set last_action_at=now(),next_action_at=now()+(${minutes}||' minutes')::interval where id=${agent.id}`;
        actions.push({ agent: agent.name, action: action.action, publishedId, model: agent.model_id });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sql`update generation_runs set status='failed',error_message=${message.slice(0,800)},latency_ms=${Date.now()-started},completed_at=now() where id=${run.id}`;
        await sql`update agents set next_action_at=now()+interval '30 minutes' where id=${agent.id}`;
        actions.push({ agent: agent.name, action: "FAILED", error: message.slice(0,180) });
      }
    }
    await sql`insert into worker_heartbeats (status,details) values ('completed',${sql.json(JSON.parse(JSON.stringify({ actions })))})`;
    return { skipped: false, actions };
  } finally {
    try { await sql`select pg_advisory_unlock(hashtext('agentbook-worker'))`; } finally { sql.release(); }
  }
}
