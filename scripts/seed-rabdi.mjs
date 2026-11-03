// Idempotent current synthetic PNG/JPEG examples; dated large-fixture evidence is historical.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createPublicClient,createWalletClient,ExpirationTime,MAX_LIFETIME} from '@arkiv-network/sdk';
import {rabdi} from '@arkiv-network/sdk/chains';
import {eq} from '@arkiv-network/sdk/query';
import {str} from '@arkiv-network/sdk/schema';
import {http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {hashFile,writeWithPolicy} from 'arkiv-chunking';
import {VERSION,ImageSchema,storeImage,retrieveImage} from 'arkiv-images';
import {png} from '../test/fixtures.mjs';

const statePath=path.resolve(process.env.ARKIV_SEED_STATE??'.seed-rabdi-state.json');
const descriptorPath=path.resolve(process.env.ARKIV_SEED_DESCRIPTOR??'sample/public/samples.json');
const lockPath=statePath+'.lock';
fs.mkdirSync(path.dirname(statePath),{recursive:true});
const lock=fs.openSync(lockPath,'wx',0o600);
let queries=0,writes=0;
const report={package:VERSION,sdk:'1.0.1',chainId:7794095,writes:0,creates:0,extensions:0,transactions:[],cases:[]};
let state;
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
try{
 assert.equal(JSON.parse(fs.readFileSync('node_modules/@arkiv-network/sdk/package.json')).version,'1.0.1');
 state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{cases:{},operations:[]};
 state.operations??=[];
 assert.ok(!Object.values(state.cases).some(c=>c.inFlight),'Unresolved seed: inspect persistent receipts before another write.');
 const account=privateKeyToAccount(process.env.TEST_IMAGES_PRIVATE_KEY);
 assert.equal(account.address.toLowerCase(),process.env.TEST_IMAGES_ADDRESS.toLowerCase());
 assert.notEqual(account.address.toLowerCase(),'0x2f6e6adb6bc8f79799cb479fb5cb237fa3caa690');
 report.account=account.address;
 const chain=rabdi({accessKey:process.env.ARKIV_ACCESS_KEY_A});
 const transport=config=>{const base=http(undefined,{retryCount:0,timeout:30000,fetchOptions:{cache:'no-store'}})(config);return{...base,request:args=>{if(args.method==='arkiv_query')queries++;return base.request(args);}};};
 const reader=createPublicClient({chain,transport,cacheTime:0});
 const signer=createWalletClient({chain,account,transport,cacheTime:0});
 assert.equal(await reader.getChainId(),7794095);
 const timing=await reader.transport.request({method:'arkiv_getBlockTiming',params:[]});
 assert.ok(Number.isSafeInteger(timing.current_block)&&Number.isSafeInteger(timing.current_block_time)&&Number.isSafeInteger(timing.duration)&&timing.duration>0);
 const required=BigInt(timing.current_block)+BigInt(Math.max(0,Math.ceil((Date.parse('2027-01-01T00:00:00Z')/1000-timing.current_block_time)/timing.duration)));
 report.requiredExpiryBlock=String(required);
 let current;
 async function recorded(method,args){
  const params=args.at(-1);assert.ok(params.gas>=1000000n&&params.gasPrice>0n&&Number.isSafeInteger(params.nonce));
  const operation={filename:current,method,phase:'sending',gas:String(params.gas),gasPrice:String(params.gasPrice),nonce:params.nonce};
  state.operations.push(operation);save();writes++;
  try{const result=await signer[method](...args);operation.phase='submitted';operation.hash=result.txHash;save();return result;}
  catch(error){operation.phase='uncertain';if(/^0x[\da-f]{64}$/i.test(error.txHash??''))operation.hash=error.txHash;save();throw error;}
 }
 const wallet={...signer,createEntity:(...a)=>recorded('createEntity',a),patchEntity:(...a)=>recorded('patchEntity',a)};
 async function policy(context){
  const balance=await reader.getBalance({address:account.address,blockTag:'latest'});assert.ok(balance>=context.defaults.gas*context.defaults.gasPrice);
  state.cases[current].lastEstimate={estimate:String(context.estimate),gas:String(context.defaults.gas),gasPrice:String(context.defaults.gasPrice),nonce:context.defaults.nonce};save();return{};
 }
 const inputs=[['rabdi-public-inline.jpg',new Uint8Array(fs.readFileSync(new URL('../test/fixtures/public.jpg',import.meta.url)))],['rabdi-public-inline.png',png(undefined,320,200)]];
 for(const [filename,bytes]of inputs){
  current=filename;const sha256=await hashFile(bytes);
  const found=await reader.select({$key:true}).from(ImageSchema).where(eq('sha256',str(sha256))).ownedBy(account.address).createdBy(account.address).limit(10).fetch();
  let imageKey,verified;
  for(const row of found.entities){const candidate=await retrieveImage({publicClient:reader,imageKey:row.$key,expectedSha256:sha256});assert.deepEqual(candidate.bytes,bytes);if(candidate.filename===filename){imageKey=row.$key;verified=candidate;break;}}
  if(!imageKey){
   state.cases[filename]={inFlight:true,phase:'creating',sha256};save();
   const created=await storeImage({publicClient:reader,walletClient:wallet,bytes,filename,expirationBlocks:604800,txParams:policy});
   imageKey=created.imageKey;state.cases[filename].imageKey=imageKey;save();report.creates++;
   verified=await retrieveImage({publicClient:reader,imageKey,expectedSha256:sha256});
  }else{state.cases[filename]={...state.cases[filename],imageKey,sha256,inFlight:false};save();}
  assert.equal(verified.mode,'inline');assert.deepEqual(verified.bytes,bytes);
  const entity=await reader.getEntity(imageKey);assert.equal(entity.$owner.toLowerCase(),account.address.toLowerCase());assert.equal(entity.$creator.toLowerCase(),account.address.toLowerCase());
  if(verified.expiresAt<required){
   state.cases[filename].inFlight=true;state.cases[filename].phase='maximum-extension';save();
   const extensions=[{entityKey:imageKey,expiration:ExpirationTime.max()}],hashes=[];
   const renewed=await writeWithPolicy(wallet,{phase:'finalize'},unsigned=>unsigned.executeBatch({extensions},{gas:1000000n,gasPrice:1n,nonce:0}),params=>recorded('executeBatch',[{extensions},params]),hashes,policy);
   const receipt=await reader.getTransactionReceipt({hash:renewed.txHash});assert.equal(receipt.status,'success');
   assert.equal((await reader.getEntity(imageKey)).$expiresAt,receipt.blockNumber+MAX_LIFETIME);report.extensions++;
   verified=await retrieveImage({publicClient:reader,imageKey,expectedSha256:sha256});
  }
  assert.ok(verified.expiresAt>=required);assert.deepEqual(verified.bytes,bytes);
  state.cases[filename]={...state.cases[filename],inFlight:false,phase:'complete',expiresAt:String(verified.expiresAt)};save();
  report.cases.push({filename,imageKey,sha256,mode:verified.mode,format:verified.contentType,bytes:bytes.length,width:verified.width,height:verified.height,expiresAt:String(verified.expiresAt),byteExact:true});
 }
 for(const operation of state.operations){
  if(!operation.hash)throw Error('Operation hash missing; preserve state and reconcile.');
  const [receipt,tx]=await Promise.all([reader.getTransactionReceipt({hash:operation.hash}),reader.getTransaction({hash:operation.hash})]);
  assert.equal(receipt.status,'success');assert.equal(tx.from.toLowerCase(),account.address.toLowerCase());assert.equal(String(tx.gas),operation.gas);assert.equal(String(tx.gasPrice),operation.gasPrice);assert.equal(tx.nonce,operation.nonce);
  assert.ok(tx.gas<=15000000n);operation.phase='confirmed';save();report.transactions.push({...operation,status:receipt.status,gasUsed:String(receipt.gasUsed),blockNumber:String(receipt.blockNumber)});
 }
 fs.writeFileSync(descriptorPath,JSON.stringify({chainId:7794095,cases:report.cases},null,2)+'\n');
 report.writes=writes;report.queriesKeyA=queries;report.funderSigned=false;
 console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({stopped:true,error:error.code??error.name,writes,queriesKeyA:queries,unresolvedStatePreserved:true}));process.exitCode=1;}
finally{fs.closeSync(lock);fs.unlinkSync(lockPath);}
