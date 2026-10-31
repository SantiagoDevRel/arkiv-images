// Run in a registered DGX job. Avoid same-version local-tarball metadata in an old lock.
import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

assert.ok(process.env.TMPDIR, 'Use the registered DGX job private TMPDIR.');
const temporary = join(process.env.TMPDIR, 'images-registry-lock');
await mkdir(temporary);
await copyFile('sample/package.json', join(temporary, 'package.json'));
const result = spawnSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org'], { cwd: temporary, stdio: 'inherit' });
assert.equal(result.status, 0);
const lock = JSON.parse(await readFile(join(temporary, 'package-lock.json'), 'utf8'));
const image = lock.packages['node_modules/arkiv-images'];
assert.equal(image.version, '1.0.0');
assert.equal(image.resolved, 'https://registry.npmjs.org/arkiv-images/-/arkiv-images-1.0.0.tgz');
assert.equal(image.integrity, 'sha512-h7FO+7fV8zqkUMN2R6xvf2HgvSMW18gVVAU/fp5xyEMECYxBghx+BUAv8MPng2WYjVmST0QMUJn+Zh+OljU8wg==');
await copyFile(join(temporary, 'package-lock.json'), 'sample/package-lock.json');
console.log('Clean registry lock verified; no local tarball metadata retained.');
