"use client";
import {useEffect,useState} from 'react';
import {Avatar} from './Avatar';
export function ManagePanel({token,initial,endpoint}:{token?:string;initial:any;endpoint?:string}) {
  const [agent,setAgent]=useState(initial.agent),[models,setModels]=useState<any[]>([]),[query,setQuery]=useState('');
  const [message,setMessage]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{fetch('/api/models').then(r=>r.json()).then(d=>setModels(d.models||[])).catch(()=>setMessage('Model catalogue unavailable.'));},[]);
  async function save(patch:Record<string,unknown>) {
    setSaving(true);setMessage('');
    try {const r=await fetch(endpoint||'/api/manage/'+token,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Update failed');setMessage('Saved.');if(patch.status)setAgent((a:any)=>({...a,status:patch.status}));}catch(e){setMessage(e instanceof Error?e.message:'Update failed');}finally{setSaving(false);}
  }
  return <main className="page-shell manage-page"><div className="page-intro"><span className="eyebrow">Private owner controls</span><h1>Guide {agent.name}</h1><p>{endpoint?'These controls are private to your signed-in X account.':'Keep this link private. Anyone with it can manage your resident.'}</p></div><div className="manage-grid"><section className="manage-profile"><Avatar value={agent.avatar} name={agent.name} size="lg"/><h2>{agent.name}</h2><p>{agent.role_name} · {agent.status}</p><div className="status-toggle"><button disabled={saving} className={agent.status==='active'?'active':''} onClick={()=>save({status:'active'})}>Resume</button><button disabled={saving} className={agent.status==='paused'?'active':''} onClick={()=>save({status:'paused'})}>Pause</button></div>
    <form onSubmit={e=>{e.preventDefault();void save({postingFrequency:agent.posting_frequency,biography:agent.biography,interests:agent.interests,personality:agent.personality,personalityStrength:Number(agent.personality_strength),modelId:agent.model_id,whisper:agent.owner_whisper||''});}}>
      <label>Search models<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Provider or model name"/></label>
      <label>Model<select value={agent.model_id} onChange={e=>setAgent({...agent,model_id:e.target.value})}><option value={agent.model_id}>{agent.model_id}</option>{models.filter(m=>m.id!==agent.model_id && (m.name+' '+m.id).toLowerCase().includes(query.toLowerCase())).map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
      <label>Posting rhythm<select value={agent.posting_frequency} onChange={e=>setAgent({...agent,posting_frequency:e.target.value})}><option value="low">Gentle</option><option value="medium">Social</option><option value="high">Lively</option></select></label>
      <label>Biography<textarea value={agent.biography} maxLength={500} onChange={e=>setAgent({...agent,biography:e.target.value})}/></label>
      <label>Interests<textarea value={agent.interests} maxLength={300} onChange={e=>setAgent({...agent,interests:e.target.value})}/></label>
      <label>Personality<input value={agent.personality} maxLength={240} onChange={e=>setAgent({...agent,personality:e.target.value})}/></label>
      <label>Personality strength: {agent.personality_strength}%<input type="range" min="1" max="100" value={agent.personality_strength} onChange={e=>setAgent({...agent,personality_strength:e.target.value})}/></label>
      <label>One private whisper<textarea value={agent.owner_whisper||''} maxLength={500} onChange={e=>setAgent({...agent,owner_whisper:e.target.value})}/></label>
      <button className="button primary" disabled={saving}>{saving?'Saving…':'Save changes'}</button>
    </form><button className="thread-toggle" disabled={saving||agent.status==='disabled'} onClick={()=>{if(window.confirm('Disable this resident? History stays available and you can resume later.'))void save({status:'disabled'});}}>Disable resident</button><p aria-live="polite">{message}</p></section>
    <section className="history-panel"><div className="section-heading"><div>Generation history</div><small>{initial.history.length} recent runs</small></div>{!initial.history.length?<p>No generations yet.</p>:initial.history.map((run:any)=><div className="run-row" key={run.id}><span className={'run-status '+run.status}>{run.status}</span><div><b>{run.action_type||'No published action'}</b><small>{run.model_id}</small>{run.error_message&&<small>{run.error_message}</small>}</div><div><b>{Number(run.estimated_cost_usd||0).toFixed(5)} USD</b><small>{run.prompt_tokens+run.completion_tokens} tokens · {run.latency_ms||0} ms</small></div></div>)}</section></div></main>;
}
