// Verify the exact manifest version in a private consumer; never rewrite the release sample.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access, cp, readdir } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import assert from 'node:assert/strict';
import { checkTree } from './vocabulary-guard.mjs';
const root=resolve('.'), manifest=JSON.parse(await readFile('package.json','utf8'));
const {name,version}=manifest, registry=process.argv.includes('--registry');
assert.ok(process.env.TMPDIR,'Use the registered DGX job private TMPDIR.');
const staging=join(process.env.TMPDIR,'images-release-consumer');await mkdir(staging);
function run(command,args,cwd=root){const p=spawnSync(command,args,{cwd,encoding:'utf8',maxBuffer:20*1024*1024});if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);assert.equal(p.status,0,command+' '+args.join(' '));return p.stdout;}
run(process.execPath,['scripts/check-dependency.mjs']);
run('npm',['run','typecheck']);run('npm',['run','lint']);run('npm',['test']);
const packed=JSON.parse(run('npm',['pack',...(registry?[name+'@'+version]:[]),'--ignore-scripts','--json','--pack-destination',staging]))[0];
assert.equal(packed.name,name);assert.equal(packed.version,version);
const tarball=join(staging,packed.filename), bytes=await readFile(tarball);
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
assert.equal(integrity,packed.integrity);assert.equal(createHash('sha1').update(bytes).digest('hex'),packed.shasum);
// Runtime VERSION is the implementation version. A documentation-only release keeps an earlier runtime:
// its whole dist must then be byte-identical to that earlier registry archive.
const runtimeVersion=/export const VERSION = '(\d+\.\d+\.\d+)';/.exec(await readFile('src/index.ts','utf8'))?.[1];assert.ok(runtimeVersion,'src/index.ts must export a literal VERSION');
let runtimeSource='this release';
if(runtimeVersion!==version){
  const semver=v=>v.split('.').map(Number),newer=(a,b)=>{for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;};
  assert.ok(newer(semver(version),semver(runtimeVersion)),`runtime VERSION ${runtimeVersion} must be an earlier release than ${version}`);
  const earlier=JSON.parse(run('npm',['pack',`${name}@${runtimeVersion}`,'--ignore-scripts','--json','--pack-destination',staging]))[0];
  assert.equal(earlier.version,runtimeVersion);
  const unpack=async(file,dir)=>{await mkdir(dir);run('tar',['-xzf',join(staging,file),'-C',dir]);const base=join(dir,'package');const files=(await readdir(base,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>join(e.parentPath??e.path,e.name).slice(base.length+1).replaceAll('\\','/')).sort();return{base,files};};
  const current=await unpack(packed.filename,join(staging,'unpacked-current')),previous=await unpack(earlier.filename,join(staging,'unpacked-runtime'));
  // Only guides and release notes may change; everything else, dist included, must be byte-identical.
  const documentation=new Set(['README.md','AGENTS.md','CHANGELOG.md','docs/verification.md','sample/README.md','sample/AGENTS.md']);
  assert.deepEqual(current.files,previous.files,'documentation-only release must ship the same files');
  const manifestWithoutVersion=async base=>{const m=JSON.parse(await readFile(join(base,'package.json'),'utf8'));delete m.version;return m;};
  assert.deepEqual(await manifestWithoutVersion(current.base),await manifestWithoutVersion(previous.base),'package.json may differ only in version');
  const identical=current.files.filter(file=>file!=='package.json'&&!documentation.has(file));
  assert.ok(identical.some(file=>file.startsWith('dist/')),'the archive must contain dist files');
  for(const file of identical)assert.deepEqual(await readFile(join(current.base,file)),await readFile(join(previous.base,file)),`${file} must be byte-identical to ${name}@${runtimeVersion}`);
  runtimeSource=`${name}@${runtimeVersion} (${identical.length} non-documentation files byte-identical, ${identical.filter(file=>file.startsWith('dist/')).length} in dist; package.json equal except version)`;
}
const consumer=join(staging,'consumer');await mkdir(consumer);
await writeFile(join(consumer,'package.json'),JSON.stringify({name:'images-release-consumer',private:true,type:'module'}));
run('npm',['install','--ignore-scripts','--no-audit','--no-fund',tarball,'@arkiv-network/sdk@1.0.1','viem@2.56.3'],consumer);
assert.deepEqual(await readFile(join(consumer,'node_modules/arkiv-images/dist/index.js')),await readFile('dist/index.js'));
for(const guide of ['README.md','AGENTS.md','CLAUDE.md'])await access(join(consumer,'node_modules/arkiv-images/sample',guide));
await writeFile(join(consumer,'inspect.mjs'),`import assert from 'node:assert/strict';import{inspectImage,planImage,VERSION}from'arkiv-images';const bytes=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4V+L2HwAG5AK4X5zdSAAAAABJRU5ErkJggg==','base64'));assert.equal(VERSION,${JSON.stringify(runtimeVersion)});assert.deepEqual(inspectImage(bytes),{contentType:'image/png',width:1,height:1,byteLength:70});assert.equal(planImage(bytes.length).mode,'inline');console.log('Manifest version and exact README example passed');`);
await writeFile(join(consumer,'types.ts'),`import type{ImageInfo,ImagePlan,StoreImageOptions,StoredImage,RetrieveImageOptions,RetrievedImage,TransactionParameterPolicy}from'arkiv-images';import{ImageSchema,VERSION,inspectImage,planImage,MAX_EXPIRATION_BLOCKS}from'arkiv-images';const policy:TransactionParameterPolicy=context=>({gas:context.defaults.gas,gasPrice:context.defaults.gasPrice});const accepts=(_:ImageInfo|ImagePlan|StoreImageOptions|StoredImage|RetrieveImageOptions|RetrievedImage)=>policy;void[accepts,ImageSchema,VERSION,inspectImage,planImage,MAX_EXPIRATION_BLOCKS];`);
run(process.execPath,['inspect.mjs'],consumer);run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--skipLibCheck','--module','NodeNext','--target','ES2022','types.ts'],consumer);
const sample=join(staging,'sample');await cp(join(root,'sample'),sample,{recursive:true,filter:source=>!['node_modules','dist','.vercel'].includes(basename(source))&&!basename(source).startsWith('.env')&&!source.endsWith('.tgz')});
run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--save-exact',tarball],sample);
const lock=JSON.parse(await readFile(join(sample,'package-lock.json'),'utf8'));assert.equal(lock.packages['node_modules/arkiv-images'].version,version);assert.equal(lock.packages['node_modules/arkiv-images'].integrity,integrity);
run('npm',['run','build'],sample);assert.deepEqual(checkTree(staging),[]);
console.log(JSON.stringify({name,version,source:registry?'registry':'source archive',filename:packed.filename,sha256:createHash('sha256').update(bytes).digest('hex'),integrity,runtimeVersion,runtimeSource,cleanConsumer:true,typecheck:true,isolatedSampleBuild:true,samplePinUnchanged:true}));
