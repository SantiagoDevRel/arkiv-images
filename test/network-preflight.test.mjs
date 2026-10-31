import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { storeImage } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

const chain = rabdi({ accessKey: 'example-test' });

for (const [kind, malformed] of [
  ['decimal string', String(chain.id)],
  ['number', chain.id],
  ['array', [`0x${chain.id.toString(16)}`]],
]) {
  test(`malformed wallet chain ID (${kind}) stops before any SDK transaction`, async () => {
    const rpc = rpcHarness();
    let chainChecks = 0;
    const walletProvider = {
      request(args) {
        // First two responses cover the package's preflight checks. Later SDK calls would
        // receive valid chain data: a malformed preflight must not reach those writes.
        if (args.method === 'eth_chainId' && ++chainChecks <= 2) return Promise.resolve(malformed);
        return rpc.request(args);
      },
    };
    const publicClient = createPublicClient({ chain, transport: custom(rpc, { retryCount: 0 }) });
    const walletClient = createWalletClient({ chain, account: TEST_ACCOUNT,
      transport: custom(walletProvider, { retryCount: 0 }), pollingInterval: 1 });
    await assert.rejects(storeImage({ publicClient, walletClient, bytes: png(),
      filename: 'preflight.png', expirationBlocks: 3600 }), { code: 'NETWORK_MISMATCH' });
    assert.equal(chainChecks, 1);
    assert.equal(rpc.transactions.length, 0);
  });
}
