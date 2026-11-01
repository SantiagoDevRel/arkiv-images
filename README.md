# arkiv-images

Store a public PNG or JPEG as queryable Arkiv entities, then retrieve its original bytes with size, MIME, dimensions and SHA-256 checks. Small images use one entity with a non-indexed `bytes()` column. Larger images use `arkiv-chunking`: an image entity references a file manifest and ordered immutable chunks.

**arkiv-images 1.0.2 targets Rabdi testnet.** It stores PNG/JPEG binary data in `bytes` columns. See [verification](docs/verification.md) for reproducible checks and separately labelled historical observations.

## Install and inspect

ESM, Node 22.10+ with Web Crypto, or a browser on HTTPS/localhost. Tested dependencies: SDK 1.0.0, viem 2.56.3, arkiv-chunking 1.1.0.

```sh
mkdir image-consumer
cd image-consumer
npm init -y
npm pkg set type=module
npm install arkiv-images@1.0.2 @arkiv-network/sdk@1.0.0 viem@2.56.3
```

Save `inspect.mjs`:

```js
import { inspectImage, planImage } from 'arkiv-images';
const bytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4V+L2HwAG5AK4X5zdSAAAAABJRU5ErkJggg==', 'base64'));
console.log(inspectImage(bytes));
console.log(planImage(bytes.length));
```

`node inspect.mjs` returns PNG, 1 × 1, 70 bytes, inline mode, one entity and one transaction. Inspection is local and needs no wallet, access key or network. Base64 embeds this example only; stored content is binary.

## Rabdi round trip

Rabdi is a DB-Chain testnet, chain ID **7794095**. Obtain your own [access key](https://hub.arkiv.network/access-keys) and [test funds](https://hub.arkiv.network/faucet). Configure a dedicated test wallet locally, outside source control; never send its private key in chat. Missing access keys fail closed with `MissingAccessKeyError`.

Save `roundtrip.mjs` in the consumer:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, MissingAccessKeyError } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { inspectImage, planImage, storeImage, retrieveImage } from 'arkiv-images';

if (!process.env.ARKIV_ACCESS_KEY) throw new MissingAccessKeyError('Rabdi');
if (!process.env.ARKIV_PRIVATE_KEY) throw Error('Configure a dedicated test wallet locally.');
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY });
const transport = () => http(chain.rpcUrls.default.http[0], {
  retryCount: 0, timeout: 30_000, fetchOptions: { cache: 'no-store' },
});
const publicClient = createPublicClient({ chain, transport: transport() });
const walletClient = createWalletClient({ chain, transport: transport(),
  account: privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY) });
const bytes = new Uint8Array(await readFile('example.png'));
console.log(inspectImage(bytes), planImage(bytes.length));
const stored = await storeImage({ publicClient, walletClient, bytes,
  filename: 'example.png', expirationBlocks: 3600 });
const recovered = await retrieveImage({ publicClient, imageKey: stored.imageKey,
  expectedSha256: stored.sha256 });
assert.deepEqual(recovered.bytes, bytes);
console.log({ imageKey: stored.imageKey, byteExact: true });
```

Run `node roundtrip.mjs` after configuring those environment variables locally. All original bytes, filename, metadata and wallet addresses are public, including EXIF/GPS. Use synthetic or non-sensitive images. There is no encryption, metadata stripping, resizing, recompression or read authorization. Entity Expiration removes data from current queries; it does not erase history or copies.

## Public API

| Export | Contract |
|---|---|
| `inspectImage(bytes, expectedContentType?)` | Size, static PNG/JPEG container, MIME and dimensions; no network or complete pixel decode. |
| `planImage(byteLength)` | Inline/chunked mode and measured entity/transaction count. No network. |
| `storeImage(options)` | Requires matching Rabdi public/wallet clients, bytes, basename, explicit `expirationBlocks`; optional content type, progress and per-write `txParams` policy. Returns imageKey, optional manifestKey, sha256, mode, dimensions and observed transaction hashes. |
| `createImageWriteOperation(optionsOrAsyncSetup)` | Create once per intentional upload and keep across UI renders/clicks. `run()` sets sending before setup/network calls and returns the same promise forever, including failed, uncertain or pending outcomes. Read-only state, imageKey and transactionHashes support recovery. |
| `retrieveImage(options)` | Public client, **image** key, optional independently trusted SHA-256 and progress. Returns original bytes, metadata, mode and earliest observed expiration. |
| `ImageSchema`, `IMAGE_TYPE` | SDK 1.0 named schema `arkiv-images/v2`. Binary `data` is stored without an index. Indexed type/mode/mime/sha256/manifest support discovery. Filename, size and dimensions are stored typed columns. |
| `ImageStorageError`, `ChunkingError` | Safe code/message; preserve imageKey/manifestKey and transactionHashes on failure. Raw causes can include provider details: never display or log them. |
| `TransactionParameterPolicy`, `Progress` | Public TypeScript integration types re-exported from chunking. |
| `VERSION`, `INLINE_MAX_BYTES`, `MAX_IMAGE_BYTES`, `MAX_IMAGE_PIXELS`, `MAX_EXPIRATION_BLOCKS`, `RABDI_MAX_LIFETIME_BLOCKS`, `EXPIRATION_INCLUSION_MARGIN_BLOCKS` | Implementation version (`1.0.2`) and enforced limits. |

Import types such as `ImageInfo`, `ImagePlan`, `StoreImageOptions`, `StoredImage`, `RetrieveImageOptions`, `RetrievedImage`, `ImageContentType` and `ImageErrorCode` directly from `arkiv-images`.

Limits: **120,000 bytes** inline; **25 MiB** per image; **40,000,000 pixels**. Chunking uses 100,000-byte slices. Larger files require N+3 transactions for N chunks. `planImage` computes this count. These are package admission limits, not a promise of every node's transaction budget.

Entity Expiration is whole blocks, at least `max(64, transactionCount + 32)` and at most **7,883,970**, leaving 30 blocks below Rabdi's 7,884,000-block maximum. There is no unlimited lifetime. Longer storage requires coordinated Lifetime Extension outside this API. The image root and manifest use the same absolute deadline; retrieval rejects independent deadline changes. Root existence alone does not guarantee availability of every chunk.

## Signing and recovery

Every part and the final root reuse the public `arkiv-chunking` write policy: an unsigned SDK request is estimated at `latest`; gas is at least `max(1_000_000, 2 × estimate)`, with explicit network gasPrice and a fresh latest nonce. The image API additionally stops before signing if that budget exceeds half the latest block gas limit. Longer expiration can substantially increase gas, so shorten Entity Expiration or choose a smaller image if the estimate exceeds that budget. Admitted byte/lifetime limits do not guarantee every combination fits the network's gas budget. `txParams` can increase gas or change fees; it cannot remove required headroom or override the latest nonce. Wallet account/network are checked before every signature.

Serialize writes from the same account. A retry is permitted only once after an authoritative gas-exhausted reverted receipt and only within the half-block gas ceiling. Successful or uncertain writes are never automatically resent. `CONFIRMATION_PENDING` preserves SDK-success hashes and root/manifest keys if a later receipt lookup is unresolved or disagrees. The operation enters `submitted` before that lookup. Browser consumers must keep a `createImageWriteOperation` object across renders and later clicks; `storeImage` is a one-call convenience for an intentional new upload. Inspect preserved receipts before explicitly creating another operation. The sample resets the operation only when you choose a file again. Other failures can also leave confirmed entities. There is no multi-transaction atomicity, rollback, resumable upload, independent part mutation/transfer/extension or automatic cleanup.

Retrieval uses latest-state keyset pages and verifies immutable chunks, owner/creator, sequence, lengths, metadata and digest; the manifest is rechecked before return. It does not claim a historical snapshot. An independently trusted digest pins bytes, not the publisher's identity. Missing/corrupt chunks never return a partial image.

The package checks containers, not full PNG CRC/JPEG entropy decoding or malware. Browser consumers must fully decode before upload and after retrieval, render only PNG/JPEG as images, treat filenames as text, handle decode failure and revoke Blob URLs. JPEG must end at its end-of-image marker; trailing padding is rejected.

## Troubleshooting

| Symptom | Action |
|---|---|
| `MissingAccessKeyError`, HTTP 401/403/429 | Configure your own network access key; check provider quota. The sample keeps its read key server-side. |
| `arkiv serves state at the chain head only` | Use `latest` for state reads, nonce and unsigned estimates; historical block hashes, safe/finalized state are unsupported. |
| Revert with gasUsed equal to gas limit | Use explicit gas with at least twice the latest estimate. The public policy owns the bounded retry; do not resend an uncertain write. |
| `INVALID_INPUT`, `NETWORK_MISMATCH` | Check Rabdi, whole-block lifetime, filename and 32-byte key/digest. |
| `INVALID_IMAGE`, `TOO_LARGE`, browser decode error | Choose a valid static PNG/JPEG within limits. Changing an extension does not convert it. |
| `NOT_FOUND`, `MISSING_CHUNK`, `INCOMPLETE_UPLOAD` | Check the image key, network, referenced parts and expiration; a manifest key is a different key type. |
| `INVALID_ENTITY`, `INVALID_MANIFEST`, `INVALID_CHUNK`, `HASH_MISMATCH` | Do not bypass integrity checks or display partial content. |
| `CONFIRMATION_PENDING`, `UPLOAD_FAILED` | Preserve recovery keys/hashes. Inspect receipts and the wallet before a new upload. |

## Sample and development

The [sample README](sample/README.md) explains the existing `arkiv-images-example` project and visitor-wallet setup. Reads use its own bounded `/api/rpc` endpoint and a server-side `ARKIV_ACCESS_KEY`; the visitor configures their own wallet RPC. No server signer. The sample pins the released registry package `arkiv-images@1.0.3`.

Give consumer agents [AGENTS.md](AGENTS.md) and [sample/AGENTS.md](sample/AGENTS.md) explicitly. The corresponding CLAUDE.md files only import those guides.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm pack
```

Tests distinguish controlled RPC, live Rabdi, packed installs and npm publication in [verification](docs/verification.md). Seed synthetic data with `node scripts/seed-rabdi.mjs` after build and local key configuration; it discovers matching live entities and never retries unresolved journal entries. Keep `.seed-rabdi-state.json` private and persistent between runs.

Breaking format changes are in [CHANGELOG.md](CHANGELOG.md). Historical evidence under docs stays dated; current checks are specified separately.

