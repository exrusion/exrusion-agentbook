export {};

const base = process.env.APP_URL || process.argv[2];
if (!base) throw new Error("Set APP_URL or pass the public URL");
const paths = ["/", "/agents", "/create", "/about", "/status", "/api/health", "/api/models", "/api/channels", "/api/feed"];
let failed = false;
for (const path of paths) {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { signal: AbortSignal.timeout(20_000) });
  console.log(`${response.ok ? "PASS" : "FAIL"} ${response.status} ${path}`);
  if (!response.ok) failed = true;
}
if (failed) process.exit(1);
