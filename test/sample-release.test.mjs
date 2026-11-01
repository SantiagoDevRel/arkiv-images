import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkSampleRelease} from '../scripts/sample-release-guard.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('sample help links match the exact registry pin and upload source for remote builds', () => {
  assert.deepEqual(checkSampleRelease(root), []);
});

test('release guard CLI rejects stale versions in source, guides and generated assets', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'image-release-'));
  const version = JSON.parse(readFileSync(path.join(root, 'sample/package.json'))).dependencies['arkiv-images'];
  const link = release => `https://github.com/SantiagoDevRel/arkiv-images/blob/v${release}/sample/AGENTS.md`;
  const write = (file, text) => { mkdirSync(path.dirname(path.join(fixture, file)), {recursive: true}); writeFileSync(path.join(fixture, file), text); };
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/sample-release-guard.mjs'), fixture], {encoding: 'utf8'});
  try {
    for (const file of ['sample/package.json', 'sample/vercel.json', 'sample/.vercelignore', 'sample/api/rpc.mjs']) write(file, readFileSync(path.join(root, file)));
    write('README.md', 'Current sample: ' + link(version));
    assert.equal(run().status, 0);
    for (const file of ['README.md', 'sample/index.html', 'sample/README.md', 'sample/src/help.ts', 'sample/dist/index.html', 'sample/dist/assets/help.js']) {
      write(file, link('0.0.0'));
      const result = run();
      assert.equal(result.status, 1, file);
      assert.match(result.stderr, /sample link must use v/);
      write(file, link(version));
      assert.equal(run().status, 0);
    }
    console.log(JSON.stringify({sampleLinkMutation: true, surfaces: 6, rejected: true}));
    const ignore = readFileSync(path.join(root, 'sample/.vercelignore'), 'utf8');
    write('sample/.vercelignore', ignore.replace('!/src/**', ''));
    assert.equal(run().status, 1);
    write('sample/.vercelignore', ignore);
    const config = JSON.parse(readFileSync(path.join(root, 'sample/vercel.json')));
    write('sample/vercel.json', JSON.stringify({...config, buildCommand: 'echo skipped'}));
    assert.equal(run().status, 1);
    write('sample/vercel.json', JSON.stringify(config));
    assert.equal(run().status, 0);
    console.log(JSON.stringify({remoteBuildMutation: true, omittedSourceRejected: true, wrongBuildRejected: true}));
  } finally { rmSync(fixture, {recursive: true}); }
});
