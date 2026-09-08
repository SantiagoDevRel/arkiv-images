import { deflateSync } from 'node:zlib';
function pngChunk(type, data) {
  const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); result.write(type, 4); data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
// Synthetic PNG fixture, optionally with an ancillary text chunk to exercise exact byte boundaries.
export function png(length, width = 1, height = 1) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height,4); header[8]=8;header[9]=6;
  const pixels=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*(width*4+1)+1+x*4, inside=(x-width*.68)**2+(y-height*.33)**2<(height*.2)**2;
    pixels[i]=inside?254:24+Math.floor(y/height*50);pixels[i+1]=inside?116:30+Math.floor(x/width*60);pixels[i+2]=inside?70:169-Math.floor(y/height*80);pixels[i+3]=255;
  }
  if(width===1&&height===1) pixels.set([0,254,116,70,255]);
  const original = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(pixels)),pngChunk('IEND',Buffer.alloc(0))]);
  if (!length) return new Uint8Array(original);
  if (length < original.length + 14) throw Error('Fixture target is too short');
  const data = Buffer.alloc(length - original.length - 12, 120); data[0] = 97; data[1] = 0;
  const chunk = Buffer.alloc(data.length + 12); chunk.writeUInt32BE(data.length); chunk.write('tEXt', 4); data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return new Uint8Array(Buffer.concat([original.subarray(0,-12), chunk, original.subarray(-12)]));
}
