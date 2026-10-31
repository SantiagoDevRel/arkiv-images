// Run on the DGX after the live seed has passed. Produces a candidate, never publishes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw Error(`Candidate gate failed: ${command} ${args.join(' ')}`);
}
run(process.execPath, ['scripts/check-dependency.mjs']);
run(npm, ['run', 'typecheck']); run(npm, ['run', 'lint']); run(npm, ['test']);
const live = JSON.parse(await readFile('docs/rabdi-evidence.json', 'utf8'));
assert.equal(live.chainId, 7794095);
assert.equal(live.cases.length, 4);
assert.ok(live.cases.every(c => c.byteExact === true));
run(npm, ['pack', '--pack-destination', 'sample']);
const tarball = join(root, 'sample/arkiv-images-1.0.0.tgz');
const bytes = await readFile(tarball);
assert.ok(process.env.TMPDIR, 'Run inside the registered DGX job private TMPDIR.');
const consumer = join(process.env.TMPDIR, 'images-consumer'); await mkdir(consumer);
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'images-candidate-consumer', version: '1.0.0', private: true, type: 'module' }));
run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, '@arkiv-network/sdk@1.0.0', 'viem@2.56.3'], consumer);
await writeFile(join(consumer, 'inspect.mjs'), `import assert from 'node:assert/strict';
import { inspectImage, planImage, VERSION } from 'arkiv-images';
const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4V+L2HwAG5AK4X5zdSAAAAABJRU5ErkJggg==', 'base64'));
assert.equal(VERSION, '1.0.0');
assert.deepEqual(inspectImage(bytes), { contentType: 'image/png', width: 1, height: 1, byteLength: 70 });
assert.equal(planImage(bytes.length).mode, 'inline');
console.log('Exact README local example passed from the clean packed consumer.');
`);
await writeFile(join(consumer, 'types.ts'), `import type { ImageInfo, ImagePlan, StoreImageOptions, StoredImage, RetrieveImageOptions, RetrievedImage, TransactionParameterPolicy } from 'arkiv-images';
import { ImageSchema, VERSION, inspectImage, planImage, MAX_EXPIRATION_BLOCKS } from 'arkiv-images';
const policy: TransactionParameterPolicy = context => ({ gas: context.defaults.gas, gasPrice: context.defaults.gasPrice });
const accepts = (_: ImageInfo | ImagePlan | StoreImageOptions | StoredImage | RetrieveImageOptions | RetrievedImage) => policy;
void [accepts, ImageSchema, VERSION, inspectImage, planImage, MAX_EXPIRATION_BLOCKS];
`);
run(process.execPath, ['inspect.mjs'], consumer);
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'ES2022', 'types.ts'], consumer);
run(npm, ['install', '--no-audit', '--no-fund'], join(root, 'sample')); run(npm, ['run', 'build'], join(root, 'sample'));
const artifact = { name: 'arkiv-images', version: '1.0.0', published: false, sha256: createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, bytes: bytes.length, cleanPackedConsumer: true };
await writeFile('candidate-artifact.json', JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify(artifact));
