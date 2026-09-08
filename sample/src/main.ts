import { createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { custom, http, type EIP1193Provider, type Hex } from 'viem';
import { inspectImage, planImage, storeImage, retrieveImage, ImageStorageError, ChunkingError, VERSION, INLINE_MAX_BYTES, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from 'arkiv-images';
import './style.css';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wallets = new Map<string, { name: string; provider: EIP1193Provider }>();
let connected: { provider: EIP1193Provider; address: Hex } | undefined;
let busy = false, selectionId = 0, originalUrl: string | undefined, recoveredUrl: string | undefined;
let selected: { bytes: Uint8Array; filename: string } | undefined;
let stored: { key: Hex; bytes: Uint8Array; sha256: Hex } | undefined;
const rpcInput = el<HTMLInputElement>('rpc'), walletSelect = el<HTMLSelectElement>('wallet');
const explorer = tiramisu.blockExplorers?.default.url;
rpcInput.value = tiramisu.rpcUrls.default.http[0];
el('version').textContent = `v${VERSION}`;
el('limits').textContent = `Up to ${INLINE_MAX_BYTES.toLocaleString('en-US')} bytes: one entity and one transaction. Larger files use chunking, up to ${MAX_IMAGE_BYTES.toLocaleString('en-US')} bytes (25 MiB) and ${MAX_IMAGE_PIXELS.toLocaleString('en-US')} pixels. Size depends on the file, not just its dimensions.`;
function status(id: string, message: string, state = 'idle') { el(id).textContent = message; el(id).dataset.state = state; }
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach(c => { c.disabled = value; });
  for (const id of ['upload-form','read-form']) el(id).setAttribute('aria-busy', String(value));
}
function refreshWallets() {
  const previous = walletSelect.value;
  walletSelect.replaceChildren(...[...wallets].map(([id,w]) => new Option(w.name,id)));
  if (!wallets.size) walletSelect.add(new Option('No wallet detected',''));
  if (wallets.has(previous)) walletSelect.value = previous;
}
window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
  const { info, provider } = event.detail ?? {};
  if (info?.uuid && typeof info.name === 'string' && provider?.request) { wallets.set(info.uuid, { name: info.name, provider }); refreshWallets(); }
}) as EventListener);
window.dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(() => {
  const legacy = (window as Window & { ethereum?: EIP1193Provider & { isRabby?: boolean; isMetaMask?: boolean } }).ethereum;
  if (legacy && wallets.size === 0) wallets.set('injected', { name: legacy.isRabby ? 'Rabby' : legacy.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: legacy });
  refreshWallets();
}, 150);
function provider() { const p = wallets.get(walletSelect.value)?.provider; if (!p) throw new Error('NO_WALLET'); return p; }
function publicClient() {
  let url: URL; try { url = new URL(rpcInput.value); } catch { throw new Error('INVALID_RPC'); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) || url.username || url.password || url.hash) throw new Error('INVALID_RPC');
  return createPublicClient({ chain: tiramisu, transport: http(url.href, { retryCount: 0, timeout: 30000, fetchOptions: { cache: 'no-store' } }) });
}
function message(error: unknown): string {
  if (error instanceof ImageStorageError || error instanceof ChunkingError) {
    const map: Record<string,string> = {
      INVALID_IMAGE: 'The image is not a supported PNG/JPEG, is damaged, or exceeds the pixel limit.',
      TOO_LARGE: 'The image exceeds 25 MiB. Choose a smaller file.',
      INVALID_INPUT: 'Check the image key, filename and Entity Expiration block count.',
      NETWORK_MISMATCH: 'The wallet and RPC must use Tiramisu. Select Use Tiramisu.',
      NOT_FOUND: 'Image not found. Check the key and network; the entity may have expired.',
      UPLOAD_FAILED: 'Storing did not complete. Inspect your wallet and available receipts before trying again.',
      READ_FAILED: 'Could not query Arkiv. Check the RPC connection, access key and provider limits.',
      MISSING_CHUNK: 'Some chunks are missing or expired. A partial image will not be displayed.',
      INCOMPLETE_UPLOAD: 'The chunked write did not finish. A partial image will not be displayed.',
      HASH_MISMATCH: 'The bytes do not match SHA-256. The image was blocked.',
      INVALID_ENTITY: 'This entity does not contain a valid image for this tool.',
      INVALID_MANIFEST: 'The manifest is invalid. The image will not be displayed.',
      INVALID_CHUNK: 'Some chunks are invalid. The image will not be displayed.'
    }; return map[error.code] ?? 'The operation could not be completed.';
  }
  const code = (error as { code?: number })?.code;
  if (code === 4001) return 'You rejected the wallet request. This operation was not confirmed.';
  const known: Record<string,string> = { NO_WALLET: 'Install or enable MetaMask or Rabby, then reload this page.', INVALID_RPC: 'Use a valid Tiramisu HTTPS URL. HTTP is accepted only on localhost.', CONNECT_FIRST: 'Connect a wallet before storing an image.', WRONG_CHAIN: 'Select Use Tiramisu to switch your wallet to Tiramisu.', WALLET_CHANGED: 'The account or network changed. Inspect confirmed transactions before trying again.', DECODE_FAILED: 'The browser could not decode the image. Choose a valid PNG/JPEG.', BYTES_DIFFER: 'The recovered image does not match the original file byte for byte.' };
  return known[(error as Error)?.message] ?? 'The operation did not complete. Check the RPC, testnet funds and any pending wallet requests.';
}
walletSelect.addEventListener('change', () => { connected = undefined; status('wallet-status','Connect the selected wallet.'); });
el('connect').addEventListener('click', async () => {
  if (busy) return; setBusy(true);
  try {
    const p = provider(), addresses = await p.request({ method:'eth_requestAccounts' });
    if (!addresses[0]) throw new Error('CONNECT_FIRST');
    connected = { provider:p,address:addresses[0] };
    status('wallet-status', `Account: ${addresses[0]}. ${Number(await p.request({ method:'eth_chainId' })) === tiramisu.id ? 'Connected to Tiramisu.' : 'Select Use Tiramisu.'}`);
  } catch(e) { status('wallet-status',message(e),'error'); } finally { setBusy(false); }
});
el('switch').addEventListener('click', async () => {
  if (busy) return; setBusy(true);
  try {
    const p = provider();
    try { await p.request({ method:'wallet_switchEthereumChain',params:[{chainId:`0x${tiramisu.id.toString(16)}`}] }); }
    catch (e) {
      if ((e as {code?:number}).code !== 4902) throw e;
      await p.request({ method:'wallet_addEthereumChain', params:[{chainId:`0x${tiramisu.id.toString(16)}`,chainName:tiramisu.name,nativeCurrency:tiramisu.nativeCurrency,rpcUrls:[tiramisu.rpcUrls.default.http[0]],...(explorer ? {blockExplorerUrls:[explorer]} : {})}] });
    }
    status('wallet-status','Tiramisu selected. Connect your account if you have not already.');
  } catch(e) { status('wallet-status',message(e),'error'); } finally { setBusy(false); }
});
function clearRecovered() {
  el('download-result').hidden = true; el<HTMLImageElement>('recovered').removeAttribute('src'); el('save').removeAttribute('href');
  if (recoveredUrl) URL.revokeObjectURL(recoveredUrl); recoveredUrl = undefined;
}
async function decode(bytes: Uint8Array, type: string) {
  try { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)],{type})); bitmap.close(); } catch { throw new Error('DECODE_FAILED'); }
}
el<HTMLInputElement>('file').addEventListener('change', async () => {
  const id = ++selectionId, file = el<HTMLInputElement>('file').files?.[0]; selected = undefined;
  el('original-figure').hidden = true; el<HTMLImageElement>('original').removeAttribute('src');
  if (originalUrl) URL.revokeObjectURL(originalUrl); originalUrl = undefined;
  if (!file) { status('file-info','Up to 25 MiB. Start small: larger files need more wallet confirmations.'); return; }
  status('file-info','Reading and checking the image…','loading');
  try {
    planImage(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer()), info = inspectImage(bytes), plan = planImage(bytes.length);
    await decode(bytes,info.contentType);
    if (id !== selectionId) return;
    selected = {bytes,filename:file.name};
    originalUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:info.contentType}));
    el<HTMLImageElement>('original').src = originalUrl; el('original-figure').hidden = false;
    status('file-info', `${file.name} · ${bytes.length.toLocaleString('en-US')} bytes · ${info.width} × ${info.height} pixels. ${plan.mode === 'inline' ? 'Fits in one entity.' : `${plan.chunkCount} chunks + manifest + image entity.`} ${plan.transactionCount} ${plan.transactionCount === 1 ? 'transaction' : 'transactions'} to store.`, 'success');
  } catch(e) { if (id === selectionId) status('file-info',message(e),'error'); }
});
el<HTMLFormElement>('upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (!selected) { status('upload-status','Choose a valid image and wait for its checks to finish.','error'); return; }
  if (!el<HTMLInputElement>('consent').checked) return;
  setBusy(true); stored = undefined; el('upload-result').hidden = true; clearRecovered(); status('read-status','Store an image or enter an image key to retrieve it.'); el<HTMLInputElement>('image-key').value = '';
  let cleanup: (() => void) | undefined;
  try {
    if (!connected || connected.provider !== provider()) throw new Error('CONNECT_FIRST');
    const {provider:p,address} = connected; let changed = false;
    const invalidate = () => { changed = true; connected = undefined; };
    p.on?.('accountsChanged',invalidate); p.on?.('chainChanged',invalidate);
    cleanup = () => { p.removeListener?.('accountsChanged',invalidate); p.removeListener?.('chainChanged',invalidate); };
    const guard = async () => {
      const [addresses,chain] = await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);
      if (Number(chain) !== tiramisu.id) throw new Error('WRONG_CHAIN');
      if (changed || addresses[0]?.toLowerCase() !== address.toLowerCase()) throw new Error('WALLET_CHANGED');
    };
    await guard();
    const guarded = { request: async (args: {method:string;params?:unknown}) => {
      if (['eth_sendTransaction','eth_signTransaction','eth_sendRawTransaction','wallet_sendCalls'].includes(args.method)) await guard();
      return (p.request as (args:{method:string;params?:unknown}) => Promise<unknown>)(args);
    }} as EIP1193Provider;
    const walletClient = createWalletClient({account:address,chain:tiramisu,transport:custom(guarded,{retryCount:0})});
    const original = selected;
    status('upload-status','Storing on Arkiv. Confirm the transactions in your wallet…','loading');
    const result = await storeImage({publicClient:publicClient(),walletClient,bytes:original.bytes,filename:original.filename,expirationBlocks:Number(el<HTMLInputElement>('expiration').value),onProgress: progress => status('upload-status',`Storing: ${progress.completed}/${progress.total} chunks. Confirm pending requests in your wallet…`,'loading')});
    stored = {key:result.imageKey,bytes:original.bytes,sha256:result.sha256};
    el<HTMLInputElement>('image-key').value = result.imageKey; el('uploaded-key').textContent = result.imageKey;
    el('upload-summary').textContent = `${result.byteLength.toLocaleString('en-US')} bytes stored. ${result.transactionHashes.length} ${result.transactionHashes.length === 1 ? 'transaction' : 'transactions'} confirmed.`;
    el('receipts').replaceChildren(...result.transactionHashes.map(hash => {const li=document.createElement('li');if(explorer){const link=document.createElement('a');link.textContent=hash;link.href=`${explorer}/tx/${hash}`;link.target='_blank';link.rel='noopener noreferrer';li.append(link);}else{li.textContent=hash;}return li;}));
    el('upload-result').hidden=false; status('upload-status','Image stored. Continue with Retrieve image.','success');
  } catch(e) {
    let detail = message(e);
    if (e instanceof ImageStorageError && e.manifestKey) detail += ` Recovery manifest: ${e.manifestKey}. Confirmed transactions: ${e.transactionHashes.join(', ')}. This is a file key, not an image key.`;
    status('upload-status',detail,'error');
  } finally { cleanup?.(); setBusy(false); }
});
el<HTMLFormElement>('read-form').addEventListener('submit', async event => {
  event.preventDefault(); if(busy)return; setBusy(true);clearRecovered();
  try {
    const imageKey=el<HTMLInputElement>('image-key').value.trim() as Hex, original=stored?.key.toLowerCase()===imageKey.toLowerCase()?stored:undefined;
    status('read-status','Querying the image and verifying its bytes…','loading');
    const result=await retrieveImage({publicClient:publicClient(),imageKey,expectedSha256:original?.sha256,onProgress:p=>status('read-status',`Retrieving chunks: ${p.completed}/${p.total}…`,'loading')});
    if(original && (original.bytes.length!==result.bytes.length || original.bytes.some((b,i)=>b!==result.bytes[i]))) throw new Error('BYTES_DIFFER');
    await decode(result.bytes,result.contentType);
    recoveredUrl=URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:result.contentType}));
    el<HTMLImageElement>('recovered').src=recoveredUrl;
    el<HTMLAnchorElement>('save').href=recoveredUrl; el<HTMLAnchorElement>('save').download=result.filename;
    el('hash').textContent=result.sha256;
    el('read-summary').textContent=`${result.filename} · ${result.byteLength.toLocaleString('en-US')} bytes · ${result.width} × ${result.height} pixels. Available at most until block ${result.expiresAt.toLocaleString('en-US')}.`;
    el('download-result').hidden=false;
    status('read-status',original?'Verified: matches your original byte for byte.':'Retrieved and verified.','success');
  }catch(e){status('read-status',message(e),'error');}finally{setBusy(false);}
});
window.addEventListener('pagehide',()=>{if(originalUrl)URL.revokeObjectURL(originalUrl);if(recoveredUrl)URL.revokeObjectURL(recoveredUrl);});
