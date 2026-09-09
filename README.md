# arkiv-images

Store a public PNG or JPEG as queryable Arkiv entities, then retrieve and display its original bytes. Small images use one entity. Larger images use the existing `arkiv-chunking` package: a discoverable image entity points to a file manifest, which links the ordered chunks. Retrieval checks size, format, dimensions and SHA-256 before returning the bytes.

**These packages are intended for testnet use.**

Version **0.1.1**. See [verification](docs/verification.md) for release evidence and [the npm registry](https://www.npmjs.com/package/arkiv-images/v/0.1.1) for availability. A locally packed artifact is not a published release.

## Install and inspect an image

ESM, Node **22.10+** with Web Crypto, or a current browser on HTTPS/localhost. The tested dependency combination is SDK **0.8.0**, viem **2.56.3**, `arkiv-chunking` **0.1.0**, Node **22.22.3**. SDK 0.7 and older are incompatible. Other SDK versions, runtimes and networks are not claimed tested; see the evidence matrix below.

```sh
mkdir image-consumer
cd image-consumer
npm init -y
npm pkg set type=module
npm install --save-exact arkiv-images@0.1.1 @arkiv-network/sdk@0.8.0 viem@2.56.3
```

Create `inspect.mjs`:

```js
import { inspectImage, planImage } from 'arkiv-images';

// Synthetic 1x1 PNG, no personal image or credentials.
const bytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4V+L2HwAG5AK4X5zdSAAAAABJRU5ErkJggg==', 'base64'));
console.log(inspectImage(bytes));
console.log(planImage(bytes.length));
```

```sh
node inspect.mjs
```

Expected: PNG, width `1`, height `1`, byte length `70`; mode `inline`, `entityCount: 1`, `transactionCount: 1`. This inspection is local: no wallet, RPC, funds or access key. Base64 is used only to embed this tiny example; the package stores binary bytes without base64 overhead.

## Store and retrieve on Tiramisu

Use **Tiramisu testnet, chain ID 7738577**, exported by `@arkiv-network/sdk/chains`. [Network connection details](https://stage.hub.arkiv.network/networks), [test GLM faucet](https://stage.hub.arkiv.network/faucet) and [access keys](https://stage.hub.arkiv.network/api-keys) are provided by the Hub staging environment, verified on 2026-09-08. The production Hub still showed retired Braga at verification time. The faucet and access-key pages require connecting/signing in with your own wallet; follow their on-screen verification and cooldown requirements. No faucet claim or new access-key issuance was needed or tested in this run. The RPC used below allows anonymous reads; write access and quotas depend on the provider. A provider access key does not replace a signing wallet. Never put an administrative provider key in a browser.

The [sample](https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/sample/README.md) uses **MetaMask or Rabby** to sign with the visitor's own wallet. No shared server signer or private key is needed. For a Node integration, configure a dedicated test wallet key **locally**, outside the checkout. Do not send private keys to an agent or put them in chat.

In the consumer above, save `roundtrip.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { inspectImage, planImage, storeImage, retrieveImage } from 'arkiv-images';

if (!process.env.ARKIV_PRIVATE_KEY) throw new Error('Configure ARKIV_PRIVATE_KEY locally.');
const bytes = new Uint8Array(await readFile('example.png'));
console.log(inspectImage(bytes), planImage(bytes.length));
const transport = () => http(process.env.ARKIV_RPC_URL ?? tiramisu.rpcUrls.default.http[0], {
  retryCount: 0, timeout: 30_000, fetchOptions: { cache: 'no-store' },
});
const publicClient = createPublicClient({ chain: tiramisu, transport: transport() });
const walletClient = createWalletClient({ chain: tiramisu, transport: transport(),
  account: privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY) });
const saved = await storeImage({ publicClient, walletClient, bytes, filename: 'example.png',
  expirationBlocks: 43_200 });
const image = await retrieveImage({ publicClient, imageKey: saved.imageKey,
  expectedSha256: saved.sha256 });
const identical = image.bytes.length === bytes.length && bytes.every((b,i) => b === image.bytes[i]);
if (!identical) throw new Error('Image bytes differ');
console.log({ imageKey: saved.imageKey, sha256: image.sha256, mode: image.mode,
  bytes: image.bytes.length, identical, expiresAt: String(image.expiresAt) });
```

Place a **non-sensitive PNG** at `example.png`. Then run:

```sh
node --env-file=/absolute/path/to/your-local-secret.env roundtrip.mjs
```

The local secret file uses ordinary `NAME=value` entries for `ARKIV_PRIVATE_KEY` and optionally `ARKIV_RPC_URL`. Supply your own values; no secrets are included here. If those variables already exist in the process environment, use `node roundtrip.mjs`.

Expected: a new 32-byte `imageKey`, SHA-256, the selected storage mode, byte count, `identical: true` and a queried expiration block. Writes spend **test GLM**. Keep the returned image key for retrieval after restarting. A read needs only `publicClient` and `imageKey`, not the wallet. To display the recovered bytes in a browser:

```js
const image = await retrieveImage({ publicClient, imageKey });
const blob = new Blob([new Uint8Array(image.bytes)], { type: image.contentType });
const bitmap = await createImageBitmap(blob); // full browser decode; may reject corrupt pixels
bitmap.close();
const url = URL.createObjectURL(blob);
document.querySelector('img').src = url;
// When replacing the image or unmounting: URL.revokeObjectURL(url).
```

## Read an existing image without a wallet

In the same clean consumer, save `read.mjs`:

```js
import { writeFile } from 'node:fs/promises';
import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { http } from 'viem';
import { retrieveImage } from 'arkiv-images';

const publicClient = createPublicClient({ chain: tiramisu,
  transport: http(tiramisu.rpcUrls.default.http[0], { retryCount: 0 }) });
const image = await retrieveImage({ publicClient, imageKey: process.argv[2] });
// Use a fixed local output path, not the untrusted stored filename.
const output = image.contentType === 'image/png' ? 'recovered.png' : 'recovered.jpg';
await writeFile(output, image.bytes, { flag: 'wx' });
console.log({ output, bytes: image.byteLength, sha256: image.sha256 });
```

Run `node read.mjs YOUR_IMAGE_ENTITY_KEY` with a key returned by a completed upload. Expected: a recovered image file and its byte count/digest. No signing wallet, funds or private key are needed. The output uses exclusive creation: if it already exists, choose another filename rather than silently overwriting it. Entities in the verification evidence can expire, so they are evidence, not permanent fixtures.

## Data model and queries

| Location | Contents |
|---|---|
| Image entity attributes | `type: str('arkiv-images/v1')`, `mode: str('inline'|'chunked')`, `mime: str(...)`, `filename: str(...)`, `sha256: bytes32(...)`, `size/width/height: u64(...)`; chunked mode adds `manifest: key(...)` |
| Inline payload | Original PNG/JPEG binary bytes; content type `image/png` or `image/jpeg` |
| Chunked image payload | Empty; the `manifest` attribute links to the file, rather than pretending the image is contained in this one payload |
| File manifest and chunks | The versioned `arkiv-chunking@0.1.0` format; the dependency owns splitting, sequencing, snapshot pagination, completion and integrity checks |

The image entity is created read-only. Filenames are public, indexed attributes; the package does not infer author/version from the image. Queries operate on attributes, never image pixels or payload contents. To discover PNG images:

```js
import { str } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { IMAGE_TYPE, retrieveImage } from 'arkiv-images';

const query = publicClient.select({ key: true })
  .where(eq('type', str(IMAGE_TYPE)), eq('mime', str('image/png')))
  .limit(200);
for await (const entity of query) {
  // Narrow by owner or another indexed attribute for a real application.
  // A single image's retrieval does not enumerate the global catalogue.
  const image = await retrieveImage({ publicClient, imageKey: entity.key });
  console.log(entity.key, image.byteLength);
}
```

SDK types matter: `u64(2)` is different from `i32(2)`. The actual query expression for this example is `type = str('arkiv-images/v1') AND mime = str('image/png')`, not SQL `SELECT *`.

## Public API

All functions and TypeScript types are exported from `arkiv-images`. Do not import internal build paths.

| Export | Contract |
|---|---|
| `inspectImage(bytes, expectedContentType?)` | Returns `ImageInfo`: detected MIME, width, height, byteLength. Validates size, signature and basic container structure; not a full pixel decoder. No network. |
| `planImage(byteLength)` | Returns `ImagePlan`: inline/chunked mode, bytes, chunk/entity/transaction counts. No network. |
| `storeImage(options)` | Resolves `StoredImage` after observed confirmations: imageKey, optional manifestKey, digest, dimensions, size, mode, transactionHashes. Required clients, bytes, filename, expirationBlocks; optional contentType/onProgress. |
| `retrieveImage(options)` | Resolves `RetrievedImage`: original bytes, filename, MIME, dimensions, digest, mode, queried expiresAt. Required publicClient/imageKey; optional expectedSha256/onProgress. Never returns a partial image. |
| `ImageStorageError`, `ChunkingError` | Typed error codes. Upload errors preserve available manifestKey and confirmed transactionHashes. Raw `cause` is for local diagnostics and may contain provider secrets: never render or log it in the UI. |
| Types | `ImageInfo`, `ImagePlan`, `StoreImageOptions`, `StoredImage`, `RetrieveImageOptions`, `RetrievedImage`, `ImageContentType`, `ImageErrorCode`, `Progress` |
| Constants | `VERSION`, `IMAGE_TYPE`, `INLINE_MAX_BYTES`, `MAX_IMAGE_BYTES`, `MAX_IMAGE_PIXELS` |

`onProgress` is the chunk dependency's observational callback: phase `manifest`, `chunks` or `finalize`, completed/total and optional manifestKey. Its total counts **file chunks**, not the final image entity transaction. Inline writes do not emit chunk progress. Only a resolved `storeImage` means the whole upload finished; callback exceptions cannot change a confirmed upload into a failure.

## Limits, visibility and failure semantics

| Policy | Value |
|---|---|
| Formats | Static PNG; baseline/progressive JPEG. No SVG, GIF, APNG, WebP, HEIC, PDF or video |
| Maximum file | **26,214,400 bytes (25 MiB)**, measured before upload; in memory, no streaming |
| Maximum dimensions | Positive width/height, product at most **40,000,000 pixels** |
| Inline image | **1–120,000 bytes**, one entity and one transaction |
| Chunked image | **120,001–26,214,400 bytes**, 100,000-byte chunks; N+2 entities, N+3 confirmed transactions |
| At 120,001 bytes | 2 chunks + manifest + image entity: 4 entities, 5 transactions |
| At 1,000,000 bytes | 10 chunks + manifest + image entity: 12 entities, 13 transactions |
| At 25 MiB | 263 chunks, 265 entities, 266 transactions; this is a policy ceiling, not a claim that uploading this size is quick or economical |
| Filename | Basename only, 1–128 UTF-8 bytes (SDK `str` attribute limit), no path separators or control characters |
| Expiration | Explicit whole blocks: `max(64, transactionCount + 32)` through 15,768,000 |

The inline threshold leaves room for attributes and transaction framing. The commonly cited 131,072-byte payload ceiling is **not** an image budget: the complete transaction also has a size limit. [Verification](docs/verification.md) records actual encoded sizes and which boundaries were submitted on Tiramisu. JPEG/PNG are already compressed image formats; converting to PDF or base64 does not remove the storage constraint. A photo's size varies with dimensions, detail and encoding; the sample measures the selected file rather than guessing from megapixels.

**No encryption, metadata stripping, resizing or recompression.** The tool preserves the exact original bytes, including EXIF/GPS, embedded thumbnails and names. Everyone with read access to the public network can retrieve them. Use synthetic/non-sensitive images. Expiration removes entities from current queries; it does **not** erase historical bytes or copies. This tool offers no read authorization and does not claim confidentiality.

The package performs bounded container checks, not a complete PNG CRC/JPEG entropy decode, antivirus scan or content moderation. A file can pass header checks and still fail full decoding. JPEGs must end at their end-of-image marker; files with trailing padding are rejected even if some decoders accept them. Export such files as a standard JPEG before uploading. The sample calls `createImageBitmap` both before writes and after retrieval. Consumers rendering images must also handle decode failures. Never serve uploaded bytes as HTML or SVG, and never trust a filename as markup.

Chunking is required only for images above the inline threshold and is **reused, not reimplemented**. The dependency is installed with the package. An inline read uses one entity query plus the chain check. A chunked read first loads the image entity, then the file manifest and every required chunk page; it is one JavaScript API call, **not one RPC query**. File pages share the manifest's snapshot block. The initial image query and file query are separate snapshots. A trusted `expectedSha256` pins bytes independently of mutable manifests; a digest proves integrity, not the publisher's identity.

Parts receive relative expiration at their own creation. The manifest is older than the final image entity and can expire first. The root may therefore still exist when the file can no longer be retrieved; retrieval fails clearly. `RetrievedImage.expiresAt` is the earlier queried root/manifest expiration, not a fixed-time availability promise. Do not independently extend, transfer or change parts; these are not supported workflows.

No multi-transaction atomicity, automatic write retries/resume, deduplication, deletion or rollback. If the final image transaction fails, confirmed file entities remain: preserve `manifestKey` and receipts, inspect them, then decide whether to start a new upload. A timeout can follow a successful transaction; the returned list includes only confirmations observed by this call. Serialize writes from the same account. In browser integrations recheck account/network before **every** signing request; the sample provides the implementation.

## Troubleshooting

`retrieveImage` can throw either `ImageStorageError` or the exported `ChunkingError`; chunk failures are not members of `ImageErrorCode`. Handle both classes and use their safe `code`/`message` fields. Do not log the raw error or `cause`, which can contain provider secrets.

| Symptom | Resolution |
|---|---|
| `INVALID_IMAGE` / browser decode error | Use a valid static PNG or baseline/progressive JPEG within the pixel limit. Changing an extension does not convert a file. |
| `TOO_LARGE` | Choose a smaller file. The tool does not silently resize it. |
| `INVALID_INPUT` | Check 32-byte key/hash, filename rules and whole-block expiration. |
| `NETWORK_MISMATCH` | Configure matching explicit testnet clients; the sample supports only Tiramisu. Check RPC `eth_chainId` too. |
| Wallet missing, rejected or changed | Enable/connect MetaMask or Rabby; resolve pending requests. Reconnect after changing account and inspect confirmed writes before retrying. |
| Not enough GLM | Obtain test GLM for the actual signing account on Tiramisu; plan the number of transaction approvals before uploading a large photo. |
| RPC 401/403/429, `READ_FAILED` | Check your network-specific provider access key/quota/connection. Never retry ambiguous writes automatically. |
| `NOT_FOUND` | Verify the **image** key and network; entity may have expired. A chunk manifest key is a different type. |
| `INCOMPLETE_UPLOAD`, `MISSING_CHUNK` | Inspect upload receipts and expiration. Partial images are not returned. |
| `INVALID_ENTITY`, `INVALID_MANIFEST`, `INVALID_CHUNK`, `HASH_MISMATCH` | Treat the result as invalid; do not bypass checks. A manifest may have changed or content may be damaged. |
| npm E404 | Check the publication status in verification; do not call a local tarball published. |
| CommonJS import failure | Use ESM `import`; there is no CommonJS export. |

## Sample, agent guides and development

- [Live sample](https://arkiv-images-example.vercel.app), consuming `arkiv-images@0.1.1` from npm. [Deployment verification](docs/sample-review-v3.md) distinguishes real Tiramisu reads from controlled wallet tests.
- [Sample README](https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/sample/README.md): source checkout, localhost commands and visitor-wallet flow.
- [Consumer AGENTS.md](AGENTS.md) and [sample AGENTS.md](https://github.com/SantiagoDevRel/arkiv-images/blob/feat/image-storage/sample/AGENTS.md). Give these guides to your agent explicitly. It will not necessarily read files under `node_modules` automatically. Each CLAUDE.md points to the corresponding AGENTS.md.
- [Verification](docs/verification.md): exact runtimes, dependency versions, simulated vs real checks, publication and unresolved gates.

```sh
git clone --branch feat/image-storage https://github.com/SantiagoDevRel/arkiv-images.git
cd arkiv-images
npm ci
npm test
npm run typecheck
npm pack --pack-destination /absolute/path/to/output
```

For an unpublished candidate only, replace the npm package argument in a clean consumer with the absolute `.tgz` path. This tests the packed artifact, not registry publication. There are no runtime aliases to sibling repositories.

Browser regression checks use Playwright with a locally installed Chrome. First start the sample dev server in another terminal, then run `npm run test:browser` from the package root. They exercise the actual SDK/package with a controlled RPC and injected wallet, not live funds. Screenshots and results default to `~/Downloads/arkiv-image-storage-98/browser`; set `ARTIFACTS_DIR` to another output directory or `SAMPLE_URL` to another localhost port. These checks are separate from `npm test`.

Provenance: image workflow and PNG/JPEG/25 MiB policy from [Arkiv-Network/usecases-imagedb](https://github.com/Arkiv-Network/usecases-imagedb); public-byte/metadata cautions and transaction budget from the existing Arkiv Cookbook; chunk implementation is the separately published `arkiv-chunking` dependency. The old service's quotas, shared signer and RPC protocol are not added to this package. Test RPC harness and sample token treatments are adapted from arkiv-chunking, with Arkiv UI's documented open font fallbacks.
