const DANGEROUS_VERBS = 'log-?out|log_out|log-?off|sign[-_]?out|delete|destroy|remove|unsubscribe|deactivate|cancel|refund|approve|reject|ban|suspend|impersonate|publish|unpublish|archive|clear|reset(?![-_]?password)|toggle|purge|empty';
const DANGEROUS = new RegExp(`(^|[/?&=_.!#-])(${DANGEROUS_VERBS})([/?&=_.-]|$)`, 'i');
const ROUTING_HASH = /^#!?\//;

export function normalizeUrl(href, base) {
  let u;
  try { u = new URL(href, base); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!ROUTING_HASH.test(u.hash)) u.hash = '';
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

export function isSameOrigin(a, b) {
  return new URL(a).origin === new URL(b).origin;
}

// Path a SPA router sees: the hash route (#/x, #!/x) when present, else the URL path.
export function routePath(url) {
  const u = new URL(url);
  return ROUTING_HASH.test(u.hash) ? u.hash.replace(/^#!?/, '') : u.pathname;
}

export function isDangerousLink(url) {
  const u = new URL(url);
  const target = `${u.pathname}${u.search}${ROUTING_HASH.test(u.hash) ? u.hash : ''}`;
  // Split camelCase so /deleteAccount is seen as /delete-Account.
  return DANGEROUS.test(target.replace(/([a-z])([A-Z])/g, '$1-$2'));
}

export function isExcluded(url, prefixes = []) {
  const { pathname } = new URL(url);
  const route = routePath(url);
  return prefixes.some((p) => pathname.startsWith(p) || route.startsWith(p));
}

export function routeToSamplePath(route) {
  if (route.sample) return route.sample;
  if (/[[:*{<]/.test(route.path)) return null;
  return route.path;
}
