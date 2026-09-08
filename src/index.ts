import { ExpirationTime } from '@arkiv-network/sdk';
import { bytes32, key, str, u64 } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { uploadFile, downloadFile, hashFile, ChunkingError, DEFAULT_CHUNK_BYTES, type ChunkingPublicClient, type ChunkingWalletClient, type Progress } from 'arkiv-chunking';
import type { Hex } from 'viem';

export const VERSION = '0.1.0';
export const IMAGE_TYPE = 'arkiv-images/v1';
export const INLINE_MAX_BYTES = 120_000;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export type ImageContentType = 'image/png' | 'image/jpeg';
export type ImageErrorCode = 'INVALID_IMAGE' | 'TOO_LARGE' | 'INVALID_INPUT' | 'NETWORK_MISMATCH' | 'NOT_FOUND' | 'INVALID_ENTITY' | 'HASH_MISMATCH' | 'UPLOAD_FAILED' | 'READ_FAILED';
export class ImageStorageError extends Error {
  readonly code: ImageErrorCode;
  readonly manifestKey?: Hex;
  readonly transactionHashes: readonly Hex[];
  constructor(code: ImageErrorCode, message: string, options: { cause?: unknown; manifestKey?: Hex; transactionHashes?: readonly Hex[] } = {}) {
    super(message, { cause: options.cause }); this.name = 'ImageStorageError'; this.code = code;
    this.manifestKey = options.manifestKey; this.transactionHashes = [...(options.transactionHashes ?? [])];
  }
}
export { ChunkingError } from 'arkiv-chunking';
export type { Progress } from 'arkiv-chunking';
export interface ImageInfo { contentType: ImageContentType; width: number; height: number; byteLength: number }
export interface ImagePlan { mode: 'inline' | 'chunked'; bytes: number; chunkCount: number; entityCount: number; transactionCount: number }
export interface StoreImageOptions {
  publicClient: ChunkingPublicClient; walletClient: ChunkingWalletClient;
  bytes: Uint8Array; filename: string; contentType?: ImageContentType; expirationBlocks: number;
  onProgress?: (progress: Progress) => void | Promise<void>;
}
export interface StoredImage extends ImageInfo {
  imageKey: Hex; manifestKey?: Hex; sha256: Hex; mode: 'inline' | 'chunked'; transactionHashes: Hex[];
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
  if (!client.chain?.testnet || await client.getChainId() !== client.chain.id) fail('NETWORK_MISMATCH', 'Configure an explicit testnet matching the RPC.');
  if (wallet && (!wallet.account || !wallet.chain?.testnet || wallet.chain.id !== client.chain.id || Number(await wallet.transport.request({ method: 'eth_chainId' })) !== client.chain.id)) fail('NETWORK_MISMATCH', 'The wallet and RPC must use the same explicit testnet.');
}

/** Preserve original file bytes. All bytes, metadata and wallet addresses are public. Never retries writes. */
export async function storeImage(options: StoreImageOptions): Promise<StoredImage> {
  const { publicClient, walletClient, filename, expirationBlocks, onProgress } = options;
  filenameValid(filename);
  const info = inspectImage(options.bytes, options.contentType), plan = planImage(info.byteLength);
  if (!Number.isSafeInteger(expirationBlocks) || expirationBlocks < Math.max(64, plan.transactionCount + 32) || expirationBlocks > 15_768_000) fail('INVALID_INPUT', 'Choose a whole-block expiration from max(64, transactionCount + 32) to 15768000.');
  const bytes = new Uint8Array(options.bytes);
  let manifestKey: Hex | undefined;
  const transactionHashes: Hex[] = [];
  try {
    await checkNetwork(publicClient, walletClient);
    const sha256 = await hashFile(bytes);
    if (plan.mode === 'chunked') {
      const stored = await uploadFile({ publicClient, walletClient, bytes, filename, contentType: info.contentType, expirationBlocks, onProgress });
      manifestKey = stored.manifestKey; transactionHashes.push(...stored.transactionHashes);
    }
    await checkNetwork(publicClient, walletClient);
    const attributes = { type: str(IMAGE_TYPE), mode: str(plan.mode), mime: str(info.contentType), filename: str(filename), sha256: bytes32(sha256), size: u64(bytes.length), width: u64(info.width), height: u64(info.height), ...(manifestKey ? { manifest: key(manifestKey) } : {}) };
    const stored = await walletClient.createEntity({ attributes, payload: manifestKey ? new Uint8Array() : bytes, contentType: manifestKey ? 'application/octet-stream' : info.contentType, expires: ExpirationTime.fromBlocks(expirationBlocks), flags: { readonly: true } });
    transactionHashes.push(stored.txHash);
    return { ...info, imageKey: stored.entityKey, manifestKey, mode: plan.mode, sha256, transactionHashes };
  } catch (cause) {
    if (cause instanceof ChunkingError) {
      manifestKey = cause.manifestKey ?? manifestKey;
      transactionHashes.push(...cause.transactionHashes);
    }
    if (cause instanceof ImageStorageError && !transactionHashes.length) throw cause;
    throw new ImageStorageError('UPLOAD_FAILED', 'Upload did not complete. Inspect the wallet and available transaction receipts before retrying; any previously written entities remain.', { cause, manifestKey, transactionHashes });
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
    const page = await publicClient.select({ payload: true, expiresAt: true, attributes: { type: true, mode: true, mime: true, filename: true, sha256: true, size: true, width: true, height: true, manifest: true } }).where(eq('$key', key(imageKey))).limit(1).fetch();
    const entity = page.entities[0];
    if (!entity) fail('NOT_FOUND', 'Image entity not found. Check key, network and Entity Expiration.');
    const a = entity.attributes;
    if (attr(a, 'type', 'str') !== IMAGE_TYPE) fail('INVALID_ENTITY', 'This is not an arkiv-images v1 entity.');
    const mode = attr(a, 'mode', 'str'), mime = attr(a, 'mime', 'str'), filename = attr(a, 'filename', 'str'), digest = attr(a, 'sha256', 'bytes32'), size = attr(a, 'size', 'u64');
    if ((mode !== 'inline' && mode !== 'chunked') || (mime !== 'image/png' && mime !== 'image/jpeg') || !hex32(digest) || typeof size !== 'bigint' || size < 1n || size > BigInt(MAX_IMAGE_BYTES)) fail('INVALID_ENTITY', 'Invalid image storage metadata.');
    filenameValid(filename);
    if (expectedSha256 && digest.toLowerCase() !== expectedSha256.toLowerCase()) fail('HASH_MISMATCH', 'Image digest differs from the trusted SHA-256.');
    let bytes = entity.payload, expiresAt = entity.expiresAt;
    if (mode === 'chunked') {
      const manifestKey = attr(a, 'manifest', 'key');
      if (!hex32(manifestKey)) fail('INVALID_ENTITY', 'Invalid chunk manifest reference.');
      const result = await downloadFile({ publicClient, manifestKey, expectedSha256: digest, onProgress });
      bytes = result.bytes; expiresAt = result.expiresAt < expiresAt ? result.expiresAt : expiresAt;
      if (result.contentType !== mime || result.filename !== filename) fail('INVALID_ENTITY', 'Image and file metadata disagree.');
    } else if (bytes.length > INLINE_MAX_BYTES) fail('INVALID_ENTITY', 'Inline payload exceeds the image format limit.');
    const info = inspectImage(bytes, mime);
    if (BigInt(bytes.length) !== size || BigInt(info.width) !== attr(a, 'width', 'u64') || BigInt(info.height) !== attr(a, 'height', 'u64')) fail('INVALID_ENTITY', 'Image dimensions or size disagree with attributes.');
    if (await hashFile(bytes) !== digest.toLowerCase()) fail('HASH_MISMATCH', 'Recovered image bytes failed SHA-256 verification.');
    return { ...info, bytes, filename, sha256: digest.toLowerCase() as Hex, mode, expiresAt };
  } catch (cause) {
    if (cause instanceof ImageStorageError || cause instanceof ChunkingError) throw cause;
    throw new ImageStorageError('READ_FAILED', 'Image retrieval failed. Check the RPC connection and access policy.', { cause });
  }
}
