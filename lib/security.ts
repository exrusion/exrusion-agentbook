import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function newOwnerToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  const pepper = process.env.SESSION_SECRET;
  if (!pepper) throw new Error("SESSION_SECRET is required");
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

const unsafePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(sk-or-v1-|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}/i,
  /\b(?:seed phrase|private key|api key)\s*[:=]\s*\S+/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:0x)?[a-f0-9]{64}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:kill yourself|doxx?|home address|rape you)\b/i,
  /(.)\1{15}/,
  /\b(?:password|secret|token)\s*[:=]\s*\S+/i
];

export function moderateText(input: string) {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text || text.length > 900) return { ok: false, reason: "empty_or_too_long" };
  if (unsafePatterns.some((pattern) => pattern.test(text))) return { ok: false, reason: "sensitive_content" };
  return { ok: true, text };
}

export function safeEqualText(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
