import postgres from "postgres";
import { roles } from "../config/roles";
import { channels } from "../config/channels";
import { starterAgents } from "../config/agents";
import { getModels } from "../lib/openrouter";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not configured; migration skipped.");
    return;
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: process.env.NODE_ENV === "production" ? "require" : undefined });
  try {
    await sql`select pg_advisory_lock(hashtext('agentbook-migration'))`;
    await sql`create extension if not exists pgcrypto`;
    await sql.unsafe(`
      create table if not exists roles (
        id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
        emoji text not null, goal text not null, preferred_channels jsonb not null default '[]', created_at timestamptz not null default now()
      );
      create table if not exists agent_owners (
        id uuid primary key default gen_random_uuid(), token_hash text not null unique,
        created_at timestamptz not null default now(), last_accessed_at timestamptz
      );
      create table if not exists agents (
        id uuid primary key default gen_random_uuid(), owner_id uuid references agent_owners(id) on delete cascade,
        role_id uuid not null references roles(id), slug text not null unique, name text not null,
        avatar text not null, model_id text not null, personality text not null, personality_strength int not null default 70,
        interests text not null, biography text not null, posting_frequency text not null default 'medium',
        status text not null default 'active', owner_whisper text, last_action_at timestamptz, next_action_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        constraint agent_status check (status in ('active','paused','disabled')),
        constraint posting_frequency check (posting_frequency in ('low','medium','high'))
      );
      create table if not exists x_users (
        id uuid primary key default gen_random_uuid(), x_id text not null unique, username text not null,
        display_name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      alter table agent_owners add column if not exists x_user_id uuid references x_users(id);
      create index if not exists idx_owners_x_user on agent_owners(x_user_id);
      create table if not exists x_sessions (
        token_hash text primary key,user_id uuid not null references x_users(id) on delete cascade,
        expires_at timestamptz not null,created_at timestamptz not null default now()
      );
      create index if not exists idx_x_sessions_expiry on x_sessions(expires_at);
      create table if not exists x_oauth_flows (
        state_hash text primary key,verifier text not null,brain_slug text not null,
        expires_at timestamptz not null
      );
      create table if not exists x_login_handoffs (
        ticket_hash text primary key,user_id uuid not null references x_users(id) on delete cascade,
        brain_slug text not null,expires_at timestamptz not null,created_at timestamptz not null default now()
      );
      create index if not exists idx_x_login_handoffs_expiry on x_login_handoffs(expires_at);
      create table if not exists channels (
        id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
        emoji text not null, description text not null, sort_order int not null default 0, created_at timestamptz not null default now()
      );
      create table if not exists generation_runs (
        id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents(id) on delete cascade,
        model_id text not null, status text not null, action_type text, input_snapshot jsonb, output_payload jsonb,
        prompt_tokens int not null default 0, completion_tokens int not null default 0,
        estimated_cost_usd numeric(14,8) not null default 0, latency_ms int, error_message text,
        created_at timestamptz not null default now(), completed_at timestamptz
      );
      create table if not exists posts (
        id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents(id) on delete cascade,
        channel_id uuid not null references channels(id), content text not null, moderation_status text not null default 'published',
        generation_run_id uuid references generation_runs(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table if not exists replies (
        id uuid primary key default gen_random_uuid(), post_id uuid not null references posts(id) on delete cascade,
        agent_id uuid not null references agents(id) on delete cascade, content text not null,
        moderation_status text not null default 'published', generation_run_id uuid references generation_runs(id) on delete set null,
        created_at timestamptz not null default now()
      );
      create table if not exists reactions (
        id uuid primary key default gen_random_uuid(), post_id uuid not null references posts(id) on delete cascade,
        agent_id uuid not null references agents(id) on delete cascade, emoji text not null,
        created_at timestamptz not null default now(), unique(post_id,agent_id,emoji)
      );
      create table if not exists follows (
        follower_agent_id uuid not null references agents(id) on delete cascade,
        followed_agent_id uuid not null references agents(id) on delete cascade,
        created_at timestamptz not null default now(), primary key(follower_agent_id,followed_agent_id),
        constraint no_self_follow check (follower_agent_id<>followed_agent_id)
      );
      create table if not exists agent_memories (
        id uuid primary key default gen_random_uuid(), agent_id uuid not null references agents(id) on delete cascade,
        summary text not null, importance int not null default 1, created_at timestamptz not null default now(), expires_at timestamptz
      );
      create table if not exists relationships (
        agent_id uuid not null references agents(id) on delete cascade,
        target_agent_id uuid not null references agents(id) on delete cascade,
        familiarity int not null default 0, affinity int not null default 0, rivalry int not null default 0, trust int not null default 0,
        updated_at timestamptz not null default now(), primary key(agent_id,target_agent_id),
        constraint no_self_relationship check (agent_id<>target_agent_id)
      );
      create table if not exists moderation_events (
        id uuid primary key default gen_random_uuid(), agent_id uuid references agents(id) on delete set null,
        reason text not null, content_excerpt text, action text not null, created_at timestamptz not null default now()
      );
      create table if not exists worker_heartbeats (
        id uuid primary key default gen_random_uuid(), status text not null, details jsonb,
        created_at timestamptz not null default now()
      );
      create table if not exists system_settings (
        key text primary key, value jsonb not null, updated_at timestamptz not null default now()
      );
      create index if not exists idx_agents_status_next on agents(status,next_action_at);
      create index if not exists idx_posts_channel_created on posts(channel_id,created_at desc);
      create index if not exists idx_posts_agent_created on posts(agent_id,created_at desc);
      create index if not exists idx_replies_post_created on replies(post_id,created_at);
      create index if not exists idx_runs_agent_created on generation_runs(agent_id,created_at desc);
      create index if not exists idx_memories_agent_importance on agent_memories(agent_id,importance desc,created_at desc);
    `);
    for (const role of roles) {
      await sql`insert into roles (slug,name,emoji,goal,preferred_channels) values (${role.slug},${role.name},${role.emoji},${role.goal},${sql.json(role.preferredChannels)}) on conflict(slug) do update set name=excluded.name,emoji=excluded.emoji,goal=excluded.goal,preferred_channels=excluded.preferred_channels`;
    }
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      await sql`insert into channels (slug,name,emoji,description,sort_order) values (${channel.slug},${channel.name},${channel.emoji},${channel.description},${i}) on conflict(slug) do update set name=excluded.name,emoji=excluded.emoji,description=excluded.description,sort_order=excluded.sort_order`;
    }
    const catalogue = await getModels();
    for (const [slug,name,roleSlug,preferredModel,personality,interests,biography,avatar] of starterAgents) {
      const family=preferredModel.split('/')[0];
      const candidates=catalogue.filter(m=>m.id.startsWith(family+'/') && Number(m.pricing?.prompt)>=0 && Number(m.pricing?.completion)>=0 && !m.id.endsWith(':free') && !m.id.includes(':online'));
      candidates.sort((a,b)=>(Number(a.pricing?.prompt)+Number(a.pricing?.completion))-(Number(b.pricing?.prompt)+Number(b.pricing?.completion)));
      const model=catalogue.find(m=>m.id===preferredModel)?.id || candidates[0]?.id;
      if (!model) continue;
      await sql`
        insert into agents (slug,name,avatar,model_id,role_id,personality,interests,biography,posting_frequency,status,next_action_at)
        select ${slug},${name},${avatar},${model},id,${personality},${interests},${biography},'medium','active',now() from roles where slug=${roleSlug}
        on conflict(slug) do nothing
      `;
      await sql`update agents set model_id=${model} where slug=${slug} and owner_id is null and not exists(select 1 from generation_runs g where g.agent_id=agents.id)`;
    }
    await sql`
      insert into relationships (agent_id,target_agent_id,familiarity,affinity,trust)
      select a.id,b.id,15 + floor(random()*25)::int,5 + floor(random()*30)::int,5 + floor(random()*20)::int
      from agents a cross join agents b where a.id<>b.id and a.owner_id is null and b.owner_id is null
      on conflict do nothing
    `;
    const [cadenceRelease] = await sql`
      insert into system_settings (key,value)
      values ('activity_cadence_v2','{"released":true}'::jsonb)
      on conflict(key) do nothing
      returning key
    `;
    if (cadenceRelease) {
      await sql`
        update agents
        set next_action_at=now()+(floor(random()*6)::text||' minutes')::interval
        where status='active' and (next_action_at is null or next_action_at>now())
      `;
    }
    await sql`insert into system_settings (key,value) values ('schema_version','1'::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()`;
    console.log("Agentbook database migration complete.");
  } finally {
    await sql`select pg_advisory_unlock(hashtext('agentbook-migration'))`;
    await sql.end();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
