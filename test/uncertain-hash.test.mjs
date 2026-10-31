import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, EntityMutationError } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { createImageWriteOperation } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

for (const [phase, failAt, size] of [['inline root', 1, undefined], ['second chunk', 3, 120001], ['manifest finalization', 4, 120001]]) {
  for (const lookup of ['null', 'throws']) {
    test(`uncertain ${phase} hash is retained before a receipt lookup that ${lookup}`, async () => {
      const rpc = rpcHarness();
      let operation, uncertainHash, sends = 0, beforeLookup;
      const provider = { request: async args => {
        if (args.method === 'eth_getTransactionReceipt' && args.params[0] === uncertainHash) {
          beforeLookup = [...operation.transactionHashes];
          if (lookup === 'throws') throw Error('Receipt transport unavailable');
          return null;
        }
        return rpc.request(args);
      } };
      const chain = rabdi({ accessKey: 'example-test' });
      const publicClient = createPublicClient({ chain, transport: custom(provider, { retryCount: 0 }) });
      const sdk = createWalletClient({ chain, account: TEST_ACCOUNT, transport: custom(provider, { retryCount: 0 }), pollingInterval: 1 });
      const mutate = async callback => {
        const result = await callback();
        if (++sends === failAt) {
          uncertainHash = result.txHash;
          // Public SDK error: the transaction was sent, but its mutation result is uncertain.
          throw new EntityMutationError('Mutation confirmation lost', { txHash: uncertainHash });
        }
        return result;
      };
      const walletClient = {
        ...sdk,
        createEntity: (...args) => mutate(() => sdk.createEntity(...args)),
        patchEntity: (...args) => mutate(() => sdk.patchEntity(...args)),
      };
      operation = createImageWriteOperation({ publicClient, walletClient, bytes: png(size), filename: 'public.png', expirationBlocks: 3600 });
      const first = operation.run();
      let failure;
      await assert.rejects(first, error => { failure = error; return error.code === 'CONFIRMATION_PENDING'; });
      const expected = rpc.transactions.map(tx => tx.hash);
      assert.ok(uncertainHash);
      assert.deepEqual(beforeLookup, expected, 'Every observed hash, including the uncertain write, must be retained before consulting its receipt');
      assert.deepEqual(failure.transactionHashes, expected, 'The returned error must retain the uncertain hash exactly once');
      assert.deepEqual(operation.transactionHashes, expected);
      if (size) assert.equal(failure.manifestKey, rpc.entities[0].key);
      assert.equal(operation.state, 'submitted');
      assert.equal(operation.run(), first, 'A later click cannot start another send');
      await operation.run().catch(() => {});
      assert.equal(sends, failAt);
      assert.equal(rpc.transactions.length, failAt);
      assert.deepEqual(operation.transactionHashes, expected);
    });
  }
}
