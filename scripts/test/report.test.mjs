import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReport, healthScore, sortFindings, renderMarkdown, renderHtml, escapeHtml } from '../lib/report-render.mjs';
import { writeJson } from '../lib/fsutil.mjs';
import { runScript, tempDir } from './helpers.mjs';

const finding = (over = {}) => ({
  id: 'PC-001', severity: 'high', title: 'Cart quantity update returns 500', category: 'connection', role: 'customer',
  where: { page: '/cart', request: 'PUT /api/cart/1' }, repro: ['Log in as customer', 'Add a product to cart', 'Change quantity to 2'],
  expected: 'Quantity 2 and updated total', actual: 'Error message; 500', confidence: 'confirmed',
  evidence: { screenshots: ['screenshots/PC-001.png'], console: ['TypeError: x'], network: ['PUT /api/cart/1 500'] },
  suspect: { file: 'app.mjs', line: 42, reason: 'assigns property on a number' }, ...over,
});
const report = (findings) => ({
  meta: {
    base: 'http://localhost:4000', runId: '2026-10-09_2200', target: 'local', scope: 'full', browser: 'builtin',
    profile: { summary: 'Small online shop with admin panel', types: ['ecommerce'], roles: ['guest', 'customer', 'admin'] },
    phases: { recon: 'done', sweep: 'done' }, notes: ['Journeys ran in built-in browser'],
  },
  coverage: { pagesSwept: 12, journeys: [{ id: 'J1', name: 'Add to cart', role: 'customer', status: 'failed' }, { id: 'J2', name: 'Checkout', role: 'customer', status: 'blocked', note: 'CAPTCHA' }] },
  findings, leftovers: ['[PC-2026-10-09_2200] Test product'],
});

test('validateReport accepts a valid report and lists precise errors', () => {
  assert.deepEqual(validateReport(report([finding()])), []);
  const errors = validateReport(report([finding({ severity: 'urgent', repro: [] }), finding({ title: undefined })]));
  assert.ok(errors.some((e) => e.includes('findings[0]') && e.includes('severity')));
  assert.ok(errors.some((e) => e.includes('findings[0]') && e.includes('repro')));
  assert.ok(errors.some((e) => e.includes('findings[1]') && e.includes('title')));
  assert.ok(errors.some((e) => e.includes('duplicate id')));
  assert.deepEqual(validateReport({ findings: [] }), ['meta.base is required']);
});

test('healthScore and sortFindings', () => {
  const fs = [finding({ id: 'PC-010', severity: 'low' }), finding({ id: 'PC-002', severity: 'critical' }), finding({ id: 'PC-001', severity: 'low' })];
  assert.equal(healthScore(fs), 73);
  assert.deepEqual(sortFindings(fs).map((f) => f.id), ['PC-002', 'PC-001', 'PC-010']);
  assert.equal(healthScore(Array(10).fill(finding({ severity: 'critical' }))), 0);
});

test('renderMarkdown includes profile, summary, repro, suspect, role, coverage, leftovers', () => {
  const md = renderMarkdown(report([finding()]));
  for (const s of ['Small online shop with admin panel', 'ecommerce', 'Health score:** 90/100', '[HIGH] PC-001', '**Role:** customer', '1. Log in as customer', '`app.mjs:42`', 'Add to cart', 'blocked', 'Test product', 'Journeys ran in built-in browser'])
    assert.ok(md.includes(s), s);
});

test('renderHtml escapes hostile evidence text', () => {
  const html = renderHtml(report([finding({ actual: '<script>alert(1)</script>', title: 'a & b' })]), '<title>{{TITLE}}</title><body>{{BODY}}</body>');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.equal(escapeHtml(`"'`), '&quot;&#39;');
});

test('report CLI writes md + html; rejects invalid findings', async () => {
  const run = tempDir();
  writeJson(join(run, 'findings.json'), report([finding()]));
  const ok = await runScript('report.mjs', ['--run', run]);
  assert.equal(ok.code, 0, ok.stderr);
  assert.ok(existsSync(join(run, 'report.md')));
  assert.ok(readFileSync(join(run, 'report.html'), 'utf8').includes('PC-001'));

  writeJson(join(run, 'findings.json'), report([finding({ severity: 'nope' })]));
  const bad = await runScript('report.mjs', ['--run', run]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /severity/);
});
