import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson } from '../lib/fsutil.mjs';
import { fixtureServer, runScript, tempDir } from './helpers.mjs';

const find = (pages, suffix, vp = 'desktop') => pages.find((p) => p.url.endsWith(suffix) && p.viewport === vp);

test('sweep collects console, network, links, images, a11y, secrets, challenges, screenshots', { timeout: 240000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    const config = join(out, 'config.json');
    writeJson(config, { exclude: ['/admin'] });
    const r = await runScript('sweep.mjs', ['--base', server.url, '--out', out, '--config', config, '--max-pages', '14']);
    assert.equal(r.code, 0, r.stderr);
    const s = readJson(join(out, 'sweep-anon.json'));
    assert.equal(s.loggedInAs, null);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.brokenInternal, 2, 'linked /missing 404 and /denied 403 count as broken internal links');
    assert.equal(summary.redirected, 2, '/private (server) and /spa-guard (client-side) redirects are counted');
    assert.ok(find(s.pages, '/spa-guard').finalUrl.endsWith('/login'), 'client-side auth redirect captured (review I3)');
    assert.equal(find(s.pages, '/denied').challenge, false, "app's own 403 is not a bot challenge (review M1)");
    const spam = find(s.pages, '/spam');
    assert.equal(spam.console.length, 50, 'console evidence capped (review I9)');
    assert.ok(spam.console.some((c) => c.text === 'spam 0' && c.count === 100), 'repeated console text deduped with count');
    assert.equal(spam.dropped.console, 73);
    const guarded = s.linkChecks.find((l) => l.url.endsWith('/guarded.pdf'));
    assert.equal(guarded.ok, null, '403 on a link check is unverifiable, not broken (review M2)');
    assert.equal(guarded.unverifiable, true);

    assert.ok(find(s.pages, '/about').pageErrors.some((e) => e.includes('kaboom')));
    const missing = find(s.pages, '/missing');
    assert.equal(missing.status, 404);
    assert.equal(missing.linkedFrom, `${server.url}/`);
    assert.equal(missing.challenge, false);
    assert.equal(find(s.pages, '/challenge').challenge, true);
    assert.ok(s.skipped.some((x) => x.url.endsWith('/logout') && x.reason === 'dangerous-link'));
    assert.ok(s.skipped.some((x) => x.url.endsWith('/admin/panel') && x.reason === 'excluded'));
    assert.ok(find(s.pages, '/private').finalUrl.endsWith('/login'));
    assert.ok(find(s.pages, '#/hash-page'));

    const home = find(s.pages, `${server.url}/`);
    assert.ok(home.brokenImages.some((u) => u.endsWith('/nope.png')));
    assert.ok(home.badResponses.some((b) => b.url.endsWith('/api/fail') && b.status === 500 && b.body.includes('db down')));
    assert.ok(home.a11y.some((v) => v.id === 'image-alt'));
    assert.ok(existsSync(join(out, home.screenshot)));
    assert.ok(find(s.pages, `${server.url}/`, 'mobile'), 'mobile viewport visited');

    assert.ok(s.secrets.some((x) => x.id === 'stripe-live-secret' && x.url.endsWith('/app.js')));
    assert.ok(!JSON.stringify(s).includes('sk_live_1234567890abcdefXYZ'), 'full secret must not be stored');
    assert.ok(s.linkChecks.some((l) => l.url.endsWith('/file.pdf') && l.status === 404 && l.ok === false));
  } finally { await server.close(); }
});

test('sweep respects --max-pages and reports truncation', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    const r = await runScript('sweep.mjs', ['--base', `${server.url}/n/1`, '--out', out, '--max-pages', '3', '--no-mobile']);
    assert.equal(r.code, 0, r.stderr);
    const s = readJson(join(out, 'sweep-anon.json'));
    assert.equal(s.pages.length, 3);
    assert.ok(s.truncated > 0);
  } finally { await server.close(); }
});

test('sweep --role logs in via config.roles before crawling', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    const config = join(out, 'config.json');
    writeJson(config, { roles: { customer: { url: '/login', fields: { '#email': 'qa@example.com', '#password': 'pw-test-123' }, submit: 'button[type=submit]' } } });
    const r = await runScript('sweep.mjs', ['--base', `${server.url}/dashboard`, '--out', out, '--config', config, '--role', 'customer', '--max-pages', '2', '--no-mobile']);
    assert.equal(r.code, 0, r.stderr);
    const s = readJson(join(out, 'sweep-customer.json'));
    assert.equal(s.loggedInAs, 'customer');
    assert.ok(find(s.pages, '/dashboard').finalUrl.endsWith('/dashboard'));
  } finally { await server.close(); }
});

test('sweep --role refuses deployed targets', async () => {
  const out = tempDir();
  const config = join(out, 'config.json');
  writeJson(config, { roles: { customer: { url: '/login', fields: {}, submit: 'button' } } });
  const r = await runScript('sweep.mjs', ['--base', 'https://example.com', '--out', out, '--config', config, '--role', 'customer']);
  assert.equal(r.code, 65);
});

test('sweep --role fails loudly when login does not work (review I4)', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    const config = join(out, 'config.json');
    writeJson(config, { roles: { customer: { url: '/login', fields: { '#email': 'qa@example.com', '#password': 'wrong' }, submit: 'button[type=submit]' } } });
    const r = await runScript('sweep.mjs', ['--base', server.url, '--out', out, '--config', config, '--role', 'customer', '--max-pages', '2', '--no-mobile']);
    assert.equal(r.code, 1);
    const s = readJson(join(out, 'sweep-customer.json'));
    assert.equal(s.loggedInAs, null);
    assert.match(s.error, /login failed for role "customer"/);
  } finally { await server.close(); }
});

test('sweep survives a page that blocks its main thread (review I1)', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    const r = await runScript('sweep.mjs', ['--base', `${server.url}/busy-after-load`, '--out', out, '--max-pages', '1', '--no-mobile', '--timeout', '3000']);
    assert.equal(r.code, 0, r.stderr);
    const s = readJson(join(out, 'sweep-anon.json'));
    assert.match(s.pages[0].error, /deadline/);
  } finally { await server.close(); }
});

test('sweep stops at --max-minutes and reports the budget (review I1)', { timeout: 120000 }, async () => {
  const server = await fixtureServer();
  try {
    const out = tempDir();
    const r = await runScript('sweep.mjs', ['--base', `${server.url}/n/1`, '--out', out, '--max-pages', '50', '--no-mobile', '--concurrency', '1', '--max-minutes', '0.05']);
    assert.equal(r.code, 0, r.stderr);
    const s = readJson(join(out, 'sweep-anon.json'));
    assert.equal(s.budgetExceeded, true);
    assert.ok(s.pages.length < 50 && s.truncated > 0);
  } finally { await server.close(); }
});
