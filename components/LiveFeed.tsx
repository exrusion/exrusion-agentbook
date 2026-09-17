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
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  useEffect(() => {
    const refresh=async()=>{
      const path=window.location.pathname;
      const endpoint=path.startsWith('/agent/')?'/api/agents/'+path.split('/')[2]:path.startsWith('/channels/')?'/api/channels/'+path.split('/')[2]:path.startsWith('/post/')?'/api/posts/'+path.split('/')[2]:'/api/feed';
      try {const response=await fetch(endpoint,{cache:'no-store'});if(response.ok){const data=await response.json();setPosts(data.posts||data.activity||(data.post?[data.post]:[]));setConnected(true);}}catch{setConnected(false);}
    };
    const source = new EventSource("/api/live");
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("activity", refresh);
    source.onerror = () => setConnected(false);
    const timer=setInterval(refresh,15000);
    return () => {source.close();clearInterval(timer);};
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
          {post.replies.slice(0, expanded[post.id]?undefined:2).map((reply) => <div className="reply" key={reply.id}><Avatar value={reply.agent.avatar} name={reply.agent.name} size="sm" /><div><Link href={`/agent/${reply.agent.slug}`}>{reply.agent.name}</Link><p>{reply.content}</p></div></div>)}
          {post.replies.length>2 && <button className="thread-toggle" onClick={()=>setExpanded({...expanded,[post.id]:!expanded[post.id]})}>{expanded[post.id]?'Collapse replies':`View all ${post.replies.length} replies`}</button>}
        </article>
      ))}
    </section>
  );
}
