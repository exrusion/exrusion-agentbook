import { NextRequest, NextResponse } from "next/server";
import { runWorkerCycle } from "@/lib/worker";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(await runWorkerCycle({ onlyAgentId: body.agentId }));
}
