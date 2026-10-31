// Idempotent synthetic sample seed. Never retries an ambiguous write.
import assert from 'node:assert/strict';
import { readFile, writeFile, open, unlink } from 'node:fs/promises';
import { createPublicClient, createWalletClient, MissingAccessKeyError } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { eq } from '@arkiv-network/sdk/query';
import { str } from '@arkiv-network/sdk/schema';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hashFile } from 'arkiv-chunking';
import { ImageSchema, storeImage, retrieveImage, ImageStorageError, ChunkingError, MAX_EXPIRATION_BLOCKS } from '../dist/index.js';
import { png } from '../test/fixtures.mjs';

let queries = 0;
const statePath = process.env.ARKIV_SEED_STATE ?? new URL('../.seed-rabdi-state.json', import.meta.url);
async function readState() {
  try { return JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { cases: {} }; throw error; }
}
async function main() {
  const accessKey = process.env.ARKIV_ACCESS_KEY_A ?? process.env.ARKIV_ACCESS_KEY;
  if (!accessKey) throw new MissingAccessKeyError('Rabdi');
  const chain = rabdi({ accessKey });
  if (!process.env.TEST_IMAGES_PRIVATE_KEY) throw Error('Configure the lane test wallet locally, outside the checkout.');
  const account = privateKeyToAccount(process.env.TEST_IMAGES_PRIVATE_KEY);
  assert.equal(account.address.toLowerCase(), process.env.TEST_IMAGES_ADDRESS?.toLowerCase(), 'Lane wallet address mismatch.');
  const transport = () => config => {
    const resolved = http(chain.rpcUrls.default.http[0], { retryCount: 0, timeout: 30000, fetchOptions: { cache: 'no-store' } })(config);
    return { ...resolved, request: args => { if (args.method === 'arkiv_query') queries++; return resolved.request(args); } };
  };
  const publicClient = createPublicClient({ chain, transport: transport() });
  const walletClient = createWalletClient({ chain, account, transport: transport() });
  assert.equal(await publicClient.getChainId(), 7794095);
  const jpeg = new Uint8Array(await readFile(new URL('../test/fixtures/public.jpg', import.meta.url)));
  const comment = Buffer.alloc(63512, 120); comment[0] = 255; comment[1] = 254; comment.writeUInt16BE(63510, 2);
  const largeJpeg = new Uint8Array(Buffer.concat([jpeg.subarray(0,2), comment, comment, jpeg.subarray(2)]));
  const inputs = [
    ['rabdi-public-inline.png', png(120000, 320, 200)], ['rabdi-public-chunked.png', png(120001, 320, 200)],
    ['rabdi-public-inline.jpg', jpeg], ['rabdi-public-chunked.jpg', largeJpeg],
  ];
  const state = await readState(), cases = [];
  for (const [filename, bytes] of inputs) {
    const sha256 = await hashFile(bytes);
    const found = await publicClient.select({ $key: true }).from(ImageSchema).where(eq('sha256', str(sha256))).ownedBy(account.address).createdBy(account.address).limit(10).fetch();
    let saved;
    for (const row of found.entities) {
      const verified = await retrieveImage({ publicClient, imageKey: row.$key, expectedSha256: sha256 });
      assert.deepEqual(verified.bytes, bytes);
      if (verified.filename === filename) { saved = { imageKey: row.$key, sha256, transactionHashes: state.cases[filename]?.transactionHashes ?? [] }; break; }
    }
    if (!saved) {
      const previous = state.cases[filename];
      if (previous?.inFlight) {
        // This library's INVALID_INPUT with no hashes/keys is raised before any SDK send.
        // Preserve that rejected preflight; never clear an uncertain or partially written upload.
        if (previous.code !== 'INVALID_INPUT' || previous.transactionHashes?.length || previous.imageKey || previous.manifestKey) throw Error('A previous seed write is unresolved. Inspect its preserved receipts; do not resend automatically.');
        (state.rejectedPreflights ??= []).push({ filename, ...previous });
      }
      const expirationBlocks = bytes.length <= 3000 ? MAX_EXPIRATION_BLOCKS : 3600;
      state.cases[filename] = { inFlight: true, sha256, expirationBlocks }; await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
      try {
        saved = await storeImage({ publicClient, walletClient, bytes, filename, expirationBlocks });
      } catch (error) {
        if (error instanceof ImageStorageError || error instanceof ChunkingError) {
          state.cases[filename] = { ...state.cases[filename], imageKey: error.imageKey, manifestKey: error.manifestKey, transactionHashes: error.transactionHashes, code: error.code };
          await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
        }
        throw error;
      }
    }
    state.cases[filename] = { ...saved, inFlight: false }; await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
    const verified = await retrieveImage({ publicClient, imageKey: saved.imageKey, expectedSha256: sha256 });
    assert.deepEqual(verified.bytes, bytes);
    const transactions = [];
    for (const hash of saved.transactionHashes) {
      const receipt = await publicClient.getTransactionReceipt({ hash }); const tx = await publicClient.getTransaction({ hash });
      assert.equal(receipt.status, 'success'); assert.ok(tx.gas >= receipt.gasUsed * 2n); assert.ok(tx.gas <= 15000000n);
      transactions.push({ hash, status: receipt.status, gasUsed: String(receipt.gasUsed), gasLimit: String(tx.gas), gasPrice: String(receipt.effectiveGasPrice), blockNumber: String(receipt.blockNumber) });
    }
    cases.push({ filename, imageKey: saved.imageKey, manifestKey: saved.manifestKey, sha256, mode: verified.mode, format: verified.contentType, bytes: bytes.length, width: verified.width, height: verified.height, expiresAt: String(verified.expiresAt), byteExact: true, transactions });
    console.log(JSON.stringify({ filename, imageKey: saved.imageKey, mode: verified.mode, bytes: bytes.length, byteExact: true }));
  }
  const report = { network: 'Rabdi', chainId: 7794095, sdk: '1.0.0', package: 'arkiv-images@1.0.0 candidate', verifiedAt: new Date().toISOString(), queriesKeyA: queries, cases };
  await writeFile(new URL('../docs/rabdi-evidence.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  await writeFile(new URL('../sample/public/samples.json', import.meta.url), JSON.stringify({ chainId: 7794095, cases }, null, 2) + '\n');
  console.log(JSON.stringify({ queriesKeyA: queries, signedWithFunder: false }));
}
try {
  const lockPath = typeof statePath === 'string' ? statePath + '.lock' : new URL(statePath.href + '.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  try { await main(); }
  finally { await lock.close(); await unlink(lockPath); }
}
catch (error) {
  console.error(error instanceof MissingAccessKeyError ? 'Configure ARKIV_ACCESS_KEY from https://hub.arkiv.network/access-keys.' : 'Seed stopped. Preserve .seed-rabdi-state.json and inspect confirmed or unresolved writes before running it again.');
  console.error(JSON.stringify({ code: error instanceof ImageStorageError || error instanceof ChunkingError ? error.code : 'SEED_FAILED', queriesKeyA: queries }));
  process.exitCode = 1;
}
