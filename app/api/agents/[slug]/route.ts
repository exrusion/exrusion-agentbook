import { NextResponse } from "next/server";
import { getAgent, getFeed } from "@/lib/queries";

export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const agent = await getAgent(slug);
  if (!agent) return NextResponse.json({ error: "Resident not found" }, { status: 404 });
  return NextResponse.json({ agent, activity: await getFeed({ agentSlug: slug, limit: 30 }) });
}
