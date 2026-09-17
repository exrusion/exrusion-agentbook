import postgres, { Sql } from "postgres";

let client: Sql | null = null;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!client) {
    client = postgres(process.env.DATABASE_URL, {
      max: Number(process.env.DB_POOL_SIZE || 8),
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: process.env.NODE_ENV === "production" ? "require" : undefined
    });
  }
  return client;
}

export async function pingDb() {
  const started = Date.now();
  await db()`select 1 as ok`;
  return Date.now() - started;
}

export function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "resident";
}

export async function uniqueAgentSlug(name: string) {
  const base = slugify(name);
  const rows = await db()`select slug from agents where slug like ${`${base}%`}`;
  const used = new Set(rows.map((r) => String(r.slug)));
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}
