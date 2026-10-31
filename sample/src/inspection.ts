import type { PublicArkivClient } from '@arkiv-network/sdk';
import type { ArkivValue, Attributes } from '@arkiv-network/sdk/schema';
import { key, str } from '@arkiv-network/sdk/schema';
import { and, asc, eq, gt, type Expression } from '@arkiv-network/sdk/query';
import { IMAGE_TYPE, planImage, type RetrievedImage } from 'arkiv-images';
import { hexToBytes, type Hex } from 'viem';

export interface InspectedAttribute { name: string; type: ArkivValue['type']; value: ArkivValue['value'] }
export interface InspectedEntity { key: Hex; owner: Hex; creator: Hex; expiresAt: bigint; data: Uint8Array; attributes: InspectedAttribute[] }
export interface InspectedChunk extends InspectedEntity { seq: number; byteStart: number; byteEndExclusive: number }
export interface ImageEntityInspection {
  mode: RetrievedImage['mode']; blockNumber: bigint; root: InspectedEntity; manifest?: InspectedEntity;
  chunks: InspectedChunk[]; totalBytes: number; sha256: Hex;
  queries: { root: string; manifest?: string; chunks?: string };
}
export class InspectionError extends Error {
  constructor() { super('Entity details could not be verified against this image. Try retrieving it again.'); this.name = 'InspectionError'; }
}
function fail(): never { throw new InspectionError(); }
const isKey = (value: unknown): value is Hex => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const isAddress = (value: unknown): value is Hex => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
const sameHex = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const selection = { $key: true, $owner: true, $creator: true, $expiresAt: true, $creationFlags: true, $attributes: true } as const;
type InspectionRow = { $key: Hex; $owner: Hex; $creator: Hex; $expiresAt: bigint; $attributes: Attributes };
function present(entity: InspectionRow | undefined, block: bigint): InspectedEntity {
  if (!entity || !isKey(entity.$key) || !isAddress(entity.$owner) || !isAddress(entity.$creator) ||
      typeof entity.$expiresAt !== 'bigint' || entity.$expiresAt <= block || !entity.$attributes) fail();
  const attributes = entity.$attributes;
  const field = attributes.data ?? attributes.metadata;
  if (field?.type !== 'bytes' || typeof field.value !== 'string' || !/^0x(?:[\da-f]{2})*$/i.test(field.value) || field.value.length > 240002) fail();
  return {
    key: entity.$key, owner: entity.$owner, creator: entity.$creator, expiresAt: entity.$expiresAt,
    data: hexToBytes(field.value), attributes: Object.entries(attributes).map(([name, a]) => ({ name, type: a.type, value: a.value })),
  };
}
function attr(entity: InspectedEntity, name: string, type: InspectedAttribute['type']): InspectedAttribute['value'] {
  const value = entity.attributes.find(a => a.name === name); if (!value || value.type !== type) fail(); return value.value;
}
const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
async function digest(bytes: Uint8Array): Promise<Hex> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return `0x${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`;
}
/** Read-only latest-state inspection. Package retrieval remains the only image reconstruction API. */
export async function inspectImageEntities(client: PublicArkivClient, imageKey: Hex, verified: RetrievedImage): Promise<ImageEntityInspection> {
  try {
    if (!isKey(imageKey) || !isKey(verified.sha256) || verified.bytes.length !== verified.byteLength || client.chain?.id !== 7794095 || await client.getChainId() !== 7794095) fail();
    const plan = planImage(verified.byteLength); if (plan.mode !== verified.mode) fail();
    const page = await client.select(selection).where(eq('$key', key(imageKey))).limit(1).fetch();
    const root = present(page.entities[0], page.blockNumber);
    if (!page.entities[0]?.$creationFlags.readonly || !sameHex(root.key, imageKey) || attr(root, 'type', 'str') !== IMAGE_TYPE ||
        attr(root, 'mode', 'str') !== verified.mode || attr(root, 'mime', 'str') !== verified.contentType ||
        attr(root, 'filename', 'str') !== verified.filename || !sameHex(attr(root, 'sha256', 'str'), verified.sha256) ||
        attr(root, 'size', 'u64') !== BigInt(verified.byteLength) || attr(root, 'width', 'u64') !== BigInt(verified.width) || attr(root, 'height', 'u64') !== BigInt(verified.height)) fail();
    const queries: ImageEntityInspection['queries'] = {
      root: `client.select({ $key: true, $attributes: true, $expiresAt: true }).where(eq('$key', key('${imageKey}'))).limit(1).fetch();\n// Each request reads latest state; this root was read at ${page.blockNumber}n.`,
    };
    const base = { mode: verified.mode, blockNumber: page.blockNumber, root, totalBytes: verified.byteLength, sha256: verified.sha256, queries };
    if (verified.mode === 'inline') {
      if (root.expiresAt !== verified.expiresAt || !equalBytes(root.data, verified.bytes) || !sameHex(await digest(root.data), verified.sha256)) fail();
      return { ...base, chunks: [] };
    }
    const manifestKey = attr(root, 'manifest', 'key');
    if (!isKey(manifestKey) || sameHex(manifestKey, root.key) || root.data.length !== 0) fail();
    const manifestPage = await client.select(selection).where(eq('$key', key(manifestKey))).limit(1).fetch();
    const manifest = present(manifestPage.entities[0], manifestPage.blockNumber);
    if (!sameHex(manifest.key, manifestKey) || attr(manifest, 'type', 'str') !== 'arkiv-chunking/manifest/v2' || attr(manifest, 'complete', 'bool') !== true ||
        attr(manifest, 'totalbytes', 'u64') !== BigInt(verified.byteLength) || attr(manifest, 'chunkcount', 'u64') !== BigInt(plan.chunkCount) ||
        !sameHex(attr(manifest, 'sha256', 'str'), verified.sha256) || manifest.data.length > 2048 ||
        manifest.expiresAt !== root.expiresAt || root.expiresAt !== verified.expiresAt) fail();
    const chunkSizeValue = attr(manifest, 'chunksize', 'u64');
    if (typeof chunkSizeValue !== 'bigint' || chunkSizeValue < 1n || chunkSizeValue > 120000n) fail();
    const chunkSize = Number(chunkSizeValue);
    if (Math.ceil(verified.byteLength / chunkSize) !== plan.chunkCount) fail();
    const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest.data));
    if (metadata?.filename !== verified.filename || metadata?.contentType !== verified.contentType) fail();
    const chunks: InspectedChunk[] = [], seenSeq = new Set<number>();
    const seenKeys = new Set([root.key.toLowerCase(), manifest.key.toLowerCase()]);
    let lastKey: Hex | undefined;
    for (;;) {
      const filters: Expression[] = [eq('manifest', key(manifestKey)), eq('type', str('arkiv-chunking/chunk/v2'))];
      if (lastKey) filters.push(gt('$key', key(lastKey)));
      const parts = await client.select(selection).where(and(...filters)).ownedBy(manifest.owner).createdBy(manifest.creator).orderBy(asc('$key')).limit(10).fetch();
      for (const row of parts.entities) {
        const chunk = present(row, parts.blockNumber), seqValue = attr(chunk, 'seq', 'u64');
        if (chunks.length >= plan.chunkCount || !row.$creationFlags.readonly || typeof seqValue !== 'bigint' || seqValue < 0n || seqValue >= BigInt(plan.chunkCount)) fail();
        const seq = Number(seqValue), byteStart = seq * chunkSize, byteEndExclusive = Math.min(byteStart + chunkSize, verified.byteLength);
        if ((lastKey && chunk.key.toLowerCase() <= lastKey.toLowerCase()) || seenSeq.has(seq) || seenKeys.has(chunk.key.toLowerCase()) || chunk.data.length !== byteEndExclusive - byteStart ||
            !equalBytes(chunk.data, verified.bytes.subarray(byteStart, byteEndExclusive)) || attr(chunk, 'type', 'str') !== 'arkiv-chunking/chunk/v2' ||
            !sameHex(attr(chunk, 'manifest', 'key'), manifestKey) || !sameHex(chunk.owner, manifest.owner) || !sameHex(chunk.creator, manifest.creator)) fail();
        seenSeq.add(seq); seenKeys.add(chunk.key.toLowerCase()); lastKey = chunk.key; chunks.push({ ...chunk, seq, byteStart, byteEndExclusive });
      }
      if (parts.entities.length < 10) break;
    }
    if (chunks.length !== plan.chunkCount) fail();
    chunks.sort((a,b) => a.seq - b.seq);
    const again = await client.select(selection).where(eq('$key', key(manifestKey))).limit(1).fetch();
    const latestManifest = present(again.entities[0], again.blockNumber);
    const fingerprint = (v: unknown) => JSON.stringify(v, (_, n) => typeof n === 'bigint' ? String(n) : n);
    if (fingerprint(latestManifest) !== fingerprint(manifest)) fail();
    queries.manifest = `client.select({ $attributes: true, $expiresAt: true }).where(eq('$key', key('${manifestKey}'))).limit(1).fetch();\n// Recheck manifest after the last chunk; no historical snapshot is claimed.`;
    queries.chunks = `client.select({ $key: true, $attributes: true }).where(eq('manifest', key('${manifestKey}')), eq('type', str('arkiv-chunking/chunk/v2'))).ownedBy('${manifest.owner}').createdBy('${manifest.creator}').orderBy(asc('$key')).limit(10).fetch();\n// Next pages add gt('$key', key(lastKey)); display bytes ordered by seq.`;
    return { ...base, manifest, chunks };
  } catch { throw new InspectionError(); }
}
