import { isDangerousLink } from './url.mjs';

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PARAM = /\[\.{0,3}[^\]]+\]|\{[^}]+\}|<[^>]+>|:[A-Za-z_]+/g;
const RISKY = /(^|[/_-])(cron|seed|reset|migrat\w*|send|webhooks?|purge\w*|flush|sync|import|backfill)([/_.-]|$)/i;
const LOGIN_LOCATION = /log[-_]?in|sign[-_]?in|\/auth(\/|\?|$)|\/session/i;

export const isProtected = (ep) => Boolean(ep.auth || ep.role);
export const isForeign = (ep, asRole) => Boolean(ep.role) && ep.role !== asRole;

// Dynamic segments become `1` only on local targets; deployed targets need an explicit sample.
export function fillPath(ep, target) {
  if (ep.sample) return ep.sample;
  if (!PARAM.test(ep.path)) return ep.path;
  PARAM.lastIndex = 0;
  return target === 'local' ? ep.path.replace(PARAM, '1') : null;
}

export function isRiskyEndpoint(path) {
  return RISKY.test(path) || isDangerousLink(new URL(path, 'http://probe.invalid').toString());
}

export function skipReason(ep, { target, allowWrites, allowRisky, hasSession, asRole }) {
  const method = ep.method.toUpperCase();
  const write = !SAFE_METHODS.has(method);
  if (!allowRisky && isRiskyEndpoint(ep.path)) return 'SKIPPED_RISKY';
  if (write && !allowWrites) return 'SKIPPED_WRITE';
  if (write && hasSession && !isForeign(ep, asRole)) return 'SKIPPED_WRITE';
  if (target === 'deployed' && (write ? !ep.sample : fillPath(ep, target) === null)) return 'SKIPPED_NO_SAMPLE';
  return null;
}

const isRedirect = (s) => s >= 300 && s < 400;
const isLoginRedirect = ({ status, location }) => isRedirect(status) && LOGIN_LOCATION.test(location ?? '');
const isDenied = (r) => r.status === 401 || r.status === 403 || isLoginRedirect(r);

export function classifyAnonymous(ep, r) {
  const s = r.status;
  if (isDenied(r)) return 'ENFORCED';
  if (isRedirect(s)) return isProtected(ep) ? 'REDIRECT_REVIEW' : 'OK';
  if (s >= 500) return 'SERVER_ERROR';
  if (s === 404 || s === 405) return 'NOT_FOUND';
  if (isProtected(ep) && (s === 400 || s === 422)) return 'UNPROTECTED_LIKELY';
  if (isProtected(ep) && s < 400) return 'UNPROTECTED';
  return 'OK';
}

export function classifySession(ep, r, asRole) {
  const s = r.status;
  if (isForeign(ep, asRole)) {
    if (isDenied(r) || s === 404) return 'ROLE_ENFORCED';
    if (isRedirect(s)) return 'REDIRECT_REVIEW';
    if (s >= 500) return 'SERVER_ERROR';
    if (s === 400 || s === 422) return 'ROLE_BYPASS_LIKELY';
    if (s < 400) return 'ROLE_BYPASS';
    return 'OK';
  }
  if (isDenied(r)) return 'AUTH_REJECTED';
  if (s >= 500) return 'SERVER_ERROR';
  if (s === 404 || s === 405) return 'NOT_FOUND';
  return 'OK';
}
