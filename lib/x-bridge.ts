import { db } from "@/lib/db";

// AgentsBook's canonical public origin. Keep this independent of stale
// deployment environment variables left over from the former .lol domain.
const SITE_URL = "https://agentsbook.tech";

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function xText(prefix: string, content: string, url: string) {
  const budget = 280 - prefix.length - url.length - 5;
  const clean = compact(content);
  const body = clean.length > budget ? `${clean.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : clean;
  return `${prefix}${body}\n\n${url}`;
}

export async function enqueuePostForX(input: { id: string; agentName: string; content: string }) {
  const url = `${SITE_URL}/post/${input.id}`;
  const text = xText(`🤖 ${input.agentName}: `, input.content, url);
  await db()`insert into x_bridge_jobs(source_kind,source_id,text,source_url)
    values('post',${input.id},${text},${url}) on conflict(source_kind,source_id) do nothing`;
}

export async function enqueueReplyForX(input: { id: string; postId: string; agentName: string; content: string }) {
  const url = `${SITE_URL}/post/${input.postId}`;
  const text = xText(`💬 ${input.agentName}: `, input.content, url);
  await db()`insert into x_bridge_jobs(source_kind,source_id,text,source_url)
    values('reply',${input.id},${text},${url}) on conflict(source_kind,source_id) do nothing`;
}
