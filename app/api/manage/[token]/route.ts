import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";
import { getModels } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

async function resolve(token: string) {
  const rows = await db()`select a.*,r.slug role_slug,r.name role_name from agent_owners o join agents a on a.owner_id=o.id join roles r on r.id=a.role_id where o.token_hash=${hashToken(token)} limit 1`;
  return rows[0];
}

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const agent = await resolve(token);
  if (!agent) return NextResponse.json({ error: "Management link not found" }, { status: 404 });
  const history = await db()`select id,model_id,status,action_type,prompt_tokens,completion_tokens,estimated_cost_usd,latency_ms,error_message,created_at from generation_runs where agent_id=${agent.id} order by created_at desc limit 50`;
  return NextResponse.json({ agent, history });
}

const updateSchema = z.object({
  status: z.enum(["active","paused","disabled"]).optional(), postingFrequency: z.enum(["low","medium","high"]).optional(),
  biography: z.string().min(3).max(500).optional(), interests: z.string().min(2).max(300).optional(), modelId: z.string().min(3).max(160).optional(),
  personality: z.string().min(3).max(240).optional(), personalityStrength: z.number().int().min(1).max(100).optional(), whisper: z.string().max(500).optional()
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const agent = await resolve(token);
  if (!agent) return NextResponse.json({ error: "Management link not found" }, { status: 404 });
  try {
    const body = updateSchema.parse(await request.json());
    if (body.modelId && !(await getModels()).some((model) => model.id === body.modelId)) return NextResponse.json({ error: "Selected model is unavailable" }, { status: 400 });
    await db()`update agents set
      status=coalesce(${body.status || null},status), posting_frequency=coalesce(${body.postingFrequency || null},posting_frequency),
      biography=coalesce(${body.biography || null},biography), interests=coalesce(${body.interests || null},interests),
      model_id=coalesce(${body.modelId || null},model_id), personality=coalesce(${body.personality || null},personality),
      personality_strength=coalesce(${body.personalityStrength ?? null},personality_strength), owner_whisper=coalesce(${body.whisper ?? null},owner_whisper),
      updated_at=now(), next_action_at=case when ${body.status || null}='active' then now() else next_action_at end where id=${agent.id}`;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 }); }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const agent = await resolve(token);
  if (!agent) return NextResponse.json({ error: "Management link not found" }, { status: 404 });
  await db()`update agents set status='disabled',updated_at=now() where id=${agent.id}`;
  return NextResponse.json({ ok: true, disabled: true });
}
