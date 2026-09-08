import type { AnyArkivValue, EntityFields, PublicArkivClient } from '@arkiv-network/sdk';
import { key, str } from '@arkiv-network/sdk/attr';
import { eq } from '@arkiv-network/sdk/query';
import { IMAGE_TYPE, planImage, type RetrievedImage } from 'arkiv-images';
import type { Hex } from 'viem';

export interface InspectedAttribute {
  name: string;
  type: AnyArkivValue['type'];
  value: AnyArkivValue['value'];
}
export interface InspectedEntity {
  key: Hex;
  owner: Hex;
  creator: Hex;
  expiresAt: bigint;
  contentType: string;
  payload: Uint8Array;
  attributes: InspectedAttribute[];
}
export interface InspectedChunk extends InspectedEntity {
  seq: number;
  /** Zero-based byte offsets into the original image; the ending offset is exclusive. */
  byteStart: number;
  byteEndExclusive: number;
}
export interface ImageEntityInspection {
  mode: RetrievedImage['mode'];
  blockNumber: bigint;
  root: InspectedEntity;
  manifest?: InspectedEntity;
  chunks: InspectedChunk[];
  totalBytes: number;
  sha256: Hex;
  queries: { root: string; manifest?: string; chunks?: string };
}

/** Safe to display. Never contains a provider message, endpoint or access key. */
export class InspectionError extends Error {
  constructor() {
    super('Entity details could not be verified against this image. Try retrieving it again.');
    this.name = 'InspectionError';
  }
}
function fail(): never { throw new InspectionError(); }
const isKey = (value: unknown): value is Hex => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const isAddress = (value: unknown): value is Hex => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
const sameHex = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const selection = { key: true, owner: true, creator: true, expiresAt: true, contentType: true, attributes: true, payload: true } as const;
const selectionCode = '{ key: true, owner: true, creator: true, expiresAt: true, contentType: true, attributes: true, payload: true }';

function present(entity: EntityFields | undefined, block: bigint): InspectedEntity {
  if (!entity || !isKey(entity.key) || !isAddress(entity.owner) || !isAddress(entity.creator) ||
      typeof entity.expiresAt !== 'bigint' || entity.expiresAt <= block ||
      typeof entity.contentType !== 'string' || !(entity.payload instanceof Uint8Array) || !entity.attributes) fail();
  return {
    key: entity.key, owner: entity.owner, creator: entity.creator, expiresAt: entity.expiresAt,
    contentType: entity.contentType, payload: new Uint8Array(entity.payload),
    attributes: Object.entries(entity.attributes).map(([name, attribute]) => ({ name, type: attribute.type, value: attribute.value })),
  };
}
function attr(entity: InspectedEntity, name: string, type: InspectedAttribute['type']): InspectedAttribute['value'] {
  const value = entity.attributes.find(attribute => attribute.name === name);
  if (!value || value.type !== type) fail();
  return value.value;
}
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
async function digest(bytes: Uint8Array): Promise<Hex> {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return `0x${Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Read-only explanation of an image already returned by the published retrieveImage API.
 * Reads all displayed entities at one snapshot and checks their bytes against that result.
 * This does not replace package retrieval and never turns an inspection failure into image failure.
 */
export async function inspectImageEntities(
  client: PublicArkivClient,
  imageKey: Hex,
  verified: RetrievedImage,
): Promise<ImageEntityInspection> {
  try {
    if (!isKey(imageKey) || !isKey(verified.sha256) || !(verified.bytes instanceof Uint8Array) ||
        verified.bytes.length !== verified.byteLength || !client.chain?.testnet || await client.getChainId() !== client.chain.id) fail();
    const plan = planImage(verified.byteLength);
    if (plan.mode !== verified.mode) fail();
    const page = await client.select(selection).where(eq('$key', key(imageKey))).limit(1).fetch();
    if (typeof page.blockNumber !== 'bigint' || page.blockNumber < 0n || page.entities.length !== 1) fail();
    const blockNumber = page.blockNumber;
    const root = present(page.entities[0], blockNumber);
    if (!sameHex(root.key, imageKey) || attr(root, 'type', 'str') !== IMAGE_TYPE ||
        attr(root, 'mode', 'str') !== verified.mode || attr(root, 'mime', 'str') !== verified.contentType ||
        attr(root, 'filename', 'str') !== verified.filename || !sameHex(attr(root, 'sha256', 'bytes32'), verified.sha256) ||
        attr(root, 'size', 'u64') !== BigInt(verified.byteLength) ||
        attr(root, 'width', 'u64') !== BigInt(verified.width) || attr(root, 'height', 'u64') !== BigInt(verified.height)) fail();
    const queries: ImageEntityInspection['queries'] = {
      root: `import { key, str } from '@arkiv-network/sdk/attr';\nimport { eq } from '@arkiv-network/sdk/query';\n\nconst imagePage = await client\n  .select(${selectionCode})\n  .where(eq('$key', key('${imageKey}')))\n  .limit(1)\n  .fetch();\n// This inspection used imagePage.blockNumber = ${blockNumber}n.`,
    };
    const base = { mode: verified.mode, blockNumber, root, totalBytes: verified.byteLength, sha256: verified.sha256, queries };
    if (verified.mode === 'inline') {
      if (root.contentType !== verified.contentType || root.expiresAt !== verified.expiresAt ||
          !equalBytes(root.payload, verified.bytes) || !sameHex(await digest(root.payload), verified.sha256)) fail();
      return { ...base, chunks: [] };
    }

    const manifestKey = attr(root, 'manifest', 'key');
    if (!isKey(manifestKey) || sameHex(manifestKey, root.key) || root.payload.length !== 0 || root.contentType !== 'application/octet-stream') fail();
    const manifestPage = await client.select(selection).where(eq('$key', key(manifestKey))).atBlock(blockNumber).limit(1).fetch();
    if (manifestPage.blockNumber !== blockNumber || manifestPage.entities.length !== 1) fail();
    const manifest = present(manifestPage.entities[0], blockNumber);
    if (!sameHex(manifest.key, manifestKey) || attr(manifest, 'type', 'str') !== 'arkiv-chunking/manifest/v1' ||
        attr(manifest, 'complete', 'bool') !== true || attr(manifest, 'totalbytes', 'u64') !== BigInt(verified.byteLength) ||
        attr(manifest, 'chunkcount', 'u64') !== BigInt(plan.chunkCount) || !sameHex(attr(manifest, 'sha256', 'bytes32'), verified.sha256) ||
        manifest.contentType !== 'application/json' || manifest.payload.length > 2048 ||
        (manifest.expiresAt < root.expiresAt ? manifest.expiresAt : root.expiresAt) !== verified.expiresAt) fail();
    const chunkSizeValue = attr(manifest, 'chunksize', 'u64');
    if (typeof chunkSizeValue !== 'bigint' || chunkSizeValue < 1n || chunkSizeValue > 120_000n) fail();
    const chunkSize = Number(chunkSizeValue);
    if (Math.ceil(verified.byteLength / chunkSize) !== plan.chunkCount) fail();
    const metadata: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest.payload));
    if (!metadata || typeof metadata !== 'object' || !('filename' in metadata) || metadata.filename !== verified.filename ||
        !('contentType' in metadata) || metadata.contentType !== verified.contentType) fail();

    const query = client.select(selection)
      .where(eq('manifest', key(manifestKey)), eq('type', str('arkiv-chunking/chunk/v1')))
      .ownedBy(manifest.owner).createdBy(manifest.creator).atBlock(blockNumber).limit(200);
    const chunks: InspectedChunk[] = [];
    const seenKeys = new Set([root.key.toLowerCase(), manifest.key.toLowerCase()]);
    const seenSeq = new Set<number>();
    for await (const entity of query) {
      if (chunks.length >= plan.chunkCount) fail();
      const chunk = present(entity, blockNumber);
      const seqValue = attr(chunk, 'seq', 'u64');
      if (typeof seqValue !== 'bigint' || seqValue < 0n || seqValue >= BigInt(plan.chunkCount)) fail();
      const seq = Number(seqValue), byteStart = seq * chunkSize;
      const byteEndExclusive = Math.min(byteStart + chunkSize, verified.byteLength);
      if (seenSeq.has(seq) || seenKeys.has(chunk.key.toLowerCase()) || chunk.payload.length !== byteEndExclusive - byteStart ||
          attr(chunk, 'type', 'str') !== 'arkiv-chunking/chunk/v1' || !sameHex(attr(chunk, 'manifest', 'key'), manifestKey) ||
          !sameHex(chunk.owner, manifest.owner) || !sameHex(chunk.creator, manifest.creator) || chunk.contentType !== 'application/octet-stream') fail();
      seenSeq.add(seq); seenKeys.add(chunk.key.toLowerCase());
      chunks.push({ ...chunk, seq, byteStart, byteEndExclusive });
    }
    if (chunks.length !== plan.chunkCount) fail();
    chunks.sort((a, b) => a.seq - b.seq);
    // Only checks the presentation snapshot. The npm package remains the image reconstruction API.
    const inspectedBytes = new Uint8Array(verified.byteLength);
    for (const chunk of chunks) inspectedBytes.set(chunk.payload, chunk.byteStart);
    if (!equalBytes(inspectedBytes, verified.bytes) || !sameHex(await digest(inspectedBytes), verified.sha256)) fail();
    queries.manifest = `const manifestPage = await client\n  .select(${selectionCode})\n  .where(eq('$key', key('${manifestKey}')))\n  .atBlock(${blockNumber}n)\n  .limit(1)\n  .fetch();`;
    queries.chunks = `const chunks = [];\nfor await (const entity of client\n  .select(${selectionCode})\n  .where(\n    eq('manifest', key('${manifestKey}')),\n    eq('type', str('arkiv-chunking/chunk/v1')),\n  )\n  .ownedBy('${manifest.owner}')\n  .createdBy('${manifest.creator}')\n  .atBlock(${blockNumber}n)\n  .limit(200)\n) chunks.push(entity);\n// Order the payloads by the numeric seq attribute before joining their bytes.\nchunks.sort((a, b) => Number(a.attributes.seq.value - b.attributes.seq.value));`;
    return { ...base, manifest, chunks };
  } catch {
    throw new InspectionError();
  }
}
