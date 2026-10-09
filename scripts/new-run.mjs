#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { classifyTarget, makeRunId } from './lib/target.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.url) {
  console.error('usage: node new-run.mjs --url <url> [--project <dir>]');
  process.exit(64);
}

const project = resolve(args.project ?? '.');
const runsRoot = join(project, '.pipeline-check', 'runs');
const id = makeRunId();
let runDir = join(runsRoot, id);
for (let n = 2; existsSync(runDir); n++) runDir = join(runsRoot, `${id}-${n}`);
mkdirSync(join(runDir, 'screenshots'), { recursive: true });

const gitignorePath = join(project, '.gitignore');
const gitignored = existsSync(gitignorePath) && /^\/?\.pipeline-check\/?\s*$/m.test(readFileSync(gitignorePath, 'utf8'));
const configPath = join(project, '.pipeline-check', 'config.json');

console.log(JSON.stringify({
  runId: basename(runDir),
  runDir,
  target: classifyTarget(args.url),
  gitignored,
  config: existsSync(configPath) ? configPath : null,
}));
