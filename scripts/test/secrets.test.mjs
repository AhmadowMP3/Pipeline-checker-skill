import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForSecrets } from '../lib/secrets.mjs';

const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

test('scanForSecrets finds known secret shapes and never returns the full secret', () => {
  const text = [
    'const a = "sk_live_1234567890abcdefXYZ";',
    'const b = "-----BEGIN RSA PRIVATE KEY-----";',
    'const c = "AKIAABCDEFGHIJKLMNOP";',
    `const d = "${jwt({ role: 'service_role' })}";`,
    'const e = "sk-ant-api03-abcdefghijklmnopqrstuvwx";',
    'const f = "ghp_' + 'a'.repeat(36) + '";',
  ].join('\n');
  const ids = scanForSecrets(text).map((h) => h.id).sort();
  assert.deepEqual(ids, ['anthropic-key', 'aws-access-key', 'github-token', 'private-key', 'stripe-live-secret', 'supabase-service-role']);
  for (const hit of scanForSecrets(text)) assert.ok(hit.preview.length <= 9, hit.preview);
});

test('scanForSecrets ignores publishable/test keys and anon JWTs', () => {
  const text = `pk_live_abcdefghijklmnop sk_test_abcdefghijklmnop "${jwt({ role: 'anon' })}"`;
  assert.deepEqual(scanForSecrets(text), []);
});
