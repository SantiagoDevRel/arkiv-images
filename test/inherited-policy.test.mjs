import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, EntityMutationError } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { createImageWriteOperation } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

const phases = [
  ['inline root', 1, undefined], ['chunked manifest', 1, 120001],
  ['second chunk', 3, 120001], ['manifest finalization', 4, 120001],
  ['chunked image root', 5, 120001],
];
for (const [phase, failAt, size] of phases) for (const lookup of ['null', 'throws']) {
  test(`inherited policy retains wrapped uncertain ${phase} hash after receipt ${lookup}`, async () => {
    const rpc = rpcHarness();
    let uncertainHash, sends = 0;
    const provider = { request: async args => {
      if (args.method === 'eth_getTransactionReceipt' && args.params[0] === uncertainHash) {
        if (lookup === 'throws') throw Error('Receipt transport unavailable');
        return null;
      }
      return rpc.request(args);
    } };
    const chain = rabdi({ accessKey: 'controlled-test' });
    const publicClient = createPublicClient({ chain, transport: custom(provider, { retryCount: 0 }) });
    const sdk = createWalletClient({ chain, account: TEST_ACCOUNT, transport: custom(provider, { retryCount: 0 }), pollingInterval: 1 });
    const mutate = async callback => {
      const result = await callback();
      if (++sends === failAt) {
        uncertainHash = result.txHash;
        throw Error('Wrapped SDK confirmation error', { cause: new EntityMutationError('Mutation confirmation lost', { txHash: uncertainHash }) });
      }
      return result;
    };
    const walletClient = { ...sdk, createEntity: (...args) => mutate(() => sdk.createEntity(...args)), patchEntity: (...args) => mutate(() => sdk.patchEntity(...args)) };
    const operation = createImageWriteOperation({ publicClient, walletClient, bytes: png(size), filename: 'public.png', expirationBlocks: 3600 });
    const first = operation.run();
    let failure;
    await assert.rejects(first, error => { failure = error; return true; });
    assert.equal(operation.run(), first, 'A later click reuses the original promise');
    await operation.run().catch(() => {});
    assert.equal(sends, failAt);
    assert.equal(rpc.transactions.length, failAt);
    console.log(JSON.stringify({ inheritedPhase: phase, lookup, noResend: true }));
    assert.ok(uncertainHash);
    const expected = rpc.transactions.map(tx => tx.hash);
    assert.deepEqual(failure.transactionHashes, expected, 'must retain inherited uncertain hash');
    assert.deepEqual(operation.transactionHashes, expected);
    assert.equal(failure.code, 'CONFIRMATION_PENDING');
    assert.equal(operation.state, 'submitted');
    if (size && failAt > 1) assert.equal(failure.manifestKey, rpc.entities[0].key);
  });
}
