import { db } from '../lib/db';
import { runWorkerCycle } from '../lib/worker';

export async function acceptance() {
  const sql=db();
  const [done]=await sql`select value from system_settings where key='acceptance_v1'`;
  if(done?.value?.passed) return;
  const results:Record<string,boolean>={};
  const base=process.env.APP_URL!;
  let token='',agentId='',slug='';
  async function check(name:string,ok:boolean) { results[name]=ok; console.log(JSON.stringify({event:'acceptance',name,passed:ok})); if(!ok) throw new Error('Acceptance failed: '+name); }
  try {
    for(const path of ['/','/create','/agents','/about','/status']) {
      const r=await fetch(base+path,{signal:AbortSignal.timeout(20000)});
      await check('route '+path,r.ok);
    }
    const mr=await fetch(base+'/api/models'); const models=(await mr.json()).models||[];
    await check('live model catalogue',mr.ok && models.length>20);
    const model=models.find((m:any)=>m.id==='openai/gpt-4o-mini') || models.find((m:any)=>m.provider==='OpenAI' && Number(m.pricing?.prompt)<0.000002);
    await check('test model available',!!model);
    const cr=await fetch(base+'/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Beta Check '+Date.now().toString(36),avatar:'B',modelId:model.id,roleSlug:'builder',personality:'friendly, practical',interests:'small community projects',biography:'An explicitly labelled beta verification resident. For my first turn I propose one concrete town project in a CREATE_POST action.',postingFrequency:'low',inviteCode:process.env.BETA_INVITE_CODE||''})});
    const created=await cr.json(); await check('create agent API',cr.status===201);
    token=created.ownerToken;agentId=created.agent.id;slug=created.agent.slug;
    const profile=await fetch(base+'/api/agents/'+slug); const publicBody=await profile.text();
    await check('persisted profile',profile.ok && publicBody.includes(model.id));
    await check('owner token absent from public profile',!publicBody.includes(token) && !publicBody.includes('owner_whisper') && !publicBody.includes(process.env.OPENROUTER_API_KEY!));
    await check('profile page',(await fetch(base+'/agent/'+slug)).ok);
    const previous=process.env.AUTONOMY_ENABLED;process.env.AUTONOMY_ENABLED='true';
    try {
      const firstCycle=await runWorkerCycle({onlyAgentId:agentId});
      console.log(JSON.stringify({event:'acceptance_generation',message:'Generation diagnostic',...firstCycle}));
      const [run]=await sql`select status,action_type,model_id,prompt_tokens,completion_tokens from generation_runs where agent_id=${agentId} order by created_at desc limit 1`;
      await check('real structured generation',run?.status==='completed' && run?.model_id===model.id && run.prompt_tokens+run.completion_tokens>0);
      const [post]=await sql`select id from posts where agent_id=${agentId} limit 1`;
      await check('real post persisted',!!post);
      const feed=await (await fetch(base+'/api/feed')).json();
      await check('post visible in public feed',feed.posts.some((p:any)=>p.id===post.id && p.agent.roleSlug==='builder' && p.agent.modelId===model.id));
      await check('management page',(await fetch(base+'/manage/'+token)).ok);
      const pause=await fetch(base+'/api/manage/'+token,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'paused'})});
      await check('owner pause',pause.ok);
      await sql`update agents set next_action_at=now() where id=${agentId}`;
      const cycle=await runWorkerCycle({onlyAgentId:agentId});
      await check('worker respects paused state',cycle.actions.length===0);
      await check('invalid owner denied',(await fetch(base+'/api/manage/invalid-token')).status===404);
      await check('worker endpoint protected',(await fetch(base+'/api/worker/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status===401);
    } finally {process.env.AUTONOMY_ENABLED=previous;}
    const health=await (await fetch(base+'/api/health')).json();
    await check('independent health checks',health.services.frontend.ok && health.services.database.ok && health.services.openrouter.ok && health.services.worker.ok);
    await sql`insert into system_settings(key,value) values('acceptance_v1',${sql.json({passed:true,checkedAt:new Date().toISOString(),results})}) on conflict(key) do update set value=excluded.value,updated_at=now()`;
  } catch(error) {
    console.log(JSON.stringify({event:'acceptance_failed',message:error instanceof Error?error.message:'Test failed'}));
    await sql`insert into system_settings(key,value) values('acceptance_v1',${sql.json({passed:false,checkedAt:new Date().toISOString(),results})}) on conflict(key) do update set value=excluded.value,updated_at=now()`;
  } finally {if(agentId) await sql`update agents set status='paused' where id=${agentId}`;}
}
