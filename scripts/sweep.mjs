#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import axePkg from '@axe-core/playwright';
import { parseArgs } from './lib/args.mjs';
import { classifyTarget } from './lib/target.mjs';
import { readJson, writeJson, fileSlug } from './lib/fsutil.mjs';
import { normalizeUrl, isSameOrigin, isDangerousLink, isExcluded, routeToSamplePath, routePath } from './lib/url.mjs';
import { scanForSecrets } from './lib/secrets.mjs';
import { loginWithConfig } from './lib/login.mjs';

const AxeBuilder = axePkg.AxeBuilder ?? axePkg.default ?? axePkg;
const VIEWPORTS = { desktop: { width: 1366, height: 768 }, mobile: { width: 390, height: 844 } };
const ASSET_EXT = /\.(pdf|zip|gz|tar|dmg|exe|png|jpe?g|gif|svg|webp|ico|mp4|mp3|webm|woff2?|ttf|css|js|json|xml|txt)$/i;
// Vendor/interstitial markers only: an app's own "Access denied" 403 is not a bot challenge.
const CHALLENGE_TEXT = /just a moment|checking your browser|verify you are (a )?human|cf-chl|_cf_chl|challenge-platform|px-captcha|datadome/i;
const CHALLENGE_STATUS = new Set([403, 429, 503]);
const UNVERIFIABLE_STATUS = new Set([401, 403, 429, 999]);
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_LINK_CHECKS = 100;
const MAX_EVIDENCE = 50;
const WRITE_EVERY = 10;
const CLS_SCRIPT = `window.__pcCls=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__pcCls+=e.value}}).observe({type:'layout-shift',buffered:true})}catch{}`;

const args = parseArgs(process.argv.slice(2));
if (!args.base || !args.out) {
  console.error('usage: node sweep.mjs --base <url> --out <runDir> [--app-map p] [--config p] [--role name] [--label name] [--max-pages 150] [--max-minutes 0] [--timeout 20000] [--concurrency 2] [--no-mobile]');
  process.exit(64);
}

const base = normalizeUrl(args.base);
const out = args.out;
const config = args.config ? readJson(args.config) : {};
const role = typeof args.role === 'string' ? args.role : null;
const label = args.label ?? role ?? 'anon';
const maxPages = Number(args['max-pages'] ?? config.limits?.maxPages ?? 150);
const maxMinutes = Number(args['max-minutes'] ?? config.limits?.maxMinutes ?? 0);
const timeout = Number(args.timeout ?? config.limits?.timeoutMs ?? 20000);
const pageDeadline = timeout * 2 + 10000;
const concurrency = Number(args.concurrency ?? 2);
const viewports = args['no-mobile'] ? ['desktop'] : ['desktop', 'mobile'];
const exclude = config.exclude ?? [];
const appMap = args['app-map'] ? readJson(args['app-map']) : null;
const roleConfig = role ? config.roles?.[role] : null;
const outFile = join(out, `sweep-${label}.json`);
const startedMs = Date.now();

if (role && classifyTarget(base) !== 'local') {
  console.error('Refusing --role on a deployed target: credentials are only entered on local targets.');
  process.exit(65);
}
if (role && !roleConfig) {
  console.error(`--role ${role} requires config.roles.${role} = { url, fields, submit }`);
  process.exit(64);
}

const result = {
  base, label, loggedInAs: role, startedAt: new Date().toISOString(), finishedAt: null,
  limits: { maxPages, maxMinutes, timeout, pageDeadline, concurrency, viewports },
  pages: [], skipped: [], linkChecks: [], secrets: [], truncated: 0, budgetExceeded: false, error: null,
};
const queue = [];
const seen = new Set();
const linkedFrom = new Map();
const checkOnly = new Map();
const scannedScripts = new Set();
let visited = 0;

const budgetExceeded = () => maxMinutes > 0 && Date.now() - startedMs > maxMinutes * 60000;

function enqueue(url, from) {
  if (!url || seen.has(url)) return;
  seen.add(url);
  if (!isSameOrigin(url, base) || ASSET_EXT.test(new URL(url).pathname)) { checkOnly.set(url, from); return; }
  if (isDangerousLink(url)) { result.skipped.push({ url, from, reason: 'dangerous-link' }); return; }
  if (isExcluded(url, exclude)) { result.skipped.push({ url, from, reason: 'excluded' }); return; }
  if (from) linkedFrom.set(url, from);
  queue.push(url);
}

function emptyRecord(url, viewport) {
  return {
    url, viewport, linkedFrom: linkedFrom.get(url) ?? null, status: null, finalUrl: null, challenge: false,
    console: [], pageErrors: [], failedRequests: [], badResponses: [], brokenImages: [], mixedContent: [],
    a11y: [], timing: null, cls: null, screenshot: null, error: null, dropped: {},
  };
}

// Bounded evidence: repeated text is counted, distinct entries stop at MAX_EVIDENCE.
function addEvidence(rec, key, item, text) {
  const list = rec[key];
  if (text !== undefined) {
    const same = list.find((x) => (typeof x === 'string' ? x : x.text) === text);
    if (same) { if (typeof same === 'object') same.count++; return; }
  }
  if (list.length >= MAX_EVIDENCE) { rec.dropped[key] = (rec.dropped[key] ?? 0) + 1; return; }
  list.push(item);
}

// response.text() never settles for documents the page already navigated away from (client-side redirects).
function bodyText(response, ms = 3000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('body read timeout')), ms); });
  return Promise.race([response.text(), timeoutPromise]).finally(() => clearTimeout(timer));
}

async function inspectResponse(response, rec) {
  const url = response.url();
  const status = response.status();
  if (base.startsWith('https:') && url.startsWith('http:')) addEvidence(rec, 'mixedContent', url, url);
  if (status >= 400) {
    let body = '';
    try { body = (await bodyText(response)).slice(0, 300); } catch { /* body unavailable */ }
    addEvidence(rec, 'badResponses', { url, method: response.request().method(), status, body });
  }
  const type = response.headers()['content-type'] ?? '';
  if (/javascript/.test(type) && isSameOrigin(url, base) && !scannedScripts.has(url)) {
    scannedScripts.add(url);
    try { for (const hit of scanForSecrets(await bodyText(response))) result.secrets.push({ ...hit, url }); } catch { /* body unavailable */ }
  }
}

async function runAxe(page) {
  try {
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    return res.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  } catch (e) {
    return [{ id: 'axe-failed', impact: null, help: String(e.message).slice(0, 200), count: 0, targets: [] }];
  }
}

async function visit(page, rec) {
  const { url, viewport } = rec;
  const pending = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text().slice(0, 500);
    addEvidence(rec, 'console', { type: m.type(), text, count: 1 }, text);
  });
  page.on('pageerror', (e) => { const text = String(e.message ?? e).slice(0, 500); addEvidence(rec, 'pageErrors', text, text); });
  page.on('requestfailed', (r) => addEvidence(rec, 'failedRequests', { url: r.url(), method: r.method(), error: r.failure()?.errorText ?? 'unknown' }));
  page.on('response', (r) => pending.push(inspectResponse(r, rec)));
  let links = [];
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    rec.status = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    // Read the URL after network settles so client-side auth redirects (fetch /me → /login) are captured.
    rec.finalUrl = page.url();
    const text = await page.evaluate(() => `${document.title} ${(document.body?.innerText ?? '').slice(0, 1500)}`);
    rec.challenge = CHALLENGE_STATUS.has(rec.status) && CHALLENGE_TEXT.test(text);
    rec.timing = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
    });
    rec.cls = await page.evaluate(() => Math.round((window.__pcCls ?? 0) * 1000) / 1000);
    rec.brokenImages = await page.evaluate(() => [...document.images].filter((i) => i.src && i.complete && i.naturalWidth === 0).map((i) => i.src).slice(0, 50));
    if (viewport === 'desktop' && !rec.challenge) {
      links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
      rec.a11y = await runAxe(page);
    }
    const u = new URL(url);
    const shot = `screenshots/sweep-${label}-${viewport}-${fileSlug(u.pathname + u.search + u.hash)}.png`;
    await page.screenshot({ path: join(out, shot), fullPage: true });
    rec.screenshot = shot;
  } catch (e) {
    rec.error ??= String(e.message).split('\n')[0];
  }
  await Promise.allSettled(pending);
  await page.close().catch(() => {});
  return { rec, links };
}

// A page that blocks its main thread can hang evaluate()/axe forever; the deadline closes it and moves on.
async function visitWithDeadline(context, url, viewport) {
  const rec = emptyRecord(url, viewport);
  const page = await context.newPage();
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(null), pageDeadline); });
  const outcome = await Promise.race([visit(page, rec), deadline]);
  clearTimeout(timer);
  if (outcome) return outcome;
  rec.error = `page deadline exceeded (${pageDeadline} ms) — main thread blocked or page never settled`;
  await page.close().catch(() => {});
  return { rec, links: [] };
}

async function processUrl(contexts, url) {
  for (const vp of viewports) {
    const { rec, links } = await visitWithDeadline(contexts[vp], url, vp);
    result.pages.push(rec);
    for (const href of links) enqueue(normalizeUrl(href, url), url);
  }
  if (result.pages.length % WRITE_EVERY === 0) writeJson(outFile, result);
}

async function crawl(contexts) {
  const active = new Set();
  for (;;) {
    if (budgetExceeded()) result.budgetExceeded = true;
    while (queue.length && active.size < concurrency && visited < maxPages && !result.budgetExceeded) {
      visited++;
      const task = processUrl(contexts, queue.shift()).finally(() => active.delete(task));
      active.add(task);
    }
    if (!active.size) break;
    await Promise.race(active);
  }
  result.truncated = queue.length;
}

async function checkLink(url) {
  let lastError = null;
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(10000) });
      if (method === 'HEAD' && [403, 405, 501].includes(r.status)) continue;
      // Many sites refuse scripted checks (LinkedIn 999, bot walls 403/429): that's not proof the link is broken.
      if (UNVERIFIABLE_STATUS.has(r.status)) return { status: r.status, ok: null, unverifiable: true };
      return { status: r.status, ok: r.status < 400 };
    } catch (e) { lastError = e.cause?.code ?? e.message; }
  }
  return { status: null, ok: false, error: lastError };
}

async function checkLinks(entries) {
  const results = [];
  for (let i = 0; i < entries.length && !budgetExceeded(); i += 4) {
    const batch = entries.slice(i, i + 4);
    results.push(...await Promise.all(batch.map(async ([url, from]) => ({ url, from, ...await checkLink(url) }))));
  }
  return results;
}

async function loginAll(contexts) {
  const loginPath = new URL(roleConfig.url, base).pathname;
  for (const context of Object.values(contexts)) {
    const landedOn = await loginWithConfig(context, roleConfig, base, timeout);
    if (landedOn === loginPath) {
      result.loggedInAs = null;
      throw new Error(`login failed for role "${role}" (still on ${landedOn}) — check config.roles.${role} credentials and selectors`);
    }
  }
}

mkdirSync(join(out, 'screenshots'), { recursive: true });
let browser;
try {
  browser = await chromium.launch();
  const contexts = {};
  for (const vp of viewports) {
    contexts[vp] = await browser.newContext({ viewport: VIEWPORTS[vp], hasTouch: vp === 'mobile' });
    await contexts[vp].addInitScript(CLS_SCRIPT);
  }
  if (roleConfig) await loginAll(contexts);
  enqueue(base, null);
  for (const route of appMap?.routes ?? []) {
    const path = routeToSamplePath(route);
    if (path) enqueue(normalizeUrl(path, base), null);
  }
  await crawl(contexts);
  result.linkChecks = await checkLinks([...checkOnly.entries()].slice(0, MAX_LINK_CHECKS));
} catch (e) {
  result.error = String(e.message).split('\n')[0];
} finally {
  await browser?.close().catch(() => {});
  result.finishedAt = new Date().toISOString();
  writeJson(outFile, result);
}

const sum = (key) => result.pages.reduce((n, p) => n + p[key].length, 0);
const desktopPages = result.pages.filter((p) => p.viewport === 'desktop');
console.log(JSON.stringify({
  label, pages: result.pages.length, truncated: result.truncated, budgetExceeded: result.budgetExceeded,
  challenged: result.pages.filter((p) => p.challenge).length,
  brokenInternal: desktopPages.filter((p) => p.linkedFrom && p.status >= 400 && !p.challenge).length,
  redirected: desktopPages.filter((p) => p.finalUrl && routePath(p.finalUrl) !== routePath(p.url)).length,
  timedOut: result.pages.filter((p) => p.error?.startsWith('page deadline')).length,
  consoleErrors: result.pages.reduce((n, p) => n + p.console.filter((c) => c.type === 'error').length, 0),
  pageErrors: sum('pageErrors'), badResponses: sum('badResponses'), a11y: sum('a11y'),
  brokenLinks: result.linkChecks.filter((l) => l.ok === false).length,
  unverifiableLinks: result.linkChecks.filter((l) => l.unverifiable).length,
  secrets: result.secrets.length, error: result.error,
}));
// exitCode, not process.exit(): exiting with open fetch sockets crashes libuv on Windows.
process.exitCode = result.error ? 1 : 0;
