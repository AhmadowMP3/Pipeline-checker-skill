const CHECKS = [
  { id: 'missing-csp', header: 'content-security-policy', message: 'No Content-Security-Policy header' },
  { id: 'missing-hsts', header: 'strict-transport-security', message: 'No Strict-Transport-Security header', httpsOnly: true },
  { id: 'missing-nosniff', header: 'x-content-type-options', message: 'No X-Content-Type-Options: nosniff header' },
  { id: 'missing-referrer-policy', header: 'referrer-policy', message: 'No Referrer-Policy header' },
];

export function checkSecurityHeaders(headers, { https = false } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const issues = CHECKS
    .filter((c) => !(c.httpsOnly && !https) && !h[c.header])
    .map(({ id, header, message }) => ({ id, header, message }));
  if (!h['x-frame-options'] && !/frame-ancestors/i.test(h['content-security-policy'] ?? '')) {
    issues.push({ id: 'clickjacking', header: 'x-frame-options', message: 'No X-Frame-Options or CSP frame-ancestors (page can be framed)' });
  }
  if (h['x-powered-by']) {
    issues.push({ id: 'x-powered-by', header: 'x-powered-by', message: `X-Powered-By discloses "${h['x-powered-by']}"` });
  }
  return issues;
}
