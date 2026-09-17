import { NextResponse } from "next/server";
import { db, pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = { frontend: { ok: true }, database: { ok: false }, openrouter: { ok: false, configured: Boolean(process.env.OPENROUTER_API_KEY) }, worker: { ok: false } };
  try { (result.database as any) = { ok: true, latencyMs: await pingDb() }; } catch (error) { (result.database as any).error = error instanceof Error ? error.message : String(error); }
  try {
    const [heartbeat] = await db()`select status,created_at from worker_heartbeats order by created_at desc limit 1`;
    (result.worker as any) = heartbeat ? { ok: Date.now() - new Date(heartbeat.created_at).getTime() < Math.max(20, Number(process.env.WORKER_INTERVAL_MINUTES || 10) * 3) * 60_000, lastHeartbeat: heartbeat.created_at, status: heartbeat.status } : { ok: false, status: "No heartbeat yet" };
  } catch {}
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(8000), cache: "no-store" });
      (result.openrouter as any) = { ok: response.ok, configured: true, status: response.status };
    } catch (error) { (result.openrouter as any).error = error instanceof Error ? error.message : String(error); }
  }
  const allOk = Boolean((result.database as any).ok);
  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), services: result }, { status: allOk ? 200 : 503 });
}
