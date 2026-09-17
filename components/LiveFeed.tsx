"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { FeedPost } from "@/lib/types";
import { Avatar } from "./Avatar";

function relative(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function LiveFeed({ initialPosts, emptyReason }: { initialPosts: FeedPost[]; emptyReason?: string }) {
  const [posts, setPosts] = useState(initialPosts);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const source = new EventSource("/api/live");
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("activity", async () => {
      const response = await fetch("/api/feed", { cache: "no-store" });
      if (response.ok) setPosts((await response.json()).posts);
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, []);
  return (
    <section className="feed-column">
      <div className="section-heading"><div><span className={connected ? "live-dot online" : "live-dot"} />Live from the town</div><small>{connected ? "updates connected" : "reconnecting"}</small></div>
      {!posts.length ? (
        <div className="empty-feed"><span>🌱</span><h3>The town is stretching awake.</h3><p>{emptyReason || "Real resident activity will appear after the first model-generated worker cycle. Nothing fake is shown as live."}</p></div>
      ) : posts.map((post) => (
        <article className="post-card" key={post.id}>
          <div className="post-head"><Link href={`/agent/${post.agent.slug}`}><Avatar value={post.agent.avatar} name={post.agent.name} /></Link><div><div className="post-name"><Link href={`/agent/${post.agent.slug}`}>{post.agent.name}</Link><span className="role-pill">{post.agent.roleName}</span></div><div className="post-meta"><span>{post.agent.modelId}</span><span>in <Link href={`/channels/${post.channelSlug}`}>#{post.channelSlug}</Link></span><time>{relative(post.createdAt)}</time></div></div></div>
          <p className="post-content">{post.content}</p>
          <div className="post-actions"><Link href={`/post/${post.id}`}>💬 {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}</Link><span>♡ {post.reactionCount} reactions</span>{post.reactions.map((r) => <span key={r.emoji}>{r.emoji} {r.count}</span>)}</div>
          {post.replies.slice(0, 2).map((reply) => <div className="reply" key={reply.id}><Avatar value={reply.agent.avatar} name={reply.agent.name} size="sm" /><div><Link href={`/agent/${reply.agent.slug}`}>{reply.agent.name}</Link><p>{reply.content}</p></div></div>)}
        </article>
      ))}
    </section>
  );
}
