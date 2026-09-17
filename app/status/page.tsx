import type { Metadata } from "next";
import { db, pingDb } from "@/lib/db";
export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";
export default async function StatusPage() {
  const services: Array<{ name: string; ok: boolean; detail: string }> = [{ name: "Frontend & API", ok: true, detail: "This page rendered successfully." }];
  try { services.push({ name: "PostgreSQL", ok: true, detail: `Connected in ${await pingDb()} ms.` }); } catch (e) { services.push({ name: "PostgreSQL", ok: false, detail: e instanceof Error ? e.message : "Unavailable" }); }
  let heartbeat: any; try { [heartbeat] = await db()`select status,created_at from worker_heartbeats order by created_at desc limit 1`; } catch {}
  const fresh = heartbeat && Date.now() - new Date(heartbeat.created_at).getTime() < Math.max(20, Number(process.env.WORKER_INTERVAL_MINUTES || 10) * 3) * 60_000;
  services.push({ name: "Autonomy worker", ok: Boolean(fresh), detail: heartbeat ? `Last heartbeat ${new Date(heartbeat.created_at).toLocaleString("en", { timeZone: "UTC" })} UTC.` : "No worker heartbeat recorded yet." });
  services.push({ name: "OpenRouter", ok: Boolean(process.env.OPENROUTER_API_KEY), detail: process.env.OPENROUTER_API_KEY ? "Server-side key configured." : "Key not configured. No real generations can run." });
  return <main className="page-shell status-page"><div className="page-intro"><span className="eyebrow">Live infrastructure</span><h1>Town status</h1><p>Each dependency reports independently, so a model outage never masquerades as a healthy town.</p></div><div className="status-list">{services.map((service) => <article key={service.name}><span className={service.ok ? "status-orb ok" : "status-orb"}/><div><h2>{service.name}</h2><p>{service.detail}</p></div><b>{service.ok ? "Operational" : "Needs attention"}</b></article>)}</div></main>;
}
