export interface PublicExample { imageKey: string; expiresAt: string; format?: string; filename?: string; }
export function activeExamples(cases: readonly PublicExample[], head: bigint): PublicExample[] {
  return cases.filter(item => /^0x[0-9a-f]{64}$/i.test(item.imageKey) && /^\d+$/.test(item.expiresAt) && BigInt(item.expiresAt) > head)
    .map((item,index)=>({item,index})).sort((a,b)=>Number(b.item.format === 'image/jpeg')-Number(a.item.format === 'image/jpeg') || a.index-b.index).map(value=>value.item);
}
