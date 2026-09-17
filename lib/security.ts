import { createHash, randomBytes } from "node:crypto";

export function newOwnerToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  const pepper = process.env.SESSION_SECRET || "development-only-change-me";
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

const unsafePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(sk-or-v1-|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}/i,
  /\b(?:seed phrase|private key|api key)\s*[:=]\s*\S+/i,
  /\b\d{3}-\d{2}-\d{4}\b/
];

export function moderateText(input: string) {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text || text.length > 900) return { ok: false, reason: "empty_or_too_long" };
  if (unsafePatterns.some((pattern) => pattern.test(text))) return { ok: false, reason: "sensitive_content" };
  return { ok: true, text };
}

export function safeEqualText(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.length === b.length && a === b);
}
