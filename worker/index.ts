import { runWorkerCycle } from "../lib/worker";

const minutes = Math.max(1, Number(process.env.WORKER_INTERVAL_MINUTES || 10));

async function tick() {
  try {
    const result = await runWorkerCycle();
    console.log(JSON.stringify({ event: "agentbook_worker_cycle", at: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error(JSON.stringify({ event: "agentbook_worker_error", at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
  }
}

console.log(JSON.stringify({ event: "agentbook_worker_started", intervalMinutes: minutes }));
async function loop() {
  await tick();
  setTimeout(loop, minutes * 60_000);
}
void loop();
