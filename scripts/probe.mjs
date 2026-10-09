#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { readJson, writeJson } from './lib/fsutil.mjs';
import { classifyTarget } from './lib/target.mjs';
import {
  SAFE_METHODS, isProtected, isForeign, fillPath, skipReason, classifyAnonymous, classifySession,
} from './lib/probe-logic.mjs';

const PROBE_ORIGIN = 'https://pc-probe.invalid';
const USAGE = 'usage: node probe.mjs --base <url> --app-map <path> --out <runDir> [--allow-writes] [--allow-risky] [--cookie-file <path> --as-role <role> [--stale-check]] [--label <name>]';

const args = parseArgs(process.argv.slice(2));
const usageError = (msg) => { console.error(msg); process.exit(64); };
if (!args.base || !args['app-map'] || !args.out) usageError(USAGE);
if (args['cookie-file'] && !args['as-role']) usageError('--cookie-file requires --as-role');
if (args['stale-check'] && !args['cookie-file']) usageError('--stale-check requires --cookie-file');

const target = classifyTarget(args.base);
const asRole = typeof args['as-role'] === 'string' ? args['as-role'] : null;
const cookie = args['cookie-file'] ? readFileSync(args['cookie-file'], 'utf8').trim() : null;
const sessionHeaders = cookie ? { Cookie: cookie } : {};
const rules = {
  target, asRole, hasSession: Boolean(cookie),
  allowWrites: Boolean(args['allow-writes']), allowRisky: Boolean(args['allow-risky']),
};
const label = args.label ?? asRole ?? 'anon';
const appMap = readJson(args['app-map']);
const endpoints = appMap.endpoints ?? [];
const errorCode = (e) => e.cause?.code ?? e.message;

function call(url, method, headers = {}) {
  const init = { method, headers, redirect: 'manual', signal: AbortSignal.timeout(15000) };
  if (!SAFE_METHODS.has(method)) {
    init.body = '{}';
    init.headers = { 'content-type': 'application/json', ...headers };
  }
  return fetch(url, init);
}

const summarize = (response) => ({ status: response.status, location: response.headers.get('location') });

function corsIssue(acao, credentials) {
  if (acao === PROBE_ORIGIN && credentials) return 'reflects-origin-with-credentials';
  if (acao === '*' && credentials) return 'wildcard-with-credentials';
  if (acao === PROBE_ORIGIN) return 'reflects-any-origin';
  return null;
}

const result = {
  base: args.base, target, label, asRole, allowWrites: rules.allowWrites, allowRisky: rules.allowRisky,
  endpoints: [], cors: [], staleSession: [], logoutStatus: null, staleError: null,
};

async function probeEndpoint(ep, corsSeen) {
  const method = ep.method.toUpperCase();
  const path = fillPath(ep, target);
  const url = path ? new URL(path, args.base).toString() : null;
  const row = { method, path: ep.path, url, auth: isProtected(ep), role: ep.role ?? null };
  const skip = skipReason(ep, rules);
  if (skip) {
    result.endpoints.push({ ...row, status: null, verdict: skip });
    return;
  }
  try {
    const r = summarize(await call(url, method, sessionHeaders));
    const verdict = cookie ? classifySession(ep, r, asRole) : classifyAnonymous(ep, r);
    result.endpoints.push({ ...row, status: r.status, location: r.location, verdict });
  } catch (e) {
    result.endpoints.push({ ...row, status: null, verdict: 'ERROR', error: errorCode(e) });
  }
  if (cookie || corsSeen.has(url)) return;
  corsSeen.add(url);
  try {
    const pre = await call(url, 'OPTIONS', { Origin: PROBE_ORIGIN, 'Access-Control-Request-Method': method });
    const acao = pre.headers.get('access-control-allow-origin');
    const credentials = pre.headers.get('access-control-allow-credentials') === 'true';
    const issue = corsIssue(acao, credentials);
    if (issue) result.cors.push({ method, path: ep.path, url, acao, credentials, issue });
  } catch { /* unreachable endpoint already recorded */ }
}

async function staleCheck() {
  const logout = appMap.auth?.logout;
  if (!logout) { result.staleError = 'app-map.auth.logout ({method, path}) is missing'; return; }
  try {
    const response = await call(new URL(logout.path, args.base).toString(), logout.method.toUpperCase(), sessionHeaders);
    result.logoutStatus = response.status;
  } catch (e) {
    result.staleError = `logout call failed: ${errorCode(e)}`;
    return;
  }
  if (result.logoutStatus >= 400) {
    // A rejected logout (often CSRF: 403/419) never ended the session, so old-cookie hits prove nothing.
    result.staleError = `logout rejected (${result.logoutStatus}) — likely CSRF protection; check logout in the browser instead`;
    return;
  }
  for (const ep of endpoints) {
    const method = ep.method.toUpperCase();
    if (!isProtected(ep) || isForeign(ep, asRole) || !SAFE_METHODS.has(method) || skipReason(ep, rules)) continue;
    const url = new URL(fillPath(ep, target), args.base).toString();
    try {
      const response = await call(url, method, sessionHeaders);
      const accepted = response.status >= 200 && response.status < 300;
      result.staleSession.push({ method, path: ep.path, url, status: response.status, verdict: accepted ? 'STALE_ACCEPTED' : 'REJECTED' });
    } catch (e) {
      result.staleSession.push({ method, path: ep.path, url, status: null, verdict: 'REJECTED', error: errorCode(e) });
    }
  }
}

const corsSeen = new Set();
for (const ep of endpoints) await probeEndpoint(ep, corsSeen);
if (args['stale-check']) await staleCheck();

writeJson(join(args.out, `probe-${label}.json`), result);
const count = (...verdicts) => result.endpoints.filter((e) => verdicts.includes(e.verdict)).length;
console.log(JSON.stringify({
  label, target, endpoints: result.endpoints.length,
  unprotected: count('UNPROTECTED', 'UNPROTECTED_LIKELY'),
  roleBypass: count('ROLE_BYPASS', 'ROLE_BYPASS_LIKELY'),
  redirectReview: count('REDIRECT_REVIEW'),
  serverErrors: count('SERVER_ERROR'),
  skipped: count('SKIPPED_WRITE', 'SKIPPED_RISKY', 'SKIPPED_NO_SAMPLE'),
  corsIssues: result.cors.length,
  staleAccepted: result.staleSession.filter((s) => s.verdict === 'STALE_ACCEPTED').length,
  staleError: result.staleError,
}));
