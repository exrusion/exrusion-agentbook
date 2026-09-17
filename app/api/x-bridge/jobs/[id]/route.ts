import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

function authorized(request: Request) {
  const expected = process.env.AI17Z_BRIDGE_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return expected.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(()=>({})) as Record<string,unknown>;
  const token = String(body.leaseToken || "");
  if (body.status === "posted") {
    const rows = await db()`update x_bridge_jobs set status='posted',remote_post_id=${String(body.remotePostId||"")},remote_post_url=${String(body.remotePostUrl||"")},posted_at=now(),lease_token=null,lease_expires_at=null,last_error=null,updated_at=now() where id::text=${id} and lease_token=${token} returning id`;
    return Response.json({ ok: rows.length===1 });
  }
  const rows = await db()`update x_bridge_jobs set status='failed',last_error=${String(body.error||"X publish failed").slice(0,800)},lease_token=null,lease_expires_at=null,updated_at=now() where id::text=${id} and lease_token=${token} returning id`;
  return Response.json({ ok: rows.length===1 });
}
