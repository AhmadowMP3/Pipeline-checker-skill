const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function classifyTarget(url) {
  const { hostname } = new URL(url);
  if (LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.test')) return 'local';
  return 'deployed';
}

export function makeRunId(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}
