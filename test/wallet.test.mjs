import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWallet, guardWallet, guardedWalletClient } from '../sample/src/wallet.ts';

const account = `0x${'12'.repeat(20)}`;
const other = `0x${'34'.repeat(20)}`;
const tiramisu = `0x${(7738577).toString(16)}`;
function wallet({ chain = tiramisu, unknown = false, reject = false, switchWorks = true } = {}) {
  const state = { chain, account, calls: [] };
  return { state, request: async ({ method, params }) => {
    state.calls.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [state.account];
    if (method === 'eth_chainId') return state.chain;
    if (method === 'wallet_switchEthereumChain') {
      assert.equal(params[0].chainId, tiramisu);
      if (reject) throw Object.assign(new Error('Declined'), { code: 4001 });
      if (unknown) throw Object.assign(new Error('Unknown'), { code: 4902 });
      if (switchWorks) state.chain = params[0].chainId;
      return null;
    }
    if (method === 'wallet_addEthereumChain') { assert.equal(params[0].chainId, tiramisu); unknown = false; return null; }
    if (method === 'eth_sendTransaction') return 'sent';
    throw Error('Unexpected method ' + method);
  }};
}
test('connection is already on Tiramisu or automatically switches/adds only Tiramisu', async () => {
  for (const options of [{}, { chain:'0x1' }, { chain:'0x1', unknown:true }]) {
    const w = wallet(options); assert.equal(await connectWallet(w), account); assert.equal(w.state.chain, tiramisu);
    assert.equal(w.state.calls.includes('eth_sendTransaction'), false);
  }
});
test('rejected or ineffective switch never produces a connected wallet', async () => {
  await assert.rejects(connectWallet(wallet({ chain:'0x1', reject:true })), e => e.code === 4001);
  await assert.rejects(connectWallet(wallet({ chain:'0x1', switchWorks:false })), /WRONG_CHAIN/);
});
test('account/network changes and invalidated sessions stop before sending', async () => {
  const w = wallet(); await connectWallet(w);
  const client = guardedWalletClient(w, account, () => false);
  w.state.account = other;
  await assert.rejects(client.transport.request({ method:'eth_sendTransaction', params:[{}] }), /WALLET_CHANGED/);
  w.state.account = account; w.state.chain = '0x1';
  await assert.rejects(guardWallet(w, account), /WRONG_CHAIN/);
  w.state.chain = tiramisu; await assert.rejects(guardWallet(w, account, true), /WALLET_CHANGED/);
  assert.equal(w.state.calls.includes('eth_sendTransaction'), false);
});
