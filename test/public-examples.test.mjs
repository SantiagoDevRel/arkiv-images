import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {allowedRequest} from '../sample/api/rpc.mjs';
const text=fs.readFileSync(new URL('../sample/src/public-examples.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {activeExamples}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const cases=JSON.parse(fs.readFileSync(new URL('../sample/public/samples.json',import.meta.url))).cases;
test('public default is the long-lived JPEG; old PNGs and expiry boundary are excluded',()=>{
 assert.equal(cases[0].imageKey,'0x2989bda8bbadfe7e22a0b1e3a435aa3b266106adbbca3f97c162ee4eccca8488');
 const active=activeExamples(cases,20000n);assert.equal(active[0].imageKey,cases[0].imageKey);assert.ok(active.every(x=>BigInt(x.expiresAt)>20000n));
 assert.deepEqual(activeExamples(cases,BigInt(cases[0].expiresAt)),[]);
 assert.deepEqual(activeExamples([{imageKey:'bad',expiresAt:'no'}],0n),[]);
});
test('head read allows no arguments only and rejects historical reads and writes',()=>{
 const body={jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]};assert.equal(allowedRequest(body),true);
 assert.equal(allowedRequest({...body,params:['latest']}),false);assert.equal(allowedRequest({...body,method:'eth_sendTransaction'}),false);
});
