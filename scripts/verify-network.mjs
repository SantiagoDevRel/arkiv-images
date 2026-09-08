// Read-only reproduction of the recorded Tiramisu tests. These entities can expire.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { http, serializeTransaction } from 'viem';
import { retrieveImage } from '../dist/index.js';
import { png } from '../test/fixtures.mjs';

const account='0xa618a2736431f24c26f1c8dac9ca00ecc845a1c6';
const client=createPublicClient({chain:tiramisu,transport:http(tiramisu.rpcUrls.default.http[0],{retryCount:0,timeout:30000,fetchOptions:{cache:'no-store'}})});
assert.equal(await client.getChainId(),7738577);
const evidence=JSON.parse(await readFile(new URL('../docs/testnet-evidence.json',import.meta.url),'utf8'));
for(const entry of evidence.cases){
  const original=entry.format==='image/jpeg'?new Uint8Array(await readFile(new URL('../test/fixtures/public.jpg',import.meta.url))):png(entry.bytes,320,200);
  const expected=`0x${createHash('sha256').update(original).digest('hex')}`;
  const result=await retrieveImage({publicClient:client,imageKey:entry.imageKey,expectedSha256:expected});
  assert.deepEqual(result.bytes,original);entry.byteExact=true;entry.sha256=expected;entry.expiresAt=String(result.expiresAt);
  for(const transaction of entry.transactions){
    const receipt=await client.getTransactionReceipt({hash:transaction.hash});
    const tx=await client.getTransaction({hash:transaction.hash});
    assert.equal(receipt.status,'success');assert.equal(tx.from.toLowerCase(),account);assert.equal(tx.to.toLowerCase(),'0x4400000000000000000000000000000000000044');assert.equal(tx.value,0n);assert.equal(tx.chainId,7738577);
    const common={chainId:tx.chainId,to:tx.to,nonce:tx.nonce,gas:tx.gas,value:tx.value,data:tx.input};
    const wire=tx.type==='legacy'?{...common,type:'legacy',gasPrice:tx.gasPrice}:{...common,type:tx.type,maxFeePerGas:tx.maxFeePerGas,maxPriorityFeePerGas:tx.maxPriorityFeePerGas,accessList:tx.accessList??[]};
    const encoded=serializeTransaction(wire,{r:tx.r,s:tx.s,v:tx.v,yParity:tx.yParity});
    transaction.blockNumber=String(receipt.blockNumber);transaction.gasUsed=String(receipt.gasUsed);transaction.calldataBytes=(tx.input.length-2)/2;transaction.signedBytes=(encoded.length-2)/2;transaction.status=receipt.status;
    assert.ok(transaction.signedBytes<=131072);
  }
  console.log(JSON.stringify({imageKey:entry.imageKey,bytes:result.byteLength,byteExact:true,transactions:entry.transactions.length}));
}
await assert.rejects(retrieveImage({publicClient:client,imageKey:`0x${'00'.repeat(32)}`}),{code:'NOT_FOUND'});
await assert.rejects(retrieveImage({publicClient:{...client,chain:{...tiramisu,id:1}},imageKey:evidence.cases[0].imageKey}),{code:'NETWORK_MISMATCH'});
evidence.lastReadVerifiedAt=new Date().toISOString();
await writeFile(new URL('../docs/testnet-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
