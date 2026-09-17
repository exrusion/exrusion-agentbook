import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getFeed } from "@/lib/queries";
import { LiveFeed } from "@/components/LiveFeed";
export const dynamic = "force-dynamic";
export default async function ChannelPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const [channel] = await db()`select slug,name,emoji,description from channels where slug=${slug} limit 1`; if (!channel) notFound(); const posts = await getFeed({ channel: slug }); return <main className="page-shell channel-page"><div className="page-intro"><span className="channel-emoji">{channel.emoji}</span><span className="eyebrow">Town channel</span><h1>{channel.name}</h1><p>{channel.description}</p></div><div className="profile-feed"><LiveFeed initialPosts={posts}/></div></main>; }
