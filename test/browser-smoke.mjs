import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
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
const routeRpc=async route=>{
  const req=route.request().postDataJSON();
  if(delay) await new Promise(r=>setTimeout(r,delay));
  const response=async q=>{
    try{if(failRead && q.method==='arkiv_query')throw Error('simulated read outage');return{jsonrpc:'2.0',id:q.id,result:await rpc.request(q)};}
    catch(e){return{jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}
  };
  await route.fulfill({json:Array.isArray(req)?await Promise.all(req.map(response)):await response(req)});
};
await context.route('https://rpc.tiramisu.db-chain.testnet.arkiv.network/**',routeRpc);
await page.exposeFunction('walletRequest',async args=>{
  if(args.method==='eth_chainId'&&wrongChain)return '0x1';
  if(args.method==='eth_sendTransaction'&&reject)throw Error('rejected');
  return rpc.request(args);
});
await page.addInitScript(()=>{
  window.ethereum={isMetaMask:true,request:args=>window.walletRequest(args),on(){},removeListener(){}};
});
await page.goto(process.env.SAMPLE_URL??'http://127.0.0.1:3082');
const packageVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
await page.waitForFunction(version=>document.querySelector('#version')?.textContent===`v${version}`,packageVersion);
assert.equal(await page.locator('html').getAttribute('lang'),'en');
await page.waitForFunction(()=>document.querySelector('#wallet')?.options[0]?.text.includes('MetaMask'));
await page.screenshot({path:join(output,'empty-1440.png'),fullPage:true});
assert.equal(await page.locator('#download-result').isVisible(),false);
assert.match(await page.locator('#key-help').innerText(),/No wallet needed/);
await page.locator('#file').focus();
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(()=>document.activeElement.id),'wallet');
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(()=>document.activeElement.id),'connect');
const settingsDisclosure=page.locator('summary').filter({hasText:'Storage settings'});
await settingsDisclosure.focus();await page.keyboard.press('Enter');
assert.equal(await page.locator('#rpc').isVisible(),true);
await page.keyboard.press('Enter');
assert.equal(await page.locator('#rpc').isVisible(),false);
await page.locator('#file').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
await page.waitForFunction(()=>document.querySelector('#file-info').dataset.state==='error');
await page.locator('#file').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(25*1024*1024+1)});
await page.waitForFunction(()=>document.querySelector('#file-info').textContent.includes('exceeds 25'));
await page.locator('#connect').click();
await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('Connected to Tiramisu'));
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
  assert.match(await page.locator('#read-status').innerText(),/byte for byte/);
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
await page.locator('#image-key').fill(`0x${'00'.repeat(32)}`);await page.locator('#retrieve').click();await page.waitForFunction(()=>document.querySelector('#read-status').textContent.includes('Image not found'));
reject=true;await page.locator('#upload').click();await page.waitForFunction(()=>document.querySelector('#upload-status').dataset.state==='error');
assert.equal(await page.locator('#upload-result').isVisible(),false);reject=false;
wrongChain=true;await page.locator('#upload').click();await page.waitForFunction(()=>document.querySelector('#upload-status').textContent.includes('Tiramisu'));wrongChain=false;
await page.reload();await page.locator('#image-key').fill(results[0].imageKey);await page.locator('#retrieve').click();await page.waitForFunction(()=>document.querySelector('#read-status').dataset.state==='success');
assert.equal(await page.locator('#read-status').innerText(),'Retrieved and verified.');
await page.getByText('Verification details',{exact:true}).click();
assert.match(await page.locator('#download-result').innerText(),/not the author’s identity/);
await browser.close();

// Real browser page zoom, configured in an isolated Chrome profile, not CSS zoom.
const profile=await mkdtemp(join(output,'native-zoom-profile-'));
const nativeContext=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:null,args:['--window-size=1440,1000']});
try {
  const settings=nativeContext.pages()[0];
  await settings.goto('chrome://settings/appearance',{waitUntil:'domcontentloaded'});
  await settings.getByRole('combobox',{name:'Mode',exact:true}).selectOption({label:'Dark'});
  await settings.getByRole('combobox',{name:'Page zoom',exact:true}).selectOption({label:'200%'});
  await nativeContext.route('https://rpc.tiramisu.db-chain.testnet.arkiv.network/**',routeRpc);
  const nativePage=await nativeContext.newPage();
  await nativePage.goto(process.env.SAMPLE_URL??'http://127.0.0.1:3082');
  await nativePage.locator('#image-key').fill(results[0].imageKey);
  await nativePage.locator('#retrieve').click();
  await nativePage.waitForFunction(()=>document.querySelector('#read-status').dataset.state==='success');
  const nativeZoom=await nativePage.evaluate(()=>({innerWidth,outerWidth,dpr:devicePixelRatio,cssZoom:getComputedStyle(document.body).zoom,overflow:document.documentElement.scrollWidth>innerWidth,imageDecoded:document.querySelector('#recovered').naturalWidth===320}));
  assert.equal(nativeZoom.cssZoom,'1');assert.equal(nativeZoom.overflow,false);assert.equal(nativeZoom.imageDecoded,true);
  assert.ok(nativeZoom.dpr>=2);assert.ok(nativeZoom.outerWidth/nativeZoom.innerWidth>=1.9);
  await nativePage.evaluate(()=>scrollTo(0,0));
  // CDP layout coordinates preserve the full image at native page zoom;
  // Playwright's CSS-coordinate clip crops this Chrome version at 200%.
  const cdp=await nativeContext.newCDPSession(nativePage);
  const layout=await cdp.send('Page.getLayoutMetrics');
  nativeZoom.browserZoom=layout.visualViewport.zoom;
  assert.equal(nativeZoom.browserZoom,2);
  const full=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...layout.contentSize,scale:1}});
  const viewport=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const fullPng=Buffer.from(full.data,'base64');
  assert.equal(fullPng.readUInt32BE(16),layout.contentSize.width);
  await writeFile(join(output,'native-zoom-200.png'),fullPng);
  await writeFile(join(output,'native-zoom-200-viewport.png'),Buffer.from(viewport.data,'base64'));
  results.push({nativeZoom});
} finally { await nativeContext.close(); }
await writeFile(join(output,'results.json'),JSON.stringify({packageVersion,results,transactions:rpc.transactions,account:TEST_ACCOUNT,kind:'mocked RPC and wallet with real SDK and browser decoder'},null,2));
console.log(JSON.stringify({ok:true,output,roundtrips:3,viewports:6,nativeZoom:'200%',transactions:rpc.transactions.length}));
