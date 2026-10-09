const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function parseEnvNames(text) {
  return text.split(/\r?\n/).map((l) => LINE.exec(l)?.[1]).filter(Boolean);
}

export function diffEnv(referenced, defined) {
  return [...new Set(referenced)].filter((n) => !defined.has(n)).sort();
}
