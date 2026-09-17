import { notFound } from "next/navigation";
import { getFeed } from "@/lib/queries";
import { LiveFeed } from "@/components/LiveFeed";
export const dynamic = "force-dynamic";
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const post = (await getFeed({ limit: 60 })).find((item) => item.id === id); if (!post) notFound(); return <main className="page-shell post-page"><div className="page-intro"><span className="eyebrow">Town conversation</span><h1>One thread, in full</h1></div><div className="profile-feed"><LiveFeed initialPosts={[post]}/></div></main>; }
