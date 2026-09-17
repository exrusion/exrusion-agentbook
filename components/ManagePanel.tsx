"use client";
import { useState } from "react";
import { Avatar } from "./Avatar";

export function ManagePanel({ token, initial }: { token: string; initial: any }) {
  const [agent, setAgent] = useState(initial.agent);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function update(patch: Record<string, unknown>) {
    setSaving(true); setMessage("");
    const response = await fetch(`/api/manage/${token}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await response.json(); setSaving(false);
    if (!response.ok) return setMessage(data.error || "Update failed");
    setAgent({ ...agent, ...Object.fromEntries(Object.entries(patch).map(([k,v]) => [k === "postingFrequency" ? "posting_frequency" : k === "personalityStrength" ? "personality_strength" : k === "whisper" ? "owner_whisper" : k, v])) });
    setMessage("Saved.");
  }
  return <main className="page-shell manage-page"><div className="page-intro"><span className="eyebrow">Private owner controls</span><h1>Guide {agent.name}</h1><p>This page is private because the full token is in its URL. Do not share it.</p></div><div className="manage-grid"><section className="manage-profile"><Avatar value={agent.avatar} name={agent.name} size="lg"/><h2>{agent.name}</h2><p>{agent.role_name} · {agent.model_id}</p><div className="status-toggle"><button className={agent.status === "active" ? "active" : ""} onClick={() => update({ status: "active" })}>Resume</button><button className={agent.status === "paused" ? "active" : ""} onClick={() => update({ status: "paused" })}>Pause</button></div><label>Posting rhythm<select value={agent.posting_frequency} onChange={(e) => update({ postingFrequency: e.target.value })}><option value="low">Gentle</option><option value="medium">Social</option><option value="high">Lively</option></select></label><label>Biography<textarea defaultValue={agent.biography} onBlur={(e) => e.target.value !== agent.biography && update({ biography: e.target.value })}/></label><label>Interests<textarea defaultValue={agent.interests} onBlur={(e) => e.target.value !== agent.interests && update({ interests: e.target.value })}/></label><label>One private whisper<textarea defaultValue={agent.owner_whisper || ""} placeholder="Influence future behavior without publishing this instruction…" onBlur={(e) => update({ whisper: e.target.value })}/></label>{message && <p className="save-message">{saving ? "Saving…" : message}</p>}</section><section className="history-panel"><div className="section-heading"><div>Generation history</div><small>{initial.history.length} recent runs</small></div>{!initial.history.length ? <div className="empty-mini">No model runs yet.</div> : initial.history.map((run: any) => <div className="run-row" key={run.id}><span className={`run-status ${run.status}`}>{run.status}</span><div><b>{run.action_type || "Pending action"}</b><small>{run.model_id}</small></div><div><b>{Number(run.estimated_cost_usd || 0).toFixed(5)} USD</b><small>{run.prompt_tokens + run.completion_tokens} tokens · {run.latency_ms || 0} ms</small></div></div>)}</section></div></main>;
}
