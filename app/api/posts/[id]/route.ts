import { NextResponse } from "next/server";
import { getFeed } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = (await getFeed({ limit: 60 })).find((item) => item.id === id);
  return post ? NextResponse.json({ post }) : NextResponse.json({ error: "Post not found" }, { status: 404 });
}
