import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson } from '../lib/fsutil.mjs';
import { fixtureServer, runScript, tempDir } from './helpers.mjs';

const ROLES = { roles: { customer: { url: '/login', fields: { '#email': 'qa@example.com', '#password': 'pw-test-123' }, submit: 'button[type=submit]' } } };

test('session.mjs writes the role cookie to a file and never prints it', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    writeJson(join(out, 'config.json'), ROLES);
    const r = await runScript('session.mjs', ['--base', server.url, '--config', join(out, 'config.json'), '--role', 'customer', '--out', out]);
    assert.equal(r.code, 0, r.stderr);
    const info = JSON.parse(r.stdout);
    assert.equal(info.landedOn, '/dashboard');
    assert.equal(readFileSync(info.file, 'utf8'), 'sid=ok');
    assert.ok(!r.stdout.includes('sid=ok'));
  } finally { await server.close(); }
});

test('session.mjs refuses deployed targets and unknown roles', async () => {
  const out = tempDir();
  writeJson(join(out, 'config.json'), ROLES);
  assert.equal((await runScript('session.mjs', ['--base', 'https://example.com', '--config', join(out, 'config.json'), '--role', 'customer', '--out', out])).code, 65);
  assert.equal((await runScript('session.mjs', ['--base', 'http://localhost:1', '--config', join(out, 'config.json'), '--role', 'admin', '--out', out])).code, 64);
});

test('session.mjs waits for JS-driven logins (fetch + location.href)', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    writeJson(join(out, 'config.json'), { roles: { customer: { ...ROLES.roles.customer, url: '/js-login' } } });
    const r = await runScript('session.mjs', ['--base', server.url, '--config', join(out, 'config.json'), '--role', 'customer', '--out', out]);
    assert.equal(r.code, 0, r.stderr);
    const info = JSON.parse(r.stdout);
    assert.equal(info.landedOn, '/dashboard');
    assert.equal(readFileSync(info.file, 'utf8'), 'sid=ok');
  } finally { await server.close(); }
});
