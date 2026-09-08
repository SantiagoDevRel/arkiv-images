import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { rpcHarness, TEST_ACCOUNT } from './rpc-harness.mjs';
import { png } from './fixtures.mjs';

const output = process.env.ARTIFACTS_DIR ?? join(homedir(),'Downloads','arkiv-image-storage-98','browser');
await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({colorScheme:'dark',viewport:{width:1440,height:1000},acceptDownloads:true});
const page = await context.newPage(), rpc=rpcHarness();
let reject=false, failRead=false, wrongChain=false, delay=0;
await context.route('https://rpc.tiramisu.db-chain.testnet.arkiv.network/**',async route=>{
  const req=route.request().postDataJSON();
  if(delay) await new Promise(r=>setTimeout(r,delay));
  const response=async q=>{
    try{if(failRead && q.method==='arkiv_query')throw Error('simulated read outage');return{jsonrpc:'2.0',id:q.id,result:await rpc.request(q)};}
    catch(e){return{jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}
  };
  await route.fulfill({json:Array.isArray(req)?await Promise.all(req.map(response)):await response(req)});
});
await page.exposeFunction('walletRequest',async args=>{
  if(args.method==='eth_chainId'&&wrongChain)return '0x1';
  if(args.method==='eth_sendTransaction'&&reject)throw Error('rejected');
  return rpc.request(args);
});
await page.addInitScript(()=>{
  window.ethereum={isMetaMask:true,request:args=>window.walletRequest(args),on(){},removeListener(){}};
});
await page.goto(process.env.SAMPLE_URL??'http://127.0.0.1:3082');
await page.waitForFunction(()=>document.querySelector('#wallet')?.options[0]?.text.includes('MetaMask'));
await page.screenshot({path:join(output,'empty-1440.png'),fullPage:true});
assert.match(await page.locator('#read-status').innerText(),/Todavía/);
await page.locator('#file').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
await page.waitForFunction(()=>document.querySelector('#file-info').dataset.state==='error');
await page.locator('#file').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(25*1024*1024+1)});
await page.waitForFunction(()=>document.querySelector('#file-info').textContent.includes('supera 25'));
await page.locator('#connect').click();
await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('Tiramisu conectada'));
const results=[];
for(const fixture of [
  {bytes:png(undefined,320,200),filename:'inline.png',mimeType:'image/png'},
  {bytes:new Uint8Array(await readFile(new URL('./fixtures/public.jpg',import.meta.url))),filename:'public.jpg',mimeType:'image/jpeg'},
  {bytes:png(120001,320,200),filename:'chunked.png',mimeType:'image/png'},
]){
  const {bytes,filename,mimeType}=fixture;
  await page.locator('#file').setInputFiles({name:filename,mimeType,buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>document.querySelector('#file-info').dataset.state==='success');
  await page.locator('#consent').check();
  await page.locator('#upload').click();
  await page.waitForFunction(()=>document.querySelector('#upload-status').dataset.state==='success');
  delay=100;
  await page.locator('#retrieve').click();
  await page.waitForFunction(()=>document.querySelector('#read-status').dataset.state==='loading');
  await page.screenshot({path:join(output,`loading-${filename}.png`),fullPage:true});
  await page.waitForFunction(()=>document.querySelector('#read-status').dataset.state==='success');delay=0;
  assert.match(await page.locator('#read-status').innerText(),/byte por byte/);
  assert.equal(await page.locator('#recovered').evaluate(img=>img.complete&&img.naturalWidth===320),true);
  const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;
  assert.deepEqual(new Uint8Array(await readFile(await download.path())),bytes);
  results.push({filename,bytes:bytes.length,imageKey:await page.locator('#image-key').inputValue()});
}
for(const width of [390,599,600,601,768,1440]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,fonts:[...document.querySelectorAll('h1,h2,label,button,.help')].slice(0,10).map(e=>({tag:e.tagName,size:getComputedStyle(e).fontSize,family:getComputedStyle(e).fontFamily,lineHeight:getComputedStyle(e).lineHeight})),loaded:document.fonts.check('500 32px "Space Grotesk"')&&document.fonts.check('400 16px "IBM Plex Mono"')}));
  assert.equal(metrics.overflow,false);assert.equal(metrics.loaded,true);
  await page.screenshot({path:join(output,`success-${width}.png`),fullPage:true});results.push({width,...metrics});
}
await page.setViewportSize({width:1440,height:1000});
await page.evaluate(()=>document.body.style.zoom='200%');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.screenshot({path:join(output,'zoom-200.png'),fullPage:true});
await page.evaluate(()=>document.body.style.zoom='');
failRead=true;await page.locator('#retrieve').click();await page.waitForFunction(()=>document.querySelector('#read-status').dataset.state==='error');
assert.equal(await page.locator('#download-result').isVisible(),false);
await page.screenshot({path:join(output,'read-error.png'),fullPage:true});failRead=false;
await page.locator('#image-key').fill(`0x${'00'.repeat(32)}`);await page.locator('#retrieve').click();await page.waitForFunction(()=>document.querySelector('#read-status').textContent.includes('No se encontró'));
reject=true;await page.locator('#upload').click();await page.waitForFunction(()=>document.querySelector('#upload-status').dataset.state==='error');
assert.equal(await page.locator('#upload-result').isVisible(),false);reject=false;
wrongChain=true;await page.locator('#upload').click();await page.waitForFunction(()=>document.querySelector('#upload-status').textContent.includes('Tiramisu'));wrongChain=false;
await page.reload();await page.locator('#image-key').fill(results[0].imageKey);await page.locator('#retrieve').click();await page.waitForFunction(()=>document.querySelector('#read-status').dataset.state==='success');
assert.match(await page.locator('#read-status').innerText(),/identidad/);
await writeFile(join(output,'results.json'),JSON.stringify({results,transactions:rpc.transactions,account:TEST_ACCOUNT,kind:'mocked RPC and wallet with real SDK and browser decoder'},null,2));
console.log(JSON.stringify({ok:true,output,roundtrips:3,viewports:6,transactions:rpc.transactions.length}));
await browser.close();
