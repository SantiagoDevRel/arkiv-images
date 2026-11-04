// Regression: a wallet without Rabdi (4902) gets Rabdi added with only the keyless public RPC, never an access key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { connectWallet } from '../sample/src/wallet.ts';

const RABDI = '0x76edaf';
const KEYLESS = 'https://rpc.rabdi.db-chain.testnet.arkiv.network';
const account = `0x${'ab'.repeat(20)}`;

function wallet({ known = false, addError, switchError } = {}) {
  const state = { chain: '0x1', known, calls: [], added: [] };
  return { state, request: async ({ method, params }) => {
    state.calls.push(method);
    if (method.startsWith('arkiv_')) throw new Error('Arkiv reads must never go through the wallet');
    switch (method) {
      case 'eth_requestAccounts': case 'eth_accounts': return [account];
      case 'eth_chainId': return state.chain;
      case 'wallet_switchEthereumChain':
        assert.equal(params[0].chainId, RABDI);
        if (switchError) throw switchError;
        if (!state.known) throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
        state.chain = params[0].chainId; return null;
      case 'wallet_addEthereumChain':
        state.added.push(structuredClone(params[0]));
        if (addError) throw addError;
        state.known = true; return null;
      default: throw new Error('Unexpected wallet method ' + method);
    }
  }};
}

test('4902 adds Rabdi with only the keyless public RPC, switches and confirms 0x76edaf', async () => {
  const w = wallet();
  assert.equal(await connectWallet(w), account);
  assert.equal(w.state.chain, RABDI);
  assert.equal(w.state.added.length, 1);
  const [added] = w.state.added;
  assert.equal(added.chainId, RABDI);
  assert.deepEqual(added.rpcUrls, [KEYLESS]);
  for (const value of added.rpcUrls) {
    const url = new URL(value);
    assert.deepEqual([url.protocol, url.username, url.password, url.pathname, url.search, url.hash], ['https:', '', '', '/', '', '']);
  }
  assert.deepEqual(added.nativeCurrency, { name: 'Golem', symbol: 'tGLM', decimals: 18 });
  const calls = w.state.calls, addAt = calls.indexOf('wallet_addEthereumChain');
  assert.deepEqual(calls.slice(0, addAt + 2), ['eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
  assert.ok(calls.lastIndexOf('eth_chainId') > addAt, 'chain is confirmed after the add and switch');
  assert.equal(calls.some(m => m.startsWith('arkiv_') || m === 'eth_sendTransaction'), false);
});

test('a wallet that already has Rabdi is switched without being offered a network', async () => {
  const w = wallet({ known: true });
  assert.equal(await connectWallet(w), account);
  assert.equal(w.state.chain, RABDI);
  assert.equal(w.state.added.length, 0);
});

test('a declined add or a non-4902 switch error never connects', async () => {
  const declined = wallet({ addError: Object.assign(new Error('User rejected'), { code: 4001 }) });
  await assert.rejects(connectWallet(declined), e => e.code === 4001);
  assert.equal(declined.state.chain, '0x1');
  const failed = wallet({ switchError: Object.assign(new Error('Busy'), { code: -32002 }) });
  await assert.rejects(connectWallet(failed), e => e.code === -32002);
  assert.equal(failed.state.added.length, 0);
});

test('a wallet that wraps 4902 (MetaMask Mobile) also gets the keyless add; a bare -32603 does not', async () => {
  const wrapped = wallet();
  const request = wrapped.request;
  wrapped.request = async args => {
    if (args.method === 'wallet_switchEthereumChain' && !wrapped.state.known) {
      wrapped.state.calls.push(args.method);
      throw Object.assign(new Error('Internal error'), { code: -32603, data: { originalError: { code: 4902 } } });
    }
    return request(args);
  };
  assert.equal(await connectWallet(wrapped), account);
  assert.deepEqual(wrapped.state.added.map(a => a.rpcUrls), [[KEYLESS]]);
  assert.equal(wrapped.state.chain, RABDI);
  const bare = wallet({ switchError: Object.assign(new Error('Internal error'), { code: -32603 }) });
  await assert.rejects(connectWallet(bare), e => e.code === -32603);
  assert.equal(bare.state.added.length, 0);
});

const root = new URL('../', import.meta.url);
async function filesUnder(dir) {
  const entries = await readdir(new URL(dir, root), { recursive: true, withFileTypes: true });
  return entries.filter(e => e.isFile()).map(e => join(e.parentPath ?? e.path, e.name));
}

test('browser code and wallet guides never ask for an access key or a keyed RPC URL in a wallet', async () => {
  const files = [...await filesUnder('sample/src/'), ...await filesUnder('sample/public/'),
    ...['sample/index.html', 'sample/README.md', 'sample/AGENTS.md', 'README.md', 'AGENTS.md'].map(file => new URL(file, root))];
  assert.ok(files.length > 10);
  let rabdiUrls = 0;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const [found] of text.matchAll(/[\w+.-]*:?\/?\/?[^\s`'"<>()[\]]*rpc\.rabdi\.db-chain\.testnet\.arkiv\.network[^\s`'"<>()[\]]*/g)) {
      rabdiUrls++;
      const url = new URL(found.includes('://') ? found : `https://${found}`);
      assert.deepEqual([url.username, url.password, url.pathname, url.search, url.hash], ['', '', '/', '', ''], `${file}: keyed Rabdi RPC URL ${found}`);
    }
    assert.doesNotMatch(text, /own access key|own (configured )?(wallet )?RPC/i, `${file} tells wallet users to use their own key or RPC`);
  }
  assert.ok(rabdiUrls >= 4, 'the keyless URL is documented and used');
});
