export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const CONFIDENCE = ['confirmed', 'suspected', 'flaky'];
const CATEGORIES = ['functional', 'connection', 'security', 'ux', 'accessibility', 'performance', 'content'];
const WEIGHT = { critical: 25, high: 10, medium: 3, low: 1 };
const ICON = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };
const REQUIRED = ['id', 'severity', 'title', 'category', 'expected', 'actual', 'confidence'];

export function validateReport(data) {
  if (!data || typeof data !== 'object') return ['root must be an object'];
  const errors = [];
  if (!data.meta?.base) errors.push('meta.base is required');
  if (!Array.isArray(data.findings)) return [...errors, 'findings must be an array'];
  const ids = new Set();
  data.findings.forEach((f, i) => {
    const at = `findings[${i}]${f?.id ? ` (${f.id})` : ''}`;
    for (const k of REQUIRED) if (!f?.[k]) errors.push(`${at}: missing ${k}`);
    if (f?.severity && !SEVERITIES.includes(f.severity)) errors.push(`${at}: severity must be one of ${SEVERITIES.join('|')}`);
    if (f?.confidence && !CONFIDENCE.includes(f.confidence)) errors.push(`${at}: confidence must be one of ${CONFIDENCE.join('|')}`);
    if (f?.category && !CATEGORIES.includes(f.category)) errors.push(`${at}: category must be one of ${CATEGORIES.join('|')}`);
    if (!Array.isArray(f?.repro) || !f.repro.length) errors.push(`${at}: repro must be a non-empty array`);
    if (f?.id) { if (ids.has(f.id)) errors.push(`${at}: duplicate id`); ids.add(f.id); }
  });
  return errors;
}

export function healthScore(findings) {
  return Math.max(0, 100 - findings.reduce((s, f) => s + (WEIGHT[f.severity] ?? 0), 0));
}

export function sortFindings(findings) {
  return [...findings].sort((a, b) =>
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const whereText = (w) => [w?.page, w?.request].filter(Boolean).join(' → ');
const suspectText = (s) => `${s.file}${s.line ? `:${s.line}` : ''}`;

export function renderMarkdown(data) {
  const { meta, coverage = {}, leftovers = [] } = data;
  const findings = sortFindings(data.findings);
  const c = countBySeverity(findings);
  const L = [
    `# Pipeline Check Report — ${meta.base}`, '',
    `**Run:** ${meta.runId ?? '-'} · **Target:** ${meta.target ?? '-'} · **Scope:** ${meta.scope ?? '-'} · **Browser:** ${meta.browser ?? '-'}`,
    `**Health score:** ${healthScore(findings)}/100 · 🔴 ${c.critical} · 🟠 ${c.high} · 🟡 ${c.medium} · 🔵 ${c.low}`, '',
  ];
  if (meta.profile) {
    L.push(`**What this app is:** ${meta.profile.summary ?? '-'}`, `**Site types:** ${(meta.profile.types ?? []).join(', ') || '-'} · **Roles tested:** ${(meta.profile.roles ?? []).join(', ') || '-'}`, '');
  }
  if (meta.notes?.length) L.push('> **Notes**', ...meta.notes.map((n) => `> - ${n}`), '');
  if (meta.phases) L.push('## Phases', '', '| Phase | Status |', '|---|---|', ...Object.entries(meta.phases).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('## Findings', '');
  if (!findings.length) L.push('No issues found.', '');
  for (const f of findings) {
    L.push(`### ${ICON[f.severity]} [${f.severity.toUpperCase()}] ${f.id} · ${f.title}`, '');
    L.push(`- **Category:** ${f.category} · **Confidence:** ${f.confidence}${f.role ? ` · **Role:** ${f.role}` : ''}${f.occurrences > 1 ? ` · **Occurrences:** ${f.occurrences}` : ''}`);
    if (whereText(f.where)) L.push(`- **Where:** ${whereText(f.where)}`);
    if (f.suspect?.file) L.push(`- **Suspect:** \`${suspectText(f.suspect)}\`${f.suspect.reason ? ` — ${f.suspect.reason}` : ''}`);
    L.push('', '**Repro**', '', ...f.repro.map((s, i) => `${i + 1}. ${s}`), '');
    L.push(`**Expected:** ${f.expected}`, '', `**Actual:** ${f.actual}`, '');
    const ev = f.evidence ?? {};
    for (const s of ev.screenshots ?? []) L.push(`![${f.id}](${s})`);
    if (ev.console?.length || ev.network?.length) {
      L.push('', '```', ...(ev.console ?? []).map((x) => `console: ${x}`), ...(ev.network ?? []).map((x) => `network: ${x}`), '```');
    }
    L.push('');
  }
  L.push('## Coverage', '', `- Pages swept: ${coverage.pagesSwept ?? 0}`, '');
  if (coverage.journeys?.length) {
    L.push('| Journey | Role | Status | Note |', '|---|---|---|---|',
      ...coverage.journeys.map((j) => `| ${j.id} ${j.name} | ${j.role ?? '-'} | ${j.status} | ${j.note ?? ''} |`), '');
  }
  if (leftovers.length) L.push('## Test data left behind', '', ...leftovers.map((x) => `- ${x}`), '');
  return L.join('\n');
}

export function renderHtml(data, template) {
  const { meta, coverage = {}, leftovers = [] } = data;
  const findings = sortFindings(data.findings);
  const c = countBySeverity(findings);
  const e = escapeHtml;
  const parts = [];
  parts.push(`<header><h1>Pipeline Check — ${e(meta.base)}</h1><p class="meta">Run ${e(meta.runId ?? '-')} · ${e(meta.target ?? '-')} · scope ${e(meta.scope ?? '-')} · browser ${e(meta.browser ?? '-')}</p>`);
  if (meta.profile) {
    parts.push(`<p class="profile"><b>${e(meta.profile.summary ?? '')}</b><br>Types: ${e((meta.profile.types ?? []).join(', '))} · Roles: ${e((meta.profile.roles ?? []).join(', '))}</p>`);
  }
  parts.push(`<div class="summary"><div class="score">${healthScore(findings)}<span>/100</span></div>${
    ['critical', 'high', 'medium', 'low'].map((s) => `<div class="pill ${s}">${c[s]} ${s}</div>`).join('')}</div></header>`);
  if (meta.notes?.length) parts.push(`<aside class="notes"><ul>${meta.notes.map((n) => `<li>${e(n)}</li>`).join('')}</ul></aside>`);
  parts.push('<section><h2>Findings</h2>');
  if (!findings.length) parts.push('<p>No issues found.</p>');
  for (const f of findings) {
    const ev = f.evidence ?? {};
    const log = [...(ev.console ?? []).map((x) => `console: ${x}`), ...(ev.network ?? []).map((x) => `network: ${x}`)];
    parts.push(`<article class="finding ${e(f.severity)}">
<h3><span class="sev">${e(f.severity)}</span> ${e(f.id)} · ${e(f.title)}</h3>
<p class="tags">${e(f.category)} · ${e(f.confidence)}${f.role ? ` · role: ${e(f.role)}` : ''}${f.occurrences > 1 ? ` · ${e(f.occurrences)} occurrences` : ''}</p>
${whereText(f.where) ? `<p><b>Where:</b> ${e(whereText(f.where))}</p>` : ''}
${f.suspect?.file ? `<p><b>Suspect:</b> <code>${e(suspectText(f.suspect))}</code>${f.suspect.reason ? ` — ${e(f.suspect.reason)}` : ''}</p>` : ''}
<ol>${f.repro.map((s) => `<li>${e(s)}</li>`).join('')}</ol>
<p><b>Expected:</b> ${e(f.expected)}</p><p><b>Actual:</b> ${e(f.actual)}</p>
${log.length ? `<pre>${e(log.join('\n'))}</pre>` : ''}
${(ev.screenshots ?? []).map((s) => `<a href="${e(s)}"><img src="${e(s)}" alt="Screenshot for ${e(f.id)}" loading="lazy"></a>`).join('')}
</article>`);
  }
  parts.push('</section>');
  parts.push(`<section><h2>Coverage</h2><p>Pages swept: ${e(coverage.pagesSwept ?? 0)}</p>`);
  if (coverage.journeys?.length) {
    parts.push(`<table><thead><tr><th>Journey</th><th>Role</th><th>Status</th><th>Note</th></tr></thead><tbody>${
      coverage.journeys.map((j) => `<tr><td>${e(j.id)} ${e(j.name)}</td><td>${e(j.role ?? '-')}</td><td class="st ${e(j.status)}">${e(j.status)}</td><td>${e(j.note ?? '')}</td></tr>`).join('')}</tbody></table>`);
  }
  if (meta.phases) {
    parts.push(`<table><thead><tr><th>Phase</th><th>Status</th></tr></thead><tbody>${
      Object.entries(meta.phases).map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`).join('')}</tbody></table>`);
  }
  parts.push('</section>');
  if (leftovers.length) parts.push(`<section><h2>Test data left behind</h2><ul>${leftovers.map((x) => `<li>${e(x)}</li>`).join('')}</ul></section>`);
  return template.split('{{TITLE}}').join(e(`Pipeline Check — ${meta.base}`)).split('{{BODY}}').join(parts.join('\n'));
}
