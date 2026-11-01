import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const source=fs.readFileSync(new URL('../scripts/mutate-inherited-policy.mjs',import.meta.url),'utf8');
// Exercise the actual verifier at its I/O boundaries without installing an unpublished
// release. This contract test does not replace its real ten-case integration/mutation run.
function execute({declared,installed=declared,trace=[]}){
 const stage='/virtual/old-policy/stage',writes=new Map(),messages=[];
 const files={
  readFileSync(file){
   file=String(file);
   if(file===path.join(stage,'node_modules/arkiv-chunking/package.json'))return JSON.stringify({version:'1.1.0'});
   if(file===path.join(stage,'package-lock.json'))return JSON.stringify({packages:{'node_modules/arkiv-chunking':{resolved:'https://registry.npmjs.org/arkiv-chunking/-/arkiv-chunking-1.1.0.tgz'}}});
   if(file==='node_modules/arkiv-chunking/package.json')return JSON.stringify({version:installed});
   if(file==='package.json')return JSON.stringify({dependencies:{'arkiv-chunking':declared}});
   if(file==='package-lock.json')return '{}';
   throw Error('Unexpected verifier read: '+file);
  },
  mkdirSync(){},mkdtempSync(){return stage;},cpSync(){},copyFileSync(){},
  writeFileSync(file,text){writes.set(file,text);},
 };
 const spawnSync=(command,args,options)=>{
  trace.push({command,args,cwd:options.cwd});
  if(command==='npm'){assert.ok(args.includes('arkiv-chunking@1.1.0'));return {status:0,stdout:'Controlled old-registry install boundary',stderr:''};}
  assert.deepEqual([...args],['--test','test/inherited-policy.test.mjs']);
  return options.cwd===stage
   ? {status:1,stdout:'# fail 10\n'+('    must retain inherited uncertain hash\n{"noResend":true}\n').repeat(10),stderr:''}
   : {status:0,stdout:'# pass 10\n'+('{"noResend":true}\n').repeat(10),stderr:''};
 };
 const program=source.replace(/^import .*;\r?\n/gm,'');
 new vm.Script(program,{filename:'mutate-inherited-policy.mjs'}).runInNewContext({fs:files,path,spawnSync,assert,createHash,process:{env:{TMPDIR:'/virtual/tmp'},cwd:()=>'/virtual/images',execPath:'controlled-node'},console:{log:line=>messages.push(JSON.parse(line))}});
 return {trace,messages,result:JSON.parse(writes.get(path.join('/virtual/tmp','evidence','inherited-policy-mutation.json')))};
}
for(const version of ['1.1.2','1.1.3','1.1.4'])test(`verifier accepts exact declared and installed ${version} and reports it`,()=>{
 const result=execute({declared:version});assert.equal(result.trace.length,3);assert.equal(result.result.positiveVersion,version);assert.equal(result.result.positiveCases,10);assert.equal(result.result.oldHashRetentionFailures,10);assert.equal(result.result.noResendControlsPassed,10);assert.equal(result.result.sourceManifestLockUnchanged,true);assert.equal(result.messages[0].installedChunkingVersion,version);assert.equal(result.messages[0].declaredChunkingVersion,version);
});
test('verifier rejects an installed version mismatch before behavioral or install work',()=>{
 const trace=[];assert.throws(()=>execute({declared:'1.1.3',installed:'1.1.2',trace}),/Installed arkiv-chunking must match the exact declared dependency/);assert.equal(trace.length,0);
});
test('verifier rejects a dependency range before behavioral or install work',()=>{
 const trace=[];assert.throws(()=>execute({declared:'^1.1.3',installed:'1.1.3',trace}),/Declare an exact arkiv-chunking version/);assert.equal(trace.length,0);
});
