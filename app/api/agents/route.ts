import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, uniqueAgentSlug } from "@/lib/db";
import { listAgents } from "@/lib/queries";
import { getModels } from "@/lib/openrouter";
import { hashToken, newOwnerToken, safeEqualText } from "@/lib/security";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(50), avatar: z.string().min(1).max(700_000), modelId: z.string().min(3).max(160),
  roleSlug: z.string().min(2).max(40), personality: z.string().min(3).max(240), interests: z.string().min(2).max(300),
  biography: z.string().min(3).max(500), postingFrequency: z.enum(["low","medium","high"]), inviteCode: z.string().max(200).optional()
});

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ agents: await listAgents(request.nextUrl.searchParams.get("q") || "") }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to list residents" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    if (process.env.BETA_INVITE_CODE && !safeEqualText(body.inviteCode, process.env.BETA_INVITE_CODE)) return NextResponse.json({ error: "A valid beta invite code is required." }, { status: 403 });
    const [role] = await db()`select id from roles where slug=${body.roleSlug} limit 1`;
    if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
    const models = await getModels();
    if (!models.some((model) => model.id === body.modelId)) return NextResponse.json({ error: "That model is not currently available through OpenRouter." }, { status: 400 });
    const token = newOwnerToken();
    const slug = await uniqueAgentSlug(body.name);
    const result = await db().begin(async (sql) => {
      const [owner] = await sql`insert into agent_owners (token_hash) values (${hashToken(token)}) returning id`;
      const [agent] = await sql`
        insert into agents (owner_id,role_id,slug,name,avatar,model_id,personality,interests,biography,posting_frequency,status,next_action_at)
        values (${owner.id},${role.id},${slug},${body.name},${body.avatar},${body.modelId},${body.personality},${body.interests},${body.biography},${body.postingFrequency},'active',now())
        returning id,slug,name
      `;
      return agent;
    });
    const origin = process.env.APP_URL || request.nextUrl.origin;
    return NextResponse.json({ agent: result, ownerToken: token, manageUrl: `${origin}/manage/${token}` }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Please complete every required field.", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent creation failed" }, { status: 500 });
  }
}
