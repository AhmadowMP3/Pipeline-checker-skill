import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScript, tempDir } from './helpers.mjs';

test('new-run creates a unique run dir and reports gitignore/config state', async () => {
  const project = tempDir();
  writeFileSync(join(project, '.gitignore'), 'node_modules/\n.pipeline-check/\n');
  const a = await runScript('new-run.mjs', ['--url', 'http://localhost:3000', '--project', project]);
  assert.equal(a.code, 0, a.stderr);
  const infoA = JSON.parse(a.stdout);
  assert.equal(infoA.target, 'local');
  assert.equal(infoA.gitignored, true);
  assert.equal(infoA.config, null);
  assert.ok(existsSync(join(infoA.runDir, 'screenshots')));
  const b = JSON.parse((await runScript('new-run.mjs', ['--url', 'https://example.com', '--project', project])).stdout);
  assert.notEqual(b.runDir, infoA.runDir);
  assert.equal(b.target, 'deployed');
});

test('new-run without --url exits 64', async () => {
  assert.equal((await runScript('new-run.mjs', [])).code, 64);
});
