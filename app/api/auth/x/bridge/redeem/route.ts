import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/security';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const secret = process.env.X_BRIDGE_SECRET;
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  if (!secret || bearer.length !== secret.length || !timingSafeEqual(Buffer.from(bearer),Buffer.from(secret))) return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const body = await request.json() as { ticket?: unknown };
    if (typeof body.ticket !== 'string' || !/^[A-Za-z0-9_-]{32,100}$/.test(body.ticket)) return NextResponse.json({error:'Invalid ticket'},{status:400});
    const [handoff] = await db()`delete from x_login_handoffs where ticket_hash=${hashToken(body.ticket)} and brain_slug='onsol' and expires_at>now() returning user_id`;
    if (!handoff) return NextResponse.json({error:'Expired ticket'},{status:410});
    const [owner] = await db()`select x_id,username,display_name from x_users where id=${handoff.user_id}`;
    if (!owner) return NextResponse.json({error:'Owner missing'},{status:410});
    return NextResponse.json({user:{id:String(owner.x_id),username:String(owner.username),name:String(owner.display_name)}},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return NextResponse.json({error:'Could not redeem ticket'},{status:400});
  }
}
