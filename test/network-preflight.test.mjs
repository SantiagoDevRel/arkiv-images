import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { custom } from 'viem';
import { storeImage } from '../dist/index.js';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

for (const [kind, malformed] of [
  ['decimal string', String(tiramisu.id)],
  ['number', tiramisu.id],
  ['array', [`0x${tiramisu.id.toString(16)}`]],
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
    const publicClient = createPublicClient({ chain: tiramisu, transport: custom(rpc, { retryCount: 0 }) });
    const walletClient = createWalletClient({ chain: tiramisu, account: TEST_ACCOUNT,
      transport: custom(walletProvider, { retryCount: 0 }), pollingInterval: 1 });
    await assert.rejects(storeImage({ publicClient, walletClient, bytes: png(),
      filename: 'preflight.png', expirationBlocks: 3600 }), { code: 'NETWORK_MISMATCH' });
    assert.equal(chainChecks, 1);
    assert.equal(rpc.transactions.length, 0);
  });
}
