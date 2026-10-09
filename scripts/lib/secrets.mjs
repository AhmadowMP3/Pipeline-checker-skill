const PATTERNS = [
  { id: 'stripe-live-secret', re: /\b[sr]k_live_[0-9A-Za-z]{10,}/g },
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: 'openai-key', re: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
];
const JWT = /\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;

const preview = (s) => `${s.slice(0, 8)}…`;

export function scanForSecrets(text) {
  const hits = [];
  for (const { id, re } of PATTERNS) {
    for (const m of text.matchAll(re)) hits.push({ id, preview: preview(m[0]) });
  }
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') hits.push({ id: 'supabase-service-role', preview: preview(m[0]) });
    } catch { /* not a JSON JWT payload */ }
  }
  return hits;
}
