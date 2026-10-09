#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { parseArgs } from './lib/args.mjs';
import { classifyTarget } from './lib/target.mjs';
import { readJson } from './lib/fsutil.mjs';
import { loginWithConfig } from './lib/login.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.base || !args.config || !args.role || !args.out) {
  console.error('usage: node session.mjs --base <url> --config <config.json> --role <name> --out <runDir>');
  process.exit(64);
}
if (classifyTarget(args.base) !== 'local') {
  console.error('Refusing: role sessions are only created on local targets. On deployed targets the user signs in in their own browser.');
  process.exit(65);
}
const roleConfig = readJson(args.config).roles?.[args.role];
if (!roleConfig) {
  console.error(`config.roles.${args.role} is missing`);
  process.exit(64);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const landedOn = await loginWithConfig(context, roleConfig, args.base);
  const cookies = await context.cookies(args.base);
  if (!cookies.length) {
    console.error(`Login as "${args.role}" produced no cookies (landed on ${landedOn}). Check selectors in config.roles.${args.role}, or the app keeps its session in localStorage.`);
    process.exitCode = 1;
  } else {
    const dir = join(args.out, '.sessions');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${args.role}.cookie`);
    writeFileSync(file, cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    console.log(JSON.stringify({ role: args.role, cookies: cookies.length, file, landedOn }));
  }
} finally {
  await browser.close();
}
