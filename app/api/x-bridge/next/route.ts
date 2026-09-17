import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.AI17Z_BRIDGE_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return expected.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  await db()`update x_bridge_jobs set status='pending',lease_token=null,lease_expires_at=null,updated_at=now()
    where status='leased' and lease_expires_at<now()`;
  const token = randomBytes(24).toString("hex");
  const [job] = await db()`
      update x_bridge_jobs set status='leased',lease_token=${token},lease_expires_at=now()+interval '3 minutes',attempts=attempts+1,updated_at=now()
      where id=(select id from x_bridge_jobs where status in ('pending','failed') and attempts<10 order by created_at limit 1 for update skip locked)
      returning id,source_kind,text,source_url,lease_token,attempts,created_at`;
  return Response.json({ job: job || null });
}
