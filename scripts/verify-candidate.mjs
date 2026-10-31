// Historical 1.0.0 artifact verification only; current patch validation uses the manifest version and separate phase-1 evidence.
// Run on the DGX after the live seed has passed. --registry verifies the published release.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const registry = process.argv.includes('--registry');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw Error(`Verification gate failed: ${command} ${args.join(' ')}`);
}
run(process.execPath, ['scripts/check-dependency.mjs']);
run(npm, ['run', 'typecheck']); run(npm, ['run', 'lint']); run(npm, ['test']);
const live = JSON.parse(await readFile('docs/rabdi-evidence.json', 'utf8'));
assert.equal(live.chainId, 7794095);
assert.equal(live.cases.length, 4);
assert.ok(live.cases.every(c => c.byteExact === true));
const tarball = join(root, 'sample/arkiv-images-1.0.0.tgz');
let bytes;
if (registry) {
  const result = spawnSync(npm, ['view', 'arkiv-images@1.0.0', 'dist', '--registry', 'https://registry.npmjs.org', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'Published registry metadata must be available.');
  const dist = JSON.parse(result.stdout);
  const response = await fetch(dist.tarball); assert.ok(response.ok);
  bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c4c5417edb32179f7cc2f39b2e959711103925f019a0bd0ba62e84593826c110');
  assert.equal(createHash('sha1').update(bytes).digest('hex'), dist.shasum);
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, dist.integrity);
  // Retire only this lane's known, approved prior candidate if it remains in its DGX lane.
  try {
    const prior = await readFile(tarball);
    assert.equal(createHash('sha256').update(prior).digest('hex'), 'c4c5417edb32179f7cc2f39b2e959711103925f019a0bd0ba62e84593826c110');
    await unlink(tarball);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
} else {
  run(npm, ['pack', '--pack-destination', 'sample']); bytes = await readFile(tarball);
}
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
assert.ok(process.env.TMPDIR, 'Run inside the registered DGX job private TMPDIR.');
const consumer = join(process.env.TMPDIR, 'images-consumer'); await mkdir(consumer);
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'images-candidate-consumer', version: '1.0.0', private: true, type: 'module' }));
run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', registry ? 'arkiv-images@1.0.0' : tarball, '@arkiv-network/sdk@1.0.0', 'viem@2.56.3', '--registry', 'https://registry.npmjs.org'], consumer);
assert.deepEqual(await readFile(join(consumer, 'node_modules/arkiv-images/dist/index.js')), await readFile('dist/index.js'), 'Clean consumer JavaScript must match the built source.');
for (const guide of ['README.md', 'AGENTS.md', 'CLAUDE.md']) await access(join(consumer, 'node_modules/arkiv-images/sample', guide));
console.log(`Sample guides linked by README are present in the clean ${registry ? 'registry' : 'packed'} consumer.`);
await writeFile(join(consumer, 'inspect.mjs'), `import assert from 'node:assert/strict';
import { inspectImage, planImage, VERSION } from 'arkiv-images';
const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4V+L2HwAG5AK4X5zdSAAAAABJRU5ErkJggg==', 'base64'));
assert.equal(VERSION, '1.0.0');
assert.deepEqual(inspectImage(bytes), { contentType: 'image/png', width: 1, height: 1, byteLength: 70 });
assert.equal(planImage(bytes.length).mode, 'inline');
console.log('Exact README local example passed from the clean consumer.');
`);
await writeFile(join(consumer, 'types.ts'), `import type { ImageInfo, ImagePlan, StoreImageOptions, StoredImage, RetrieveImageOptions, RetrievedImage, TransactionParameterPolicy } from 'arkiv-images';
import { ImageSchema, VERSION, inspectImage, planImage, MAX_EXPIRATION_BLOCKS } from 'arkiv-images';
const policy: TransactionParameterPolicy = context => ({ gas: context.defaults.gas, gasPrice: context.defaults.gasPrice });
const accepts = (_: ImageInfo | ImagePlan | StoreImageOptions | StoredImage | RetrieveImageOptions | RetrievedImage) => policy;
void [accepts, ImageSchema, VERSION, inspectImage, planImage, MAX_EXPIRATION_BLOCKS];
`);
run(process.execPath, ['inspect.mjs'], consumer);
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ES2022', 'types.ts'], consumer);
// Explicitly refresh the local tarball. Plain npm install can retain an older archive
// with the same name/version from the existing lock and node_modules cache.
if (registry) {
  const manifest = JSON.parse(await readFile('sample/package.json', 'utf8'));
  assert.equal(manifest.dependencies['arkiv-images'], '1.0.0');
  run(npm, ['ci', '--no-audit', '--no-fund'], join(root, 'sample'));
} else run(npm, ['install', '--no-audit', '--no-fund', 'arkiv-images@file:./arkiv-images-1.0.0.tgz'], join(root, 'sample'));
const sampleLock = JSON.parse(await readFile('sample/package-lock.json', 'utf8'));
assert.equal(sampleLock.packages['node_modules/arkiv-images'].integrity, integrity, 'Sample lock must identify this exact candidate.');
if (registry) assert.equal(sampleLock.packages['node_modules/arkiv-images'].resolved, 'https://registry.npmjs.org/arkiv-images/-/arkiv-images-1.0.0.tgz');
assert.deepEqual(await readFile('sample/node_modules/arkiv-images/dist/index.js'), await readFile('dist/index.js'), 'Sample must build the current candidate, not a cached prior pack.');
run(npm, ['run', 'build'], join(root, 'sample'));
const artifact = { name: 'arkiv-images', version: '1.0.0', published: registry, sha256: createHash('sha256').update(bytes).digest('hex'), shasum: createHash('sha1').update(bytes).digest('hex'), integrity, bytes: bytes.length, cleanPackedConsumer: !registry, cleanRegistryConsumer: registry };
await writeFile(registry ? 'registry-artifact.json' : 'candidate-artifact.json', JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify(artifact));
