import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { storeImage, retrieveImage } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

// Exercise the actual consumer helper against the package build and real SDK.
// The sample browser tests independently use its installed npm release.
const source = await readFile(new URL('../sample/src/inspection.ts', import.meta.url), 'utf8');
let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
for (const specifier of ['@arkiv-network/sdk/attr', '@arkiv-network/sdk/query', 'arkiv-images']) {
  const resolved = specifier === 'arkiv-images' ? new URL('../dist/index.js', import.meta.url).href : import.meta.resolve(specifier);
  outputText = outputText.replaceAll(`'${specifier}'`, JSON.stringify(resolved));
}
const { inspectImageEntities, InspectionError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

async function fixture(size = 120001) {
  const rpc = rpcHarness();
  const publicClient = createPublicClient({ chain: tiramisu, transport: custom(rpc, { retryCount: 0 }) });
  const walletClient = createWalletClient({ chain: tiramisu, account: TEST_ACCOUNT, transport: custom(rpc, { retryCount: 0 }), pollingInterval: 1 });
  const bytes = png(size);
  const stored = await storeImage({ publicClient, walletClient, bytes, filename: 'image.png', expirationBlocks: 3600 });
  const verified = await retrieveImage({ publicClient, imageKey: stored.imageKey });
  return { rpc, publicClient, stored, verified };
}
const inspect = c => inspectImageEntities(c.publicClient, c.stored.imageKey, c.verified);
function setAttr(entity, name, value, type) {
  const attribute = entity.attributes.find(item => item.name === name);
  attribute.value = value;
  if (type) attribute.type = type;
}

test('inline inspection returns actual typed attributes and payload without extra entity queries or writes', async () => {
  const c = await fixture(120000);
  // Extra application metadata must survive; the UI cannot manufacture a closed schema.
  c.rpc.entities[0].attributes.push({ name: 'label', type: 'str', value: 'A real attribute' });
  const txCount = c.rpc.transactions.length, start = c.rpc.requests.length;
  const result = await inspect(c);
  assert.equal(result.mode, 'inline');
  assert.equal(result.root.key, c.stored.imageKey);
  assert.equal(result.root.owner.toLowerCase(), TEST_ACCOUNT);
  assert.equal(result.root.expiresAt, c.verified.expiresAt);
  assert.equal(result.root.contentType, 'image/png');
  assert.deepEqual(result.root.payload, c.verified.bytes);
  assert.deepEqual(result.root.attributes.find(a => a.name === 'size'), { name: 'size', type: 'u64', value: 120000n });
  assert.deepEqual(result.root.attributes.find(a => a.name === 'label'), { name: 'label', type: 'str', value: 'A real attribute' });
  assert.equal(result.manifest, undefined);
  assert.deepEqual(result.chunks, []);
  assert.equal(c.rpc.requests.slice(start).filter(r => r.method === 'arkiv_query').length, 1);
  assert.equal(c.rpc.transactions.length, txCount);
  assert.match(result.queries.root, /where\(eq\('\$key', key\('/);
});

test('chunk inspection uses one snapshot, actual keys, owner/creator filtering and byte ranges', async () => {
  const c = await fixture(), start = c.rpc.requests.length, txCount = c.rpc.transactions.length;
  const result = await inspect(c);
  assert.equal(result.root.payload.length, 0);
  assert.equal(result.manifest.key, c.stored.manifestKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(result.manifest.payload)), { filename: 'image.png', contentType: 'image/png' });
  assert.deepEqual(result.chunks.map(c => [c.seq, c.byteStart, c.byteEndExclusive, c.payload.length]), [[0, 0, 100000, 100000], [1, 100000, 120001, 20001]]);
  assert.deepEqual(Buffer.concat(result.chunks.map(c => c.payload)), Buffer.from(c.verified.bytes));
  const queries = c.rpc.requests.slice(start).filter(r => r.method === 'arkiv_query');
  assert.equal(queries.length, 3);
  assert.ok(queries.slice(1).every(q => BigInt(q.params[1].atBlock) === result.blockNumber));
  assert.ok(queries[2].params[0].includes('$owner') && queries[2].params[0].includes('$creator'));
  assert.match(result.queries.chunks, /\.ownedBy\('/);
  assert.match(result.queries.chunks, /\.createdBy\('/);
  assert.match(result.queries.chunks, /\.atBlock\(\d+n\)/);
  assert.equal(c.rpc.transactions.length, txCount);
});

test('post-retrieval root and manifest mutations never become verified inspection facts', async () => {
  for (const mutate of [
    c => setAttr(c.rpc.entities.at(-1), 'filename', 'changed.png'),
    c => setAttr(c.rpc.entities.at(-1), 'width', '0x2'),
    c => setAttr(c.rpc.entities.at(-1), 'sha256', `0x${'ff'.repeat(32)}`),
    c => setAttr(c.rpc.entities.at(-1), 'manifest', `0x${'ee'.repeat(32)}`),
    c => { c.rpc.entities.at(-1).payload = '0x00'; },
    c => setAttr(c.rpc.entities[0], 'complete', false),
    c => setAttr(c.rpc.entities[0], 'totalbytes', '0x1'),
    c => setAttr(c.rpc.entities[0], 'chunkcount', '0x3'),
    c => setAttr(c.rpc.entities[0], 'chunksize', '0x1'),
    c => setAttr(c.rpc.entities[0], 'sha256', `0x${'aa'.repeat(32)}`),
    c => { c.rpc.entities[0].payload = '0x7b7d'; },
    c => { c.rpc.entities[0].expiresAt = '0xffff'; },
  ]) {
    const c = await fixture();
    mutate(c);
    await assert.rejects(inspect(c), InspectionError);
    assert.equal(c.verified.bytes.length, 120001, 'The already retrieved image remains available');
  }
});

test('missing, duplicate, oversized, reordered and corrupted chunks cannot misdescribe recovered bytes', async () => {
  for (const mutate of [
    c => setAttr(c.rpc.entities[1], 'manifest', `0x${'ee'.repeat(32)}`),
    c => setAttr(c.rpc.entities[2], 'seq', '0x0'),
    c => setAttr(c.rpc.entities[2], 'seq', '0x2'),
    c => { c.rpc.entities[2].key = c.rpc.entities[1].key; },
    c => { c.rpc.entities[1].payload += 'ff'; },
    c => { c.rpc.entities[1].payload = `0x00${c.rpc.entities[1].payload.slice(4)}`; },
    c => { setAttr(c.rpc.entities[1], 'seq', '0x1'); setAttr(c.rpc.entities[2], 'seq', '0x0'); },
    c => { c.rpc.entities[1].owner = `0x${'aa'.repeat(20)}`; },
    c => { c.rpc.entities[1].creator = `0x${'aa'.repeat(20)}`; },
    c => { c.rpc.entities[1].expiresAt = '0x0'; },
    c => { c.rpc.entities.push({ ...c.rpc.entities[1], key: `0x${'bb'.repeat(32)}` }); },
  ]) {
    const c = await fixture();
    mutate(c);
    await assert.rejects(inspect(c), InspectionError);
  }
});

test('inline byte mutation and network/provider failures are sanitized', async () => {
  const c = await fixture(120000);
  c.rpc.entities[0].payload = `0x00${c.rpc.entities[0].payload.slice(4)}`;
  await assert.rejects(inspect(c), InspectionError);
  await assert.rejects(inspectImageEntities({ ...c.publicClient, getChainId: async () => 1 }, c.stored.imageKey, c.verified), InspectionError);
  await assert.rejects(inspectImageEntities({ ...c.publicClient, select: () => { throw Error('https://secret.example/?key=secret'); } }, c.stored.imageKey, c.verified), error => error instanceof InspectionError && !error.message.includes('secret') && error.cause === undefined);
});

test('inspection follows pagination beyond 200 entities with a verified size bound', async () => {
  const c = await fixture(20_000_001), start = c.rpc.requests.length;
  const result = await inspect(c);
  assert.equal(result.chunks.length, 201);
  assert.equal(result.chunks.at(-1).byteEndExclusive, c.verified.byteLength);
  const queries = c.rpc.requests.slice(start).filter(r => r.method === 'arkiv_query');
  assert.ok(queries.some(q => q.params[1].cursor));
  assert.ok(queries.slice(1).every(q => BigInt(q.params[1].atBlock) === result.blockNumber));
});
