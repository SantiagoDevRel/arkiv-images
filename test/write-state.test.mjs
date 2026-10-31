import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom, toHex } from 'viem';
import { createImageWriteOperation } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

test('async sample setup runs once after the persistent sending guard is stored', async () => {
  let calls = 0, operation;
  operation = createImageWriteOperation(async () => {
    calls++; assert.equal(operation.state, 'sending');
    throw Error('Setup rejected before signing');
  });
  const first = operation.run();
  assert.equal(operation.state, 'sending'); assert.equal(calls, 0);
  await assert.rejects(first, /Setup rejected/);
  assert.equal(operation.run(), first); await operation.run().catch(() => {});
  assert.equal(calls, 1);
});

// The sample keeps this exact public operation object across clicks and re-renders.
// Real SDK encoding/receipt success is followed by controlled SDK or lookup outcomes.
for (const [scenario, sends] of [['non-gas revert', 1], ['gas-exhausted revert', 2], ['success then disagree', 1], ['success then null and new click', 1], ['uncertain', 1]]) {
  test(`persistent sample/library operation: ${scenario} => ${sends} sends`, async () => {
    const rpc = rpcHarness(), overrides = new Map();
    let operation, submittedBeforeLookup = false;
    const provider = { request: async args => {
      if (args.method === 'eth_getTransactionReceipt' && overrides.has(args.params[0])) {
        if (scenario.startsWith('success')) submittedBeforeLookup = operation.state === 'submitted' && operation.transactionHashes.includes(args.params[0]);
        return overrides.get(args.params[0]);
      }
      return rpc.request(args);
    } };
    const chain = rabdi({ accessKey: 'example-test' });
    const publicClient = createPublicClient({ chain, transport: custom(provider, { retryCount: 0 }) });
    const sdk = createWalletClient({ chain, account: TEST_ACCOUNT, transport: custom(provider, { retryCount: 0 }), pollingInterval: 1 });
    let calls = 0;
    const walletClient = { ...sdk, createEntity: async (...args) => {
      calls++;
      const result = await sdk.createEntity(...args);
      if (calls !== 1) return result;
      const receipt = await rpc.request({ method: 'eth_getTransactionReceipt', params: [result.txHash] });
      const gas = args[3].gas;
      if (scenario.endsWith('revert')) {
        overrides.set(result.txHash, { ...receipt, status: '0x0', gasUsed: toHex(scenario === 'gas-exhausted revert' ? gas : gas - 1n) });
        rpc.entities.pop();
        throw Object.assign(Error('Confirmed reverted SDK result'), { txHash: result.txHash });
      }
      if (scenario === 'success then disagree') overrides.set(result.txHash, { ...receipt, status: '0x0', gasUsed: toHex(gas) });
      if (scenario === 'success then null and new click') overrides.set(result.txHash, null);
      if (scenario === 'uncertain') throw Error('Transport response lost; outcome unknown');
      return result;
    } };
    operation = createImageWriteOperation({ publicClient, walletClient, bytes: png(), filename: 'public.png', expirationBlocks: 3600 });
    const first = operation.run();
    assert.equal(operation.state, 'sending');
    assert.equal(operation.run(), first, 'Concurrent click must use the same promise');
    if (scenario === 'gas-exhausted revert') {
      const result = await first; assert.ok(result.imageKey); assert.equal(operation.state, 'complete');
      assert.ok(BigInt(rpc.transactions[1].gas) >= 2n * BigInt(rpc.transactions[0].gas));
    } else {
      await assert.rejects(first, { code: scenario.startsWith('success') ? 'CONFIRMATION_PENDING' : 'UPLOAD_FAILED' });
      assert.equal(operation.state, scenario.startsWith('success') ? 'submitted' : 'uncertain');
    }
    assert.equal(operation.run(), first, 'A later new click retains the same terminal/pending operation');
    await operation.run().catch(() => {});
    assert.equal(calls, sends); assert.equal(rpc.transactions.length, sends);
    if (scenario.startsWith('success')) { assert.equal(submittedBeforeLookup, true); assert.equal(operation.transactionHashes.length, 1); assert.ok(operation.imageKey); }
    assert.ok(rpc.transactions.every(tx => BigInt(tx.gas) <= 15000000n));
  });
}
