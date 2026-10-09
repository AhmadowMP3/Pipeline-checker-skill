import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkSecurityHeaders } from '../lib/headers.mjs';
import { parseEnvNames, diffEnv } from '../lib/env.mjs';
import { readJson, writeJson } from '../lib/fsutil.mjs';
import { runScript, startServer, tempDir } from './helpers.mjs';

test('checkSecurityHeaders flags missing headers; HSTS only on https', () => {
  const ids = (h, https) => checkSecurityHeaders(h, { https }).map((i) => i.id).sort();
  assert.deepEqual(ids({}, false), ['clickjacking', 'missing-csp', 'missing-nosniff', 'missing-referrer-policy']);
  assert.ok(ids({}, true).includes('missing-hsts'));
  const good = {
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=1',
  };
  assert.deepEqual(ids(good, true), []);
  assert.ok(ids({ ...good, 'X-Powered-By': 'Express' }, true).includes('x-powered-by'));
});

test('parseEnvNames and diffEnv', () => {
  const names = parseEnvNames('# comment\nA=1\nexport B="x"\n  C = y\nnot a var\n');
  assert.deepEqual(names, ['A', 'B', 'C']);
  assert.deepEqual(diffEnv(['C', 'Z', 'A', 'Y'], new Set(names)), ['Y', 'Z']);
});

test('preflight CLI: redirects, headers, robots/sitemap, routes, env', async () => {
  const server = await startServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/') { res.writeHead(301, { location: '/home' }); return res.end(); }
    if (path === '/home') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<h1>home</h1>'); }
    if (path === '/robots.txt') { res.writeHead(200); return res.end('User-agent: *'); }
    res.writeHead(404); res.end();
  });
  try {
    const project = tempDir();
    const out = tempDir();
    writeFileSync(join(project, '.env'), 'A=secret-value\n');
    const appMapPath = join(out, 'app-map.json');
    writeJson(appMapPath, {
      routes: [{ path: '/home' }, { path: '/posts/[id]' }, { path: '/gone' }],
      env: { referenced: ['A', 'B'] },
    });
    const r = await runScript('preflight.mjs', ['--url', server.url, '--out', out, '--project', project, '--app-map', appMapPath]);
    assert.equal(r.code, 0, r.stderr);
    const p = readJson(join(out, 'preflight.json'));
    assert.equal(p.reachable, true);
    assert.equal(p.target, 'local');
    assert.equal(p.redirects.length, 1);
    assert.ok(p.finalUrl.endsWith('/home'));
    assert.equal(p.tls, null);
    assert.ok(p.headerIssues.some((i) => i.id === 'missing-csp'));
    assert.ok(!p.headerIssues.some((i) => i.id === 'missing-hsts'));
    assert.equal(p.robots, true);
    assert.equal(p.sitemap, false);
    assert.deepEqual(p.routes.map((x) => [x.path, x.ok]), [['/home', true], ['/gone', false]]);
    assert.deepEqual(p.env.missing, ['B']);
    assert.ok(!JSON.stringify(p).includes('secret-value'), 'env values must never be stored');
  } finally { await server.close(); }
});

test('preflight CLI: unreachable target exits 2 with error', async () => {
  const out = tempDir();
  const r = await runScript('preflight.mjs', ['--url', 'http://127.0.0.1:1', '--out', out]);
  assert.equal(r.code, 2);
  const p = readJson(join(out, 'preflight.json'));
  assert.equal(p.reachable, false);
  assert.ok(p.error);
});
