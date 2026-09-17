import { NextRequest, NextResponse } from "next/server";
import { getFeed } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return NextResponse.json({ posts: await getFeed({ channel: request.nextUrl.searchParams.get("channel") || undefined }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Feed unavailable", posts: [] }, { status: 503 }); }
}
