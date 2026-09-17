import { accounts as accountsRepo, closePool } from '@xbam/database';
import { getChannelAdapter } from '@xbam/channels';
import { buildChannelContext } from '@xbam/runtime';
import { loadEnv } from '@xbam/shared';

loadEnv();
const source = process.env.AGENTBOOK_URL || 'https://agentsbook.lol';
const secret = process.env.AI17Z_BRIDGE_SECRET || '';
const wanted = (process.env.AGENTBOOK_X_HANDLE || 'AgentsBooklol').replace(/^@/, '').toLowerCase();
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function request(path: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`${source}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json() as Promise<any>;
}

async function xAccount() {
  const connected = (await accountsRepo.allAccounts()).filter(a => a.channel === 'x' && a.enabled && a.status === 'CONNECTED');
  const exact = connected.find(a => a.handle.replace(/^@/, '').toLowerCase() === wanted);
  if (exact) return exact;
  if (connected.length === 1) return connected[0];
  throw new Error(`No connected @${wanted} X session. Connected: ${connected.map(a=>`@${a.handle}`).join(', ') || 'none'}`);
}

async function run() {
  if (secret.length < 32) throw new Error('AI17Z_BRIDGE_SECRET is missing');
  const account = await xAccount();
  console.log(`[agentbook-x] using @${account.handle}`);
  for (;;) {
    try {
      const { job } = await request('/api/x-bridge/next');
      if (!job) { await pause(10_000); continue; }
      try {
        const adapter = getChannelAdapter(account.channel);
        const context = await buildChannelContext(account, null);
        const action = { type: 'POST' as const, targetRef: '', text: job.text, idempotencyKey: `agentbook:${job.id}`, dryRun: false };
        const verification = await adapter.verifyAction(context, action);
        if (!verification.verified) throw new Error(verification.detail);
        const result = await adapter.executeAction(context, action);
        await request(`/api/x-bridge/jobs/${job.id}`, {
          status: 'posted', leaseToken: job.lease_token,
          remotePostId: result.remoteActionId, remotePostUrl: result.remoteActionUrl,
        });
        console.log(`[agentbook-x] posted ${job.source_kind}: ${result.remoteActionUrl || result.remoteActionId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await request(`/api/x-bridge/jobs/${job.id}`, { status: 'failed', leaseToken: job.lease_token, error: message }).catch(()=>undefined);
        console.error(`[agentbook-x] publish failed: ${message}`);
        await pause(15_000);
      }
    } catch (error) {
      console.error(`[agentbook-x] ${error instanceof Error ? error.message : String(error)}`);
      await pause(15_000);
    }
  }
}

run().catch(async error => { console.error(error); await closePool().catch(()=>undefined); process.exit(1); });
