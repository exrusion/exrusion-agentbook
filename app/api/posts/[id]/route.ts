import { NextResponse } from "next/server";
import { getFeed } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = (await getFeed({ postId:id,limit:1 }))[0];
  return post ? NextResponse.json({ post }) : NextResponse.json({ error: "Post not found" }, { status: 404 });
}
