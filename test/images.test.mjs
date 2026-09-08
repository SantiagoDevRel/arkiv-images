import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { inspectImage, planImage, storeImage, retrieveImage, MAX_IMAGE_BYTES, INLINE_MAX_BYTES } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';
function clients(rpc = rpcHarness()) {
  const publicClient = createPublicClient({ chain: tiramisu, transport: custom(rpc, { retryCount: 0 }) });
  const walletClient = createWalletClient({ chain: tiramisu, account: TEST_ACCOUNT, transport: custom(rpc, { retryCount: 0 }), pollingInterval: 1 });
  return { publicClient, walletClient, rpc };
}
test('inspect known PNG and reject unsupported, empty, truncated, mismatched MIME, huge dimensions and oversized bytes', () => {
  assert.deepEqual(inspectImage(png()), { contentType: 'image/png', width: 1, height: 1, byteLength: png().length });
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('<svg/>'), png().subarray(0,40)]) assert.throws(() => inspectImage(bytes), { code: 'INVALID_IMAGE' });
  assert.throws(() => inspectImage(png(), 'image/jpeg'), { code: 'INVALID_IMAGE' });
  const huge = png(); new DataView(huge.buffer).setUint32(16, 0xffffffff);
  assert.throws(() => inspectImage(huge), { code: 'INVALID_IMAGE' });
  assert.throws(() => inspectImage(new Uint8Array(MAX_IMAGE_BYTES + 1)), { code: 'TOO_LARGE' });
});
test('plans both sides of threshold and exact maximum', () => {
  assert.equal(planImage(INLINE_MAX_BYTES).transactionCount, 1);
  assert.equal(planImage(INLINE_MAX_BYTES + 1).transactionCount, 5);
  assert.equal(planImage(MAX_IMAGE_BYTES).chunkCount, 263);
  for (const n of [0,-1,NaN,1.1]) assert.throws(() => planImage(n), { code: 'INVALID_INPUT' });
  assert.throws(() => planImage(MAX_IMAGE_BYTES + 1), { code: 'TOO_LARGE' });
});
for (const size of [undefined, INLINE_MAX_BYTES, INLINE_MAX_BYTES + 1, 310_001]) {
  test(`actual SDK encoding and exact-byte roundtrip for ${size ?? 'tiny'} PNG`, async () => {
    const c = clients(), bytes = png(size);
    const stored = await storeImage({ ...c, bytes, filename: 'public.png', expirationBlocks: 3600 });
    assert.equal(c.rpc.transactions.length, planImage(bytes.length).transactionCount);
    assert.ok(c.rpc.transactions.every(t => t.calldataBytes < 122880));
    const root = c.rpc.entities.at(-1);
    assert.equal(root.creationFlags.raw, 1);
    const retrieved = await retrieveImage({ publicClient: c.publicClient, imageKey: stored.imageKey, expectedSha256: stored.sha256 });
    assert.deepEqual(retrieved.bytes, bytes);
    console.log(JSON.stringify({ bytes: bytes.length, transactions: stored.transactionHashes.length, calldata: c.rpc.transactions.map(t => t.calldataBytes) }));
    await assert.rejects(retrieveImage({ publicClient: c.publicClient, imageKey: stored.imageKey, expectedSha256: `0x${'11'.repeat(32)}` }), { code: 'HASH_MISMATCH' });
  });
}
test('wrong network and rejected wallet do not report success', async () => {
  const c = clients();
  await assert.rejects(storeImage({ ...c, publicClient: { ...c.publicClient, chain: { id: 1, testnet: false } }, bytes: png(), filename: 'x.png', expirationBlocks: 1000 }), { code: 'NETWORK_MISMATCH' });
  await assert.rejects(storeImage({ ...c, walletClient: { ...c.walletClient, createEntity: async () => { throw Object.assign(Error('reject'), { code: 4001 }); } }, bytes: png(), filename: 'x.png', expirationBlocks: 1000 }), { code: 'UPLOAD_FAILED' });
  assert.equal(c.rpc.transactions.length, 0);
});
test('not found, provider failure and corrupted inline data fail closed', async () => {
  const c = clients();
  await assert.rejects(retrieveImage({ ...c, imageKey: `0x${'00'.repeat(32)}` }), { code: 'NOT_FOUND' });
  await assert.rejects(retrieveImage({ ...c, publicClient: { ...c.publicClient, getChainId: async () => { throw Error('private RPC details'); } }, imageKey: `0x${'00'.repeat(32)}` }), { code: 'READ_FAILED' });
  const saved = await storeImage({ ...c, bytes: png(), filename: 'x.png', expirationBlocks: 1000 });
  c.rpc.entities[0].payload = c.rpc.entities[0].payload.replace('49444154', '49444155');
  await assert.rejects(retrieveImage({ ...c, imageKey: saved.imageKey }), { code: 'INVALID_IMAGE' });
});
test('failed image-root write preserves confirmed chunk manifest and receipts', async () => {
  const c = clients(); let creates = 0;
  const walletClient = { ...c.walletClient, createEntity: async args => { if (++creates === 4) throw Error('rejected root'); return c.walletClient.createEntity(args); } };
  await assert.rejects(storeImage({ ...c, walletClient, bytes: png(120001), filename: 'x.png', expirationBlocks: 1000 }), error => error.code === 'UPLOAD_FAILED' && Boolean(error.manifestKey) && error.transactionHashes.length === 4);
});
test('JPEG bytes and dimensions survive the real SDK roundtrip', async () => {
  const bytes=new Uint8Array(await readFile(new URL('./fixtures/public.jpg',import.meta.url))),c=clients();
  assert.deepEqual(inspectImage(bytes),{contentType:'image/jpeg',width:320,height:200,byteLength:2977});
  const saved=await storeImage({...c,bytes,filename:'public.jpg',contentType:'image/jpeg',expirationBlocks:1000});
  assert.deepEqual((await retrieveImage({...c,imageKey:saved.imageKey})).bytes,bytes);
});
test('longest filename and maximum inline payload fit complete transaction budget', async () => {
  const c=clients();await storeImage({...c,bytes:png(120000),filename:'a'.repeat(124)+'.png',expirationBlocks:1000});
  assert.ok(c.rpc.transactions[0].calldataBytes+400<131072);
  console.log('maximum-inline-filename-calldata',c.rpc.transactions[0].calldataBytes);
  await assert.rejects(storeImage({...c,bytes:png(),filename:'a'.repeat(129),expirationBlocks:1000}),{code:'INVALID_INPUT'});
});
test('missing chunk and mutated root metadata never return partial bytes', async () => {
  const c=clients(),saved=await storeImage({...c,bytes:png(120001),filename:'public.png',expirationBlocks:1000});
  c.rpc.entities[1].attributes.find(a=>a.name==='manifest').value=`0x${'ee'.repeat(32)}`;
  await assert.rejects(retrieveImage({...c,imageKey:saved.imageKey}),{code:'MISSING_CHUNK'});
  c.rpc.entities.at(-1).attributes.find(a=>a.name==='mime').value='image/svg+xml';
  await assert.rejects(retrieveImage({...c,imageKey:saved.imageKey}),{code:'INVALID_ENTITY'});
});
test('25 MiB policy ceiling reconstructs across the 200-entity page boundary', async () => {
  const c=clients(),bytes=png(MAX_IMAGE_BYTES);
  const saved=await storeImage({...c,bytes,filename:'maximum.png',expirationBlocks:3600});
  const result=await retrieveImage({...c,imageKey:saved.imageKey,expectedSha256:saved.sha256});
  assert.deepEqual(result.bytes,bytes);assert.equal(saved.transactionHashes.length,266);
  assert.ok(c.rpc.requests.some(r=>r.method==='arkiv_query'&&r.params[1].cursor));
  assert.ok(c.rpc.transactions.every(t=>t.calldataBytes<122880));
});
