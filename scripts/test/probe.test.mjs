import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from '../lib/fsutil.mjs';
import { runScript, startServer, tempDir } from './helpers.mjs';

function apiServer() {
  return startServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const send = (status, headers = {}) => { res.writeHead(status, headers); res.end(); };
    const cookie = req.headers.cookie ?? '';
    const hasSid = /sid=/.test(cookie);
    if (path === '/api/cors-bad' && req.method === 'OPTIONS') {
      return send(204, { 'access-control-allow-origin': req.headers.origin, 'access-control-allow-credentials': 'true' });
    }
    if (req.method === 'OPTIONS') return send(204);
    if (path === '/api/open') return send(200);
    if (path === '/api/secure') return send(hasSid ? 200 : 401);
    if (path === '/api/leaky') return send(200);
    if (path === '/api/redirecting') return send(302, { location: '/login?next=/x' });
    if (path === '/api/broken') return send(500);
    if (path === '/api/items' && req.method === 'POST') return send(400);
    if (path === '/api/items/1' && req.method === 'GET') return send(hasSid ? 200 : 403);
    if (path === '/api/cors-bad') return send(200);
    if (path === '/api/logout' && req.method === 'POST') return send(200);
    if (path === '/api/logout-csrf' && req.method === 'POST') return send(419);
    if (path === '/api/admin/stats') return send(hasSid ? 200 : 401);
    if (path === '/api/admin/users') return send(/sid=admin/.test(cookie) ? 200 : 403);
    if (path === '/api/admin/products' && req.method === 'POST') return send(hasSid ? 400 : 401);
    return send(404);
  });
}

const APP_MAP = {
  auth: { logout: { method: 'POST', path: '/api/logout' } },
  endpoints: [
    { method: 'GET', path: '/api/open', auth: false },
    { method: 'GET', path: '/api/secure', auth: true },
    { method: 'GET', path: '/api/leaky', auth: true },
    { method: 'GET', path: '/api/redirecting', auth: true },
    { method: 'GET', path: '/api/broken', auth: false },
    { method: 'POST', path: '/api/items', auth: true },
    { method: 'GET', path: '/api/items/[id]', auth: true },
    { method: 'GET', path: '/api/cors-bad', auth: false },
    { method: 'GET', path: '/api/admin/stats', auth: true, role: 'admin' },
    { method: 'GET', path: '/api/admin/users', auth: true, role: 'admin' },
    { method: 'POST', path: '/api/admin/products', auth: true, role: 'admin' },
  ],
};

const verdictOf = (p, method, path) => p.endpoints.find((e) => e.method === method && e.path === path).verdict;

async function probe(extra, appMap = APP_MAP) {
  const server = await apiServer();
  try {
    const out = tempDir();
    writeJson(join(out, 'app-map.json'), appMap);
    writeFileSync(join(out, 'customer.cookie'), 'sid=cust');
    const args = extra(out);
    const r = await runScript('probe.mjs', ['--base', server.url, '--app-map', join(out, 'app-map.json'), '--out', out, ...args]);
    return { r, out };
  } finally { await server.close(); }
}

test('anonymous probe: auth enforcement, server errors, CORS, write skipping', async () => {
  const { r, out } = await probe(() => []);
  assert.equal(r.code, 0, r.stderr);
  const p = readJson(join(out, 'probe-anon.json'));
  assert.equal(verdictOf(p, 'GET', '/api/open'), 'OK');
  assert.equal(verdictOf(p, 'GET', '/api/secure'), 'ENFORCED');
  assert.equal(verdictOf(p, 'GET', '/api/leaky'), 'UNPROTECTED');
  assert.equal(verdictOf(p, 'GET', '/api/redirecting'), 'ENFORCED');
  assert.equal(verdictOf(p, 'GET', '/api/broken'), 'SERVER_ERROR');
  assert.equal(verdictOf(p, 'POST', '/api/items'), 'SKIPPED_WRITE');
  assert.equal(verdictOf(p, 'GET', '/api/items/[id]'), 'ENFORCED');
  assert.equal(verdictOf(p, 'GET', '/api/admin/stats'), 'ENFORCED');
  assert.deepEqual(p.cors.map((c) => [c.path, c.issue]), [['/api/cors-bad', 'reflects-origin-with-credentials']]);
});

test('anonymous probe with --allow-writes flags validation-before-auth', async () => {
  const { r, out } = await probe(() => ['--allow-writes']);
  assert.equal(r.code, 0, r.stderr);
  const p = readJson(join(out, 'probe-anon.json'));
  assert.equal(verdictOf(p, 'POST', '/api/items'), 'UNPROTECTED_LIKELY');
});

test('session probe as customer: role bypass, own writes skipped, stale session', async () => {
  const { r, out } = await probe((dir) => ['--cookie-file', join(dir, 'customer.cookie'), '--as-role', 'customer', '--allow-writes', '--stale-check']);
  assert.equal(r.code, 0, r.stderr);
  const p = readJson(join(out, 'probe-customer.json'));
  assert.equal(p.asRole, 'customer');
  assert.equal(verdictOf(p, 'GET', '/api/admin/stats'), 'ROLE_BYPASS');
  assert.equal(verdictOf(p, 'GET', '/api/admin/users'), 'ROLE_ENFORCED');
  assert.equal(verdictOf(p, 'POST', '/api/admin/products'), 'ROLE_BYPASS_LIKELY');
  assert.equal(verdictOf(p, 'GET', '/api/secure'), 'OK');
  assert.equal(verdictOf(p, 'POST', '/api/items'), 'SKIPPED_WRITE');
  assert.deepEqual(p.cors, []);
  assert.equal(p.staleSession.find((s) => s.path === '/api/secure').verdict, 'STALE_ACCEPTED');
  assert.ok(!p.staleSession.some((s) => s.path.startsWith('/api/admin')), 'stale check skips foreign-role endpoints');
  assert.ok(!p.staleSession.some((s) => s.method !== 'GET'), 'stale check uses safe methods only');
});

test('probe flag validation', async () => {
  const { r } = await probe(() => ['--stale-check']);
  assert.equal(r.code, 64);
});

test('stale check reports a rejected logout instead of STALE_ACCEPTED (review I6)', async () => {
  const appMap = { ...APP_MAP, auth: { logout: { method: 'POST', path: '/api/logout-csrf' } } };
  const { r, out } = await probe((dir) => ['--cookie-file', join(dir, 'customer.cookie'), '--as-role', 'customer', '--stale-check'], appMap);
  assert.equal(r.code, 0, r.stderr);
  const p = readJson(join(out, 'probe-customer.json'));
  assert.equal(p.logoutStatus, 419);
  assert.ok(p.staleError.startsWith("logout rejected (419)"), p.staleError);
  assert.deepEqual(p.staleSession, []);
});
