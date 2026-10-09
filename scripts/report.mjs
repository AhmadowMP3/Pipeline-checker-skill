#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import { readJson } from './lib/fsutil.mjs';
import { validateReport, renderMarkdown, renderHtml, healthScore, countBySeverity } from './lib/report-render.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.run) {
  console.error('usage: node report.mjs --run <runDir>');
  process.exit(64);
}

const data = readJson(join(args.run, 'findings.json'));
const errors = validateReport(data);
if (errors.length) {
  console.error(`findings.json is invalid:\n${errors.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}

const template = readFileSync(fileURLToPath(new URL('../templates/report.html', import.meta.url)), 'utf8');
writeFileSync(join(args.run, 'report.md'), renderMarkdown(data));
writeFileSync(join(args.run, 'report.html'), renderHtml(data, template));
console.log(JSON.stringify({
  score: healthScore(data.findings),
  counts: countBySeverity(data.findings),
  markdown: join(args.run, 'report.md'),
  html: join(args.run, 'report.html'),
}));
