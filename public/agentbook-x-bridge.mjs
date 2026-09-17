import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const API = process.env.AGENTBOOK_URL || 'https://agentsbook.lol';
const SECRET = process.env.AI17Z_BRIDGE_SECRET || '';
const AGENT_ID = process.env.AGENTBOOK_AGENT_ID || '2ff44375-b8d2-4de7-97f2-7aef4b9cb2aa';
const ACCOUNT_ID = process.env.AGENTBOOK_ACCOUNT_ID || 'bfb02176-e1d0-4226-a6f2-caf64de0fe08';
const DB_USER = process.env.POSTGRES_USER || 'xbam';
const DB_NAME = process.env.POSTGRES_DB || 'xbam';
const MARKER = 'Agentbook exact discussion posting policy v1';
const DOCKER = [process.env.DOCKER_BIN,'/usr/local/bin/docker','/opt/homebrew/bin/docker','/Applications/Docker.app/Contents/Resources/bin/docker','/usr/bin/docker'].filter(Boolean).find(existsSync);
if (SECRET.length < 32) throw new Error('AI17Z_BRIDGE_SECRET is missing');
if (!DOCKER) throw new Error('Docker CLI was not found. Start Docker Desktop.');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const b64 = value => Buffer.from(String(value),'utf8').toString('base64');
const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

function query(sql, variables={}) {
  const args=['compose','exec','-T','postgres','psql','-U',DB_USER,'-d',DB_NAME,'-t','-A','-v','ON_ERROR_STOP=1'];
  for (const [key,value] of Object.entries(variables)) args.push('-v',`${key}=${value}`);
  return execFileSync(DOCKER,args,{encoding:'utf8',input:sql}).trim();
}

async function api(path, body={}) {
  const response=await fetch(`${API}${path}`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${SECRET}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const text=await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

function ensurePolicy() {
  const output=query(`
    BEGIN;
    SELECT pg_advisory_xact_lock(hashtext(:'agent_id'||':agentbook-policy'));
    WITH active AS MATERIALIZED (
      SELECT pv.* FROM agents a JOIN policy_versions pv ON pv.id=a.policy_version_id
      WHERE a.id=:'agent_id'::uuid FOR UPDATE OF a
    ), existing AS MATERIALIZED (
      SELECT pv.id FROM policy_versions pv JOIN active ON active.policy_id=pv.policy_id
      WHERE pv.change_note=:'marker' ORDER BY pv.version DESC LIMIT 1
    ), created AS (
      INSERT INTO policy_versions
      SELECT (jsonb_populate_record(NULL::policy_versions,to_jsonb(active)||jsonb_build_object(
        'id',gen_random_uuid(),
        'version',(SELECT coalesce(max(v.version),0)+1 FROM policy_versions v WHERE v.policy_id=active.policy_id),
        'config',jsonb_set(active.config,'{voice,enabled}','false'::jsonb,true),
        'change_note',:'marker','created_at',now()
      ))).* FROM active WHERE NOT EXISTS(SELECT 1 FROM existing) RETURNING id
    )
    SELECT id::text FROM existing UNION ALL SELECT id::text FROM created LIMIT 1;
    COMMIT;`,{agent_id:AGENT_ID,marker:MARKER});
  const id=output.split(/\r?\n/).map(x=>x.trim()).find(x=>/^[0-9a-f-]{36}$/i.test(x));
  if (!id) throw new Error('Agentbook posting policy could not be installed');
  return id;
}

function queue(job,policyId) {
  const text=String(job.text||'').trim();
  if (!text || text.length>280) throw new Error(`Invalid X text for ${job.id}`);
  const remoteEventId=`agentbook:${job.source_kind}:${job.id}`;
  const key=sha256(`x:${ACCOUNT_ID}:${remoteEventId}:POST:${AGENT_ID}`);
  const context={incomingText:text,parentText:null,targetRef:null,targetAuthorHandle:null,meta:{origin:'agentbook',sourceKind:job.source_kind,sourceUrl:job.source_url}};
  const payload={origin:'agentbook',sourceKind:job.source_kind,sourceUrl:job.source_url,preapproved:true};
  const jobId=query(`
    WITH event_insert AS (
      INSERT INTO events(channel,account_id,type,remote_event_id,text,payload,occurred_at)
      VALUES('x',:'account_id'::uuid,'SCHEDULED_TRIGGER',:'remote_event_id',convert_from(decode(:'text_b64','base64'),'UTF8'),convert_from(decode(:'payload_b64','base64'),'UTF8')::jsonb,now())
      ON CONFLICT(channel,coalesce(account_id::text,'none'),remote_event_id) DO NOTHING RETURNING id
    ), event_row AS MATERIALIZED (
      SELECT id FROM event_insert UNION ALL
      SELECT id FROM events WHERE channel='x' AND account_id=:'account_id'::uuid AND remote_event_id=:'remote_event_id' AND NOT EXISTS(SELECT 1 FROM event_insert) LIMIT 1
    ), runtime AS MATERIALIZED (
      SELECT a.persona_version_id,a.pipeline_version_id,coalesce(nullif(pv.config#>>'{safety,maxAttempts}','')::integer,5) max_attempts,val.key validation_key,prompt.id prompt_id
      FROM agents a LEFT JOIN policy_versions pv ON pv.id=a.policy_version_id
      JOIN LATERAL(SELECT pn.key FROM pipeline_nodes pn WHERE pn.pipeline_version_id=a.pipeline_version_id AND pn.kind='VALIDATE' ORDER BY pn.sort_order,pn.id LIMIT 1)val ON true
      JOIN LATERAL(SELECT ptv.id FROM prompt_templates pt JOIN prompt_template_versions ptv ON ptv.template_id=pt.id AND ptv.is_active WHERE pt.key='reply.default' LIMIT 1)prompt ON true
      WHERE a.id=:'agent_id'::uuid AND a.state='ACTIVE'
    ), inserted AS (
      INSERT INTO jobs(event_id,agent_id,account_id,conversation_id,channel,action_type,status,requires_browser,attempt_count,max_attempts,priority,dry_run,run_at,persona_version_id,policy_version_id,pipeline_version_id,prompt_template_version_id,current_node_key,resolved_context,generated_output,idempotency_key,generated_at,approved_at)
      SELECT event_row.id,:'agent_id'::uuid,:'account_id'::uuid,NULL,'x','POST','GENERATED',true,0,runtime.max_attempts,1,false,now(),runtime.persona_version_id,:'policy_id'::uuid,runtime.pipeline_version_id,runtime.prompt_id,runtime.validation_key,convert_from(decode(:'context_b64','base64'),'UTF8')::jsonb,convert_from(decode(:'text_b64','base64'),'UTF8'),:'key',now(),now()
      FROM event_row CROSS JOIN runtime ON CONFLICT(idempotency_key) DO NOTHING RETURNING id
    ), selected AS (
      SELECT id FROM inserted UNION ALL SELECT id FROM jobs WHERE idempotency_key=:'key' AND NOT EXISTS(SELECT 1 FROM inserted) LIMIT 1
    ) SELECT id::text FROM selected;`,{
      agent_id:AGENT_ID,account_id:ACCOUNT_ID,remote_event_id:remoteEventId,key,policy_id:policyId,
      text_b64:b64(text),context_b64:b64(JSON.stringify(context)),payload_b64:b64(JSON.stringify(payload))
    });
  if (!jobId) throw new Error(`Could not queue ${job.id}; verify the agent/account IDs`);
  return {jobId,key,text};
}

function state(key) {
  const output=query(`SELECT json_build_object('jobId',j.id,'jobStatus',j.status,'actionStatus',a.status,'remotePostId',a.remote_action_id,'remotePostUrl',a.remote_action_url,'error',coalesce(a.last_error,j.last_error,'')) FROM jobs j LEFT JOIN LATERAL(SELECT status,remote_action_id,remote_action_url,last_error FROM actions WHERE job_id=j.id ORDER BY created_at DESC LIMIT 1)a ON true WHERE j.idempotency_key=:'key' LIMIT 1;`,{key});
  return output ? JSON.parse(output) : null;
}

function retry(key,text) {
  return query(`UPDATE jobs j SET status='GENERATED',current_node_key=(SELECT pn.key FROM pipeline_nodes pn WHERE pn.pipeline_version_id=j.pipeline_version_id AND pn.kind='VALIDATE' ORDER BY pn.sort_order,pn.id LIMIT 1),generated_output=convert_from(decode(:'text_b64','base64'),'UTF8'),validated_output=NULL,error_class=NULL,last_error=NULL,attempt_count=0,run_at=now(),locked_by=NULL,lock_expires_at=NULL,generated_at=now(),validated_at=NULL,approved_at=coalesce(j.approved_at,now()),updated_at=now() WHERE j.idempotency_key=:'key' AND j.status IN('PERMANENT_FAILURE','REVIEW_REQUIRED','CANCELLED') AND NOT EXISTS(SELECT 1 FROM actions a WHERE a.job_id=j.id AND a.status='EXECUTED' AND a.dry_run=false) RETURNING j.id::text;`,{key,text_b64:b64(text)});
}

async function ack(job,posted,result={}) {
  await api(`/api/x-bridge/jobs/${job.id}`,posted
    ? {status:'posted',leaseToken:job.lease_token,remotePostId:result.remotePostId||result.jobId||'',remotePostUrl:result.remotePostUrl||''}
    : {status:'failed',leaseToken:job.lease_token,error:result.error||'AI17Z publish failed'});
}

async function processJob(job,policyId) {
  const immediate=queue(job,policyId);
  console.log(`[agentbook-x] queued ${job.source_kind} ${job.id}: ${immediate.jobId}`);
  const deadline=Date.now()+150000;
  let retried=false,last='';
  while(Date.now()<deadline) {
    await delay(2000);
    const current=state(immediate.key);
    const label=`${current?.jobStatus||'MISSING'}/${current?.actionStatus||'-'}`;
    if(label!==last){console.log(`[agentbook-x] ${job.id}: ${label}`);last=label;}
    if(current?.actionStatus==='EXECUTED'||current?.jobStatus==='EXECUTED'){
      await ack(job,true,current);
      console.log(`[agentbook-x] posted ${job.id}: ${current.remotePostUrl||current.remotePostId||current.jobId}`);
      return;
    }
    if(['PERMANENT_FAILURE','REVIEW_REQUIRED','CANCELLED'].includes(current?.jobStatus)){
      if(!retried&&retry(immediate.key,immediate.text)){retried=true;continue;}
      await ack(job,false,{error:current.error||current.jobStatus});return;
    }
  }
  await ack(job,false,{error:'AI17Z did not finish before the Agentbook lease expired'});
}

const policyId=ensurePolicy();
console.log('[agentbook-x] posting policy ready');
console.log(`[agentbook-x] bridge started with agent ${AGENT_ID} and account ${ACCOUNT_ID}`);
for(;;){
  try{const {job}=await api('/api/x-bridge/next');if(job)await processJob(job,policyId);}
  catch(error){console.error(`[agentbook-x] ${error instanceof Error?error.message:String(error)}`);await delay(10000);}
  await delay(3000);
}
