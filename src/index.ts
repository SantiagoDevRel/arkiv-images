import { ExpirationTime, randomSalt } from '@arkiv-network/sdk';
import { bytes as binary, defineSchema, key, str, u64, type Column, type Schema, type TypeTag } from '@arkiv-network/sdk/schema';
import { eq } from '@arkiv-network/sdk/query';
import { uploadFile, downloadFile, hashFile, ChunkingError, DEFAULT_CHUNK_BYTES, MAX_EXPIRATION_BLOCKS, writeWithPolicy, WriteConfirmationPendingError, type TransactionParameterPolicy, type WriteTransactionParameters, type ChunkingPublicClient, type ChunkingWalletClient, type Progress } from 'arkiv-chunking';
import { hexToBytes, type Hex } from 'viem';

export const VERSION = '1.0.3';
export const IMAGE_TYPE = 'arkiv-images/v2';
type Stored<T extends TypeTag> = Column<T, false, false, false>;
type Indexed<T extends TypeTag> = Column<T, true, false, false>;
export const ImageSchema: Schema<{
  type: Indexed<'str'>; mode: Indexed<'str'>; mime: Indexed<'str'>; sha256: Indexed<'str'>;
  filename: Stored<'str'>; size: Stored<'u64'>; width: Stored<'u64'>; height: Stored<'u64'>;
  manifest: Column<'key', true, true, false>; data: Stored<'bytes'>;
}> = defineSchema(IMAGE_TYPE, {
  type: str().indexed(), mode: str().indexed(), mime: str().indexed(), sha256: str().indexed(),
  filename: str(), size: u64(), width: u64(), height: u64(), manifest: key().indexed().optional(), data: binary(),
});
export { MAX_EXPIRATION_BLOCKS, RABDI_MAX_LIFETIME_BLOCKS, EXPIRATION_INCLUSION_MARGIN_BLOCKS } from 'arkiv-chunking';
export const INLINE_MAX_BYTES = 120_000;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export type ImageContentType = 'image/png' | 'image/jpeg';
export type ImageErrorCode = 'INVALID_IMAGE' | 'TOO_LARGE' | 'INVALID_INPUT' | 'NETWORK_MISMATCH' | 'NOT_FOUND' | 'INVALID_ENTITY' | 'HASH_MISMATCH' | 'UPLOAD_FAILED' | 'CONFIRMATION_PENDING' | 'READ_FAILED';
export class ImageStorageError extends Error {
  readonly code: ImageErrorCode;
  readonly manifestKey?: Hex;
  readonly imageKey?: Hex;
  readonly transactionHashes: readonly Hex[];
  constructor(code: ImageErrorCode, message: string, options: { cause?: unknown; manifestKey?: Hex; imageKey?: Hex; transactionHashes?: readonly Hex[] } = {}) {
    super(message, { cause: options.cause }); this.name = 'ImageStorageError'; this.code = code;
    this.manifestKey = options.manifestKey; this.imageKey = options.imageKey; this.transactionHashes = [...(options.transactionHashes ?? [])];
  }
}
export { ChunkingError } from 'arkiv-chunking';
export type { Progress, TransactionParameterPolicy } from 'arkiv-chunking';
export interface ImageInfo { contentType: ImageContentType; width: number; height: number; byteLength: number }
export interface ImagePlan { mode: 'inline' | 'chunked'; bytes: number; chunkCount: number; entityCount: number; transactionCount: number }
export interface StoreImageOptions {
  publicClient: ChunkingPublicClient; walletClient: ChunkingWalletClient;
  bytes: Uint8Array; filename: string; contentType?: ImageContentType; expirationBlocks: number;
  onProgress?: (progress: Progress) => void | Promise<void>;
  /** Reuses the chunking write policy for every part and the image root. */
  txParams?: TransactionParameterPolicy;
}
export interface StoredImage extends ImageInfo {
  imageKey: Hex; manifestKey?: Hex; sha256: Hex; mode: 'inline' | 'chunked'; transactionHashes: Hex[];
}
export type ImageWriteState = 'ready' | 'sending' | 'submitted' | 'complete' | 'uncertain' | 'failed';
export interface ImageWriteOperation {
  readonly state: ImageWriteState;
  readonly imageKey?: Hex;
  readonly transactionHashes: readonly Hex[];
  /** Repeated calls share one operation, including a rejected or pending result. */
  run(): Promise<StoredImage>;
}
/** Keep this object across UI renders/clicks. A new operation is an explicit new upload. */
export function createImageWriteOperation(options: StoreImageOptions | (() => Promise<StoreImageOptions>)): ImageWriteOperation {
  let state: ImageWriteState = 'ready', promise: Promise<StoredImage> | undefined, imageKey: Hex | undefined;
  let hashes: readonly Hex[] = [];
  const snapshot = typeof options === 'function' ? options : { ...options, bytes: options.bytes instanceof Uint8Array ? new Uint8Array(options.bytes) : options.bytes };
  return {
    get state() { return state; }, get imageKey() { return imageKey; }, get transactionHashes() { return [...hashes]; },
    run() {
      if (promise) return promise;
      state = 'sending';
      // Store the promise before the first network call, including synchronous provider callbacks.
      promise = Promise.resolve().then(async () => executeStoreImage(typeof snapshot === 'function' ? await snapshot() : snapshot, (key, txHashes) => {
        state = 'submitted'; imageKey = key; hashes = [...txHashes];
      }, txHashes => { hashes = [...txHashes]; })).then(result => {
        state = 'complete'; imageKey = result.imageKey; hashes = [...result.transactionHashes]; return result;
      }, error => {
        if (error instanceof ImageStorageError) {
          imageKey = error.imageKey ?? imageKey; hashes = [...error.transactionHashes];
          state = error.code === 'CONFIRMATION_PENDING' ? 'submitted' : error.code === 'INVALID_INPUT' || error.code === 'NETWORK_MISMATCH' ? 'failed' : 'uncertain';
        } else state = 'uncertain';
        throw error;
      });
      return promise;
    },
  };
}
export interface RetrieveImageOptions { publicClient: ChunkingPublicClient; imageKey: Hex; expectedSha256?: Hex; onProgress?: StoreImageOptions['onProgress'] }
export interface RetrievedImage extends ImageInfo { bytes: Uint8Array; filename: string; sha256: Hex; mode: 'inline' | 'chunked'; expiresAt: bigint }
function fail(code: ImageErrorCode, message: string): never { throw new ImageStorageError(code, message); }
const hex32 = (v: unknown): v is Hex => typeof v === 'string' && /^0x[\da-f]{64}$/i.test(v);

/** Validate size, signature, container dimensions. This is not a full pixel decoder or malware scanner. */
export function inspectImage(bytes: Uint8Array, expectedContentType?: ImageContentType): ImageInfo {
  if (!(bytes instanceof Uint8Array)) fail('INVALID_INPUT', 'Provide image bytes as Uint8Array.');
  if (bytes.length > MAX_IMAGE_BYTES) fail('TOO_LARGE', `Images must be at most ${MAX_IMAGE_BYTES} bytes.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let contentType: ImageContentType, width = 0, height = 0;
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) {
    contentType = 'image/png';
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) fail('INVALID_IMAGE', 'PNG must start with an IHDR chunk.');
    width = view.getUint32(16); height = view.getUint32(20);
    let offset = 8, hasData = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), type = view.getUint32(offset + 4);
      if (length > bytes.length - offset - 12) fail('INVALID_IMAGE', 'Truncated PNG chunk.');
      if (type === 0x6163544c) fail('INVALID_IMAGE', 'Animated PNG is not supported.');
      if (type === 0x49444154) hasData = true;
      offset += length + 12;
      if (type === 0x49454e44) { ended = length === 0 && offset === bytes.length; break; }
    }
    if (!hasData || !ended) fail('INVALID_IMAGE', 'PNG is missing image data or its final chunk.');
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    contentType = 'image/jpeg';
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) fail('INVALID_IMAGE', 'Invalid JPEG marker.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) fail('INVALID_IMAGE', 'Truncated JPEG.');
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) fail('INVALID_IMAGE', 'Truncated JPEG segment.');
      if (marker === 0xc0 || marker === 0xc2) {
        if (length < 8) fail('INVALID_IMAGE', 'Invalid JPEG dimensions.');
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
      }
      offset += length;
    }
  } else { return fail('INVALID_IMAGE', 'Use a static PNG or baseline/progressive JPEG. Other formats are not supported.'); }
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) fail('INVALID_IMAGE', `Image dimensions must be positive and at most ${MAX_IMAGE_PIXELS} pixels.`);
  if (expectedContentType !== undefined && expectedContentType !== contentType) fail('INVALID_IMAGE', 'Declared content type does not match the image bytes.');
  return { contentType, width, height, byteLength: bytes.length };
}

export function planImage(byteLength: number): ImagePlan {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) fail('INVALID_INPUT', 'Image byte length must be a positive integer.');
  if (byteLength > MAX_IMAGE_BYTES) fail('TOO_LARGE', `Images must be at most ${MAX_IMAGE_BYTES} bytes.`);
  if (byteLength <= INLINE_MAX_BYTES) return { mode: 'inline', bytes: byteLength, chunkCount: 0, entityCount: 1, transactionCount: 1 };
  const chunkCount = Math.ceil(byteLength / DEFAULT_CHUNK_BYTES);
  return { mode: 'chunked', bytes: byteLength, chunkCount, entityCount: chunkCount + 2, transactionCount: chunkCount + 3 };
}
function filenameValid(filename: unknown): asserts filename is string {
  if (typeof filename !== 'string' || !filename || new TextEncoder().encode(filename).length > 128 || /[\x00-\x1f\x7f/\\]/.test(filename) || filename === '.' || filename === '..') fail('INVALID_INPUT', 'Use a basename of 1–128 UTF-8 bytes, without control characters.');
}
async function checkNetwork(client: ChunkingPublicClient, wallet?: ChunkingWalletClient) {
  if (!client.chain?.testnet || client.chain.id !== 7794095 || await client.getChainId() !== client.chain.id) fail('NETWORK_MISMATCH', 'Configure Rabdi testnet matching the RPC.');
  if (!wallet) return;
  if (!wallet.account || !wallet.chain?.testnet || wallet.chain.id !== client.chain.id) fail('NETWORK_MISMATCH', 'The wallet and RPC must use the same explicit testnet.');
  const walletChainId = await wallet.transport.request({ method: 'eth_chainId' });
  if (typeof walletChainId !== 'string' || !/^0x[0-9a-f]+$/i.test(walletChainId) || Number(BigInt(walletChainId)) !== client.chain.id) fail('NETWORK_MISMATCH', 'The wallet and RPC must use the same explicit testnet.');
}

/** Preserve original public file bytes. Only the shared policy's confirmed-revert retry is allowed. */
export async function storeImage(options: StoreImageOptions): Promise<StoredImage> {
  return createImageWriteOperation(options).run();
}
async function executeStoreImage(options: StoreImageOptions, submitted: (key: Hex, hashes: readonly Hex[]) => void, observed: (hashes: readonly Hex[]) => void): Promise<StoredImage> {
  const { publicClient, walletClient, filename, expirationBlocks, onProgress } = options;
  filenameValid(filename);
  const info = inspectImage(options.bytes, options.contentType), plan = planImage(info.byteLength);
  if (!Number.isSafeInteger(expirationBlocks) || expirationBlocks < Math.max(64, plan.transactionCount + 32) || expirationBlocks > MAX_EXPIRATION_BLOCKS) fail('INVALID_INPUT', `Choose a whole-block expiration from max(64, transactionCount + 32) to ${MAX_EXPIRATION_BLOCKS}. Longer storage needs coordinated Lifetime Extension outside this API.`);
  const bytes = new Uint8Array(options.bytes);
  let manifestKey: Hex | undefined;
  let imageKey: Hex | undefined;
  const transactionHashes: Hex[] = [];
  const rememberHash = (hash: Hex) => {
    if (!transactionHashes.includes(hash)) { transactionHashes.push(hash); observed(transactionHashes); }
  };
  // Observe the public SDK mutation boundary before the shared policy can query a receipt.
  // EntityMutationError.txHash survives even when that lookup fails and hides the SDK error.
  // This only retains evidence; the dependency still owns gas, receipt handling and retries.
  const observeMutation = async <T extends { txHash: Hex }>(mutate: () => Promise<T>): Promise<T> => {
    try { const result = await mutate(); rememberHash(result.txHash); return result; }
    catch (error) {
      const hash = error && typeof error === 'object' && 'txHash' in error ? error.txHash : undefined;
      if (hex32(hash)) rememberHash(hash);
      throw error;
    }
  };
  const observedWallet: ChunkingWalletClient = {
    ...walletClient,
    createEntity: (...args) => observeMutation(() => walletClient.createEntity(...args)),
    patchEntity: (...args) => observeMutation(() => walletClient.patchEntity(...args)),
  };
  try {
    await checkNetwork(publicClient, walletClient);
    let expiresAt = BigInt(await walletClient.transport.request({ method: 'eth_blockNumber' }) as Hex) + BigInt(expirationBlocks);
    // The dependency owns estimates, latest nonce, gas headroom, receipts and bounded retries.
    // Add the migration's stricter half-block ceiling and per-signature identity checks here.
    const txParams: TransactionParameterPolicy = async context => {
      await checkNetwork(publicClient, walletClient);
      if (walletClient.account?.type === 'json-rpc') {
        const accounts = await walletClient.transport.request({ method: 'eth_accounts' }) as Hex[];
        if (accounts[0]?.toLowerCase() !== walletClient.account.address.toLowerCase()) fail('NETWORK_MISMATCH', 'The wallet account changed. Inspect confirmed writes before reconnecting.');
      }
      const override = await options.txParams?.(context) ?? {};
      const block = await walletClient.transport.request({ method: 'eth_getBlockByNumber', params: ['latest', false] }) as { gasLimit: Hex };
      if ((override.gas ?? context.defaults.gas) > BigInt(block.gasLimit) / 2n) fail('INVALID_INPUT', 'The transaction exceeds half the latest block gas limit. Use a smaller image or a shorter Entity Expiration; no write was submitted for this part.');
      return override;
    };
    const sha256 = await hashFile(bytes);
    if (plan.mode === 'chunked') {
      const stored = await uploadFile({ publicClient, walletClient: observedWallet, bytes, filename, contentType: info.contentType, expirationBlocks, onProgress, txParams });
      manifestKey = stored.manifestKey; stored.transactionHashes.forEach(rememberHash);
      expiresAt = stored.expiresAt;
    }
    await checkNetwork(publicClient, walletClient);
    const head = BigInt(await walletClient.transport.request({ method: 'eth_blockNumber' }) as Hex);
    if (expiresAt <= head + 1n) fail('INVALID_INPUT', 'The image deadline passed before its root write. Inspect the manifest; no root was submitted.');
    const values = { type: IMAGE_TYPE, mode: plan.mode, mime: info.contentType, filename, sha256, size: u64(bytes.length), width: u64(info.width), height: u64(info.height), data: manifestKey ? new Uint8Array() : bytes, ...(manifestKey ? { manifest: key(manifestKey) } : {}) };
    const createOptions = { expiration: ExpirationTime.atBlock(expiresAt), salt: randomSalt(), flags: { readonly: true } };
    const stored = await writeWithPolicy(observedWallet, { phase: 'finalize' },
      (unsigned: ChunkingWalletClient) => unsigned.createEntity(ImageSchema, values, createOptions, { gas: 1_000_000n, gasPrice: 1n, nonce: 0 }),
      (parameters: WriteTransactionParameters) => observedWallet.createEntity(ImageSchema, values, createOptions, parameters), transactionHashes, txParams,
      (result: { entityKey: Hex }) => { imageKey = result.entityKey; submitted(imageKey, transactionHashes); });
    return { ...info, imageKey: stored.entityKey, manifestKey, mode: plan.mode, sha256, transactionHashes };
  } catch (cause) {
    // The shared policy can recover a submission hash from a wrapped SDK error.
    // Retain that typed pending evidence without treating it as a successful receipt.
    if (cause instanceof WriteConfirmationPendingError || (cause instanceof ChunkingError && cause.code === 'CONFIRMATION_PENDING')) {
      if (hex32(cause.txHash)) rememberHash(cause.txHash);
    }
    if (cause instanceof ChunkingError) {
      manifestKey = cause.manifestKey ?? manifestKey;
      cause.transactionHashes.forEach(rememberHash);
    }
    if (cause instanceof ImageStorageError && !transactionHashes.length) throw cause;
    const pending = cause instanceof WriteConfirmationPendingError || (cause instanceof ChunkingError && cause.code === 'CONFIRMATION_PENDING');
    throw new ImageStorageError(pending ? 'CONFIRMATION_PENDING' : 'UPLOAD_FAILED', pending ? 'A submitted write has unresolved receipt confirmation. Preserve the image/manifest keys and hashes; inspect them using reads and never resend automatically.' : 'Upload did not complete. Inspect the wallet and available transaction receipts before retrying; any previously written entities remain.', { cause, manifestKey, imageKey, transactionHashes });
  }
}
function attr(attributes: Record<string, unknown>, name: string, type: string): unknown {
  const a = attributes[name];
  if (!a || typeof a !== 'object' || !('type' in a) || a.type !== type || !('value' in a)) return fail('INVALID_ENTITY', `Missing or invalid ${name} attribute.`);
  return a.value;
}

/** One SDK call for an inline image; chunked images additionally load and verify the referenced file. */
export async function retrieveImage({ publicClient, imageKey, expectedSha256, onProgress }: RetrieveImageOptions): Promise<RetrievedImage> {
  if (!hex32(imageKey) || (expectedSha256 !== undefined && !hex32(expectedSha256))) fail('INVALID_INPUT', 'Use a 32-byte image key and, optionally, a 32-byte SHA-256.');
  try {
    await checkNetwork(publicClient);
    const page = await publicClient.select({ $expiresAt: true, $creationFlags: true, 'arkiv.schema': true, type: true, mode: true, mime: true, filename: true, sha256: true, size: true, width: true, height: true, manifest: true, data: true }).where(eq('$key', key(imageKey))).limit(1).fetch();
    const entity = page.entities[0];
    if (!entity) fail('NOT_FOUND', 'Image entity not found. Check key, network and Entity Expiration.');
    const a = entity;
    if (attr(a, 'type', 'str') !== IMAGE_TYPE || attr(a, 'arkiv.schema', 'str') !== IMAGE_TYPE || !entity.$creationFlags?.readonly || entity.$expiresAt <= page.blockNumber) fail('INVALID_ENTITY', 'This is not a live immutable arkiv-images v2 entity.');
    const mode = attr(a, 'mode', 'str'), mime = attr(a, 'mime', 'str'), filename = attr(a, 'filename', 'str'), digest = attr(a, 'sha256', 'str'), size = attr(a, 'size', 'u64');
    if ((mode !== 'inline' && mode !== 'chunked') || (mime !== 'image/png' && mime !== 'image/jpeg') || !hex32(digest) || typeof size !== 'bigint' || size < 1n || size > BigInt(MAX_IMAGE_BYTES)) fail('INVALID_ENTITY', 'Invalid image storage metadata.');
    filenameValid(filename);
    if (expectedSha256 && digest.toLowerCase() !== expectedSha256.toLowerCase()) fail('HASH_MISMATCH', 'Image digest differs from the trusted SHA-256.');
    const data = attr(a, 'data', 'bytes');
    if (typeof data !== 'string' || !/^0x(?:[\da-f]{2})*$/i.test(data) || (data.length - 2) / 2 > INLINE_MAX_BYTES) fail('INVALID_ENTITY', 'Invalid inline image bytes.');
    let bytes = hexToBytes(data as Hex), expiresAt = entity.$expiresAt;
    if (mode === 'chunked') {
      const manifestKey = attr(a, 'manifest', 'key');
      if (!hex32(manifestKey) || bytes.length !== 0 || size <= BigInt(INLINE_MAX_BYTES)) fail('INVALID_ENTITY', 'Invalid chunk manifest reference or image mode.');
      const result = await downloadFile({ publicClient, manifestKey, expectedSha256: digest, onProgress });
      if (result.expiresAt !== expiresAt) fail('INVALID_ENTITY', 'Image and file deadlines disagree. Independent part extensions are not supported.');
      bytes = result.bytes;
      if (result.contentType !== mime || result.filename !== filename) fail('INVALID_ENTITY', 'Image and file metadata disagree.');
    } else if (a.manifest !== undefined) fail('INVALID_ENTITY', 'Inline images cannot reference a manifest.');
    const info = inspectImage(bytes, mime);
    if (BigInt(bytes.length) !== size || BigInt(info.width) !== attr(a, 'width', 'u64') || BigInt(info.height) !== attr(a, 'height', 'u64')) fail('INVALID_ENTITY', 'Image dimensions or size disagree with attributes.');
    if (await hashFile(bytes) !== digest.toLowerCase()) fail('HASH_MISMATCH', 'Recovered image bytes failed SHA-256 verification.');
    return { ...info, bytes, filename, sha256: digest.toLowerCase() as Hex, mode, expiresAt };
  } catch (cause) {
    if (cause instanceof ImageStorageError || cause instanceof ChunkingError) throw cause;
    throw new ImageStorageError('READ_FAILED', 'Image retrieval failed. Check the RPC connection and access policy.', { cause });
  }
}
