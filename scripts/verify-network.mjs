// Read-only verification of the current Rabdi seed evidence. Never creates entities.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, MissingAccessKeyError } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { http } from 'viem';
import { retrieveImage } from '../dist/index.js';
let queries = 0;
try {
  const accessKey = process.env.ARKIV_ACCESS_KEY_A ?? process.env.ARKIV_ACCESS_KEY;
  if (!accessKey) throw new MissingAccessKeyError('Rabdi');
  const chain = rabdi({ accessKey });
  const transport = config => {
    const resolved = http(chain.rpcUrls.default.http[0], { retryCount: 0, timeout: 30000, fetchOptions: { cache: 'no-store' } })(config);
    return { ...resolved, request: args => { if (args.method === 'arkiv_query') queries++; return resolved.request(args); } };
  };
  const publicClient = createPublicClient({ chain, transport });
  assert.equal(await publicClient.getChainId(), 7794095);
  const evidence = JSON.parse(await readFile(new URL('../docs/rabdi-evidence.json', import.meta.url), 'utf8'));
  assert.equal(evidence.chainId, 7794095);
  for (const entry of evidence.cases) {
    const result = await retrieveImage({ publicClient, imageKey: entry.imageKey, expectedSha256: entry.sha256 });
    assert.equal(result.byteLength, entry.bytes); assert.equal(result.contentType, entry.format);
    assert.equal(result.width, entry.width); assert.equal(result.height, entry.height);
    for (const tx of entry.transactions) assert.equal((await publicClient.getTransactionReceipt({ hash: tx.hash })).status, 'success');
    console.log(JSON.stringify({ imageKey: entry.imageKey, sha256: result.sha256, bytes: result.byteLength, verified: true }));
  }
  await assert.rejects(retrieveImage({ publicClient, imageKey: `0x${'00'.repeat(32)}` }), { code: 'NOT_FOUND' });
  console.log(JSON.stringify({ queriesKeyA: queries, signing: false }));
} catch (error) {
  console.error(error instanceof MissingAccessKeyError ? 'Configure ARKIV_ACCESS_KEY from https://hub.arkiv.network/access-keys.' : 'Read-only Rabdi verification failed. Check the seed evidence and network; no raw provider error was logged.');
  console.error(JSON.stringify({ queriesKeyA: queries, signing: false })); process.exitCode = 1;
}
