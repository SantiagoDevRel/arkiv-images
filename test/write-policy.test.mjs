import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { storeImage, MAX_EXPIRATION_BLOCKS } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

function clients(intercept) {
  const rpc = rpcHarness();
  const transport = () => custom({ request: async args => intercept ? intercept(args, rpc) : rpc.request(args) }, { retryCount: 0 });
  const chain = rabdi({ accessKey: 'example-test' });
  return { rpc, publicClient: createPublicClient({ chain, transport: transport() }), walletClient: createWalletClient({ chain, account: TEST_ACCOUNT, transport: transport(), pollingInterval: 1 }) };
}
const input = { bytes: png(), filename: 'public.png', expirationBlocks: 3600 };

test('each real SDK write supplies gas/price/latest nonce and unsigned estimation at latest', async () => {
  const c = clients(); const contexts = [];
  const result = await storeImage({ ...c, ...input, bytes: png(120001), txParams: context => { contexts.push(context); return {}; } });
  assert.equal(result.transactionHashes.length, 5);
  assert.equal(contexts.length, 5);
  for (const tx of c.rpc.transactions) {
    assert.ok(BigInt(tx.gas) >= 1000000n && BigInt(tx.gas) <= 15000000n);
    assert.equal(BigInt(tx.gasPrice), 1n);
  }
  assert.ok(contexts.every(c => c.defaults.gas >= c.estimate * 2n));
  assert.ok(c.rpc.requests.filter(r => r.method === 'eth_estimateGas' || r.method === 'eth_getTransactionCount').every(r => r.params[1] === 'latest'));
});

test('estimate failure and half-block overflow stop before any signature', async () => {
  for (const mode of ['failure', 'overflow']) {
    const c = clients((args, rpc) => {
      if (args.method === 'eth_estimateGas') { if (mode === 'failure') throw Error('provider detail'); return '0x7a1200'; }
      return rpc.request(args);
    });
    await assert.rejects(storeImage({ ...c, ...input }), { code: mode === 'overflow' ? 'INVALID_INPUT' : 'UPLOAD_FAILED' });
    assert.equal(c.rpc.transactions.length, 0);
  }
});

test('lifetime above the inclusion margin fails without RPC, accepted maximum is absolute', async () => {
  const c = clients();
  await assert.rejects(storeImage({ ...c, ...input, expirationBlocks: MAX_EXPIRATION_BLOCKS + 1 }), { code: 'INVALID_INPUT' });
  assert.equal(c.rpc.requests.length, 0);
  await storeImage({ ...c, ...input, expirationBlocks: MAX_EXPIRATION_BLOCKS });
  assert.equal(BigInt(c.rpc.entities[0].expiresAt), 42n + BigInt(MAX_EXPIRATION_BLOCKS));
});

test('SDK-success root key and hash survive an unresolved receipt recheck without resend', async () => {
  let sdkSucceeded = false;
  const c = clients((args, rpc) => args.method === 'eth_getTransactionReceipt' && sdkSucceeded ? null : rpc.request(args));
  const walletClient = { ...c.walletClient, createEntity: async (...args) => { const result = await c.walletClient.createEntity(...args); sdkSucceeded = true; return result; } };
  await assert.rejects(storeImage({ ...c, ...input, walletClient }), error => error.code === 'CONFIRMATION_PENDING' && /^0x[\da-f]{64}$/i.test(error.imageKey) && error.transactionHashes.length === 1);
  assert.equal(c.rpc.transactions.length, 1);
});
