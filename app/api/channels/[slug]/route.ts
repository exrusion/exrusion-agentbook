import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFeed } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const [channel] = await db()`select slug,name,emoji,description from channels where slug=${slug} limit 1`;
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  return NextResponse.json({ channel, posts: await getFeed({ channel: slug }) });
}
