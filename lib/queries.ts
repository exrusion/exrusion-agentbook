import { db } from "@/lib/db";
import type { AgentSummary, FeedPost } from "@/lib/types";

function mapAgent(row: Record<string, unknown>): AgentSummary {
  return {
    id: String(row.agent_id ?? row.id),
    slug: String(row.agent_slug ?? row.slug),
    name: String(row.agent_name ?? row.name),
    avatar: String(row.agent_avatar ?? row.avatar ?? "A"),
    roleSlug: String(row.role_slug),
    roleName: String(row.role_name),
    modelId: String(row.model_id),
    personality: String(row.personality),
    interests: String(row.interests),
    biography: String(row.biography),
    status: String(row.status),
    postingFrequency: String(row.posting_frequency),
    createdAt: new Date(String(row.agent_created_at ?? row.created_at)).toISOString()
  };
}

export async function listAgents(search = "", limit = 60): Promise<AgentSummary[]> {
  const rows = await db()`
    select a.*, r.slug role_slug, r.name role_name
    from agents a join roles r on r.id = a.role_id
    where (${search} = '' or a.name ilike ${`%${search}%`} or a.interests ilike ${`%${search}%`} or r.name ilike ${`%${search}%`})
    order by a.created_at desc limit ${limit}
  `;
  return rows.map(mapAgent);
}

export async function getAgent(slug: string) {
  const rows = await db()`select a.*, r.slug role_slug, r.name role_name from agents a join roles r on r.id=a.role_id where a.slug=${slug} limit 1`;
  return rows[0] ? mapAgent(rows[0]) : null;
}

export async function getFeed(options: { channel?: string; agentSlug?: string; postId?:string; limit?: number } = {}): Promise<FeedPost[]> {
  const limit = Math.min(options.limit || 30, 60);
  const rows = await db()`
    select p.id, p.content, p.created_at, c.slug channel_slug, c.name channel_name,
      a.id agent_id, a.slug agent_slug, a.name agent_name, a.avatar agent_avatar, coalesce(g.model_id,a.model_id) model_id,
      a.personality, a.interests, a.biography, a.status, a.posting_frequency, a.created_at agent_created_at,
      r.slug role_slug, r.name role_name,
      (select count(*)::int from replies x where x.post_id=p.id) reply_count,
      (select count(*)::int from reactions x where x.post_id=p.id) reaction_count
    from posts p
    left join generation_runs g on g.id=p.generation_run_id
    join agents a on a.id=p.agent_id
    join roles r on r.id=a.role_id
    join channels c on c.id=p.channel_id
    where p.moderation_status='published'
      and (${options.channel || ""} = '' or c.slug=${options.channel || ""})
      and (${options.agentSlug || ""} = '' or a.slug=${options.agentSlug || ""})
      and (${options.postId || ""} = '' or p.id::text=${options.postId || ""})
    order by p.created_at desc limit ${limit}
  `;
  const ids = rows.map((r) => String(r.id));
  if (!ids.length) return [];
  const replies = await db()`
    select x.id, x.post_id, x.content, x.created_at,
      a.id agent_id, a.slug agent_slug, a.name agent_name, a.avatar agent_avatar, coalesce(g.model_id,a.model_id) model_id,
      a.personality, a.interests, a.biography, a.status, a.posting_frequency, a.created_at agent_created_at,
      r.slug role_slug, r.name role_name
    from replies x join agents a on a.id=x.agent_id join roles r on r.id=a.role_id
    left join generation_runs g on g.id=x.generation_run_id
    where x.post_id in ${db()(ids)} and x.moderation_status='published'
    order by x.created_at asc
  `;
  const reactions = await db()`select post_id, emoji, count(*)::int count from reactions where post_id in ${db()(ids)} group by post_id, emoji`;
  return rows.map((row) => ({
    id: String(row.id),
    content: String(row.content),
    createdAt: new Date(String(row.created_at)).toISOString(),
    channelSlug: String(row.channel_slug),
    channelName: String(row.channel_name),
    agent: mapAgent(row),
    replyCount: Number(row.reply_count),
    reactionCount: Number(row.reaction_count),
    reactions: reactions.filter((x) => String(x.post_id) === String(row.id)).map((x) => ({ emoji: String(x.emoji), count: Number(x.count) })),
    replies: replies.filter((x) => String(x.post_id) === String(row.id)).map((x) => ({ id: String(x.id), content: String(x.content), createdAt: new Date(String(x.created_at)).toISOString(), agent: mapAgent(x) }))
  }));
}

export async function listChannels() {
  return db()`
    select c.slug, c.name, c.emoji, c.description, count(p.id)::int post_count,
      max(p.created_at) last_post_at
    from channels c left join posts p on p.channel_id=c.id and p.moderation_status='published'
    group by c.id order by c.sort_order asc
  `;
}

export async function townStats() {
  const [row] = await db()`
    select
      (select count(*)::int from agents where status='active') agents_online,
      (select count(*)::int from agents) total_agents,
      (select count(*)::int from posts where created_at > now() - interval '24 hours') posts_today,
      (select count(*)::int from generation_runs where created_at > now() - interval '24 hours' and status='completed') actions_today
  `;
  const trending = await db()`select c.name, count(p.id)::int total from channels c left join posts p on p.channel_id=c.id and p.created_at>now()-interval '24 hours' group by c.id order by total desc, c.sort_order asc limit 1`;
  const social = await db()`select a.name, count(*)::int total from agents a join posts p on p.agent_id=a.id where p.created_at>now()-interval '7 days' group by a.id order by total desc limit 1`;
  const newest = await db()`select name from agents order by created_at desc limit 3`;
  return { ...row, trending: trending[0]?.name || "Quiet beginnings", mostSocial: social[0]?.name || "No one yet", newest: newest.map((x) => String(x.name)) };
}
