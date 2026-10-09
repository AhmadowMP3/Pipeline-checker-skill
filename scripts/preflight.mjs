#!/usr/bin/env node
import tls from 'node:tls';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { classifyTarget } from './lib/target.mjs';
import { checkSecurityHeaders } from './lib/headers.mjs';
import { parseEnvNames, diffEnv } from './lib/env.mjs';
import { readJson, writeJson } from './lib/fsutil.mjs';
import { routeToSamplePath } from './lib/url.mjs';

const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.example', '.env.sample'];
const TIMEOUT = 15000;
const MAX_ROUTES = 50;

const errorCode = (e) => e.cause?.code ?? e.message;

async function followRedirects(url, max = 10) {
  const chain = [];
  let current = url;
  for (let i = 0; i <= max; i++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current).toString();
      chain.push({ from: current, to: next, status: response.status });
      current = next;
      continue;
    }
    return { chain, finalUrl: current, response };
  }
  throw new Error(`Too many redirects (> ${max}) starting at ${url}`);
}

function checkTls(host, port) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, timeout: TIMEOUT }, () => {
      const cert = socket.getPeerCertificate();
      resolve({ valid: true, error: null, validTo: cert.valid_to, daysToExpiry: Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000) });
      socket.end();
    });
    socket.on('error', (e) => resolve({ valid: false, error: e.code ?? e.message, validTo: null, daysToExpiry: null }));
    socket.on('timeout', () => { socket.destroy(); resolve({ valid: false, error: 'timeout', validTo: null, daysToExpiry: null }); });
  });
}

async function exists(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })).ok; } catch { return false; }
}

function envCheck(projectDir, appMap) {
  const referenced = appMap?.env?.referenced ?? [];
  const defined = new Set();
  const files = [];
  for (const f of projectDir ? ENV_FILES : []) {
    const p = join(projectDir, f);
    if (!existsSync(p)) continue;
    files.push(f);
    for (const name of parseEnvNames(readFileSync(p, 'utf8'))) defined.add(name);
  }
  return { files, referenced, missing: diffEnv(referenced, defined) };
}

async function checkRoutes(base, appMap) {
  const paths = (appMap?.routes ?? []).map(routeToSamplePath).filter(Boolean).slice(0, MAX_ROUTES);
  const out = [];
  for (const path of paths) {
    try {
      const { finalUrl, response } = await followRedirects(new URL(path, base).toString());
      out.push({ path, status: response.status, finalUrl, ok: response.status < 400 });
    } catch (e) {
      out.push({ path, status: null, finalUrl: null, ok: false, error: errorCode(e) });
    }
  }
  return out;
}

async function preflight({ url, projectDir, appMap }) {
  const result = { url, target: classifyTarget(url), checkedAt: new Date().toISOString(), reachable: false };
  let first;
  try { first = await followRedirects(url); } catch (e) { result.error = errorCode(e); return result; }
  const { chain, finalUrl, response } = first;
  const final = new URL(finalUrl);
  Object.assign(result, { reachable: true, status: response.status, redirects: chain, finalUrl });
  result.httpsRedirect = new URL(url).protocol === 'http:' && result.target === 'deployed' ? final.protocol === 'https:' : null;
  result.tls = final.protocol === 'https:' ? await checkTls(final.hostname, Number(final.port) || 443) : null;
  result.headerIssues = checkSecurityHeaders(Object.fromEntries(response.headers), { https: final.protocol === 'https:' });
  result.robots = await exists(new URL('/robots.txt', finalUrl));
  result.sitemap = await exists(new URL('/sitemap.xml', finalUrl));
  result.env = envCheck(projectDir, appMap);
  result.routes = await checkRoutes(finalUrl, appMap);
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (!args.url || !args.out) {
  console.error('usage: node preflight.mjs --url <url> --out <runDir> [--project <dir>] [--app-map <path>]');
  process.exit(64);
}
const appMap = args['app-map'] ? readJson(args['app-map']) : null;
const result = await preflight({ url: args.url, projectDir: args.project, appMap });
writeJson(join(args.out, 'preflight.json'), result);
console.log(JSON.stringify({
  reachable: result.reachable,
  status: result.status ?? null,
  headerIssues: result.headerIssues?.length ?? 0,
  missingEnv: result.env?.missing ?? [],
  failingRoutes: (result.routes ?? []).filter((r) => !r.ok).length,
  error: result.error ?? null,
}));
// exitCode, not process.exit(): exiting with open fetch sockets crashes libuv on Windows.
process.exitCode = result.reachable ? 0 : 2;
