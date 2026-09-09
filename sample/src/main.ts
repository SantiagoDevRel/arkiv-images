import { createPublicClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { http, type EIP1193Provider, type Hex } from 'viem';
import { inspectImage, planImage, storeImage, retrieveImage, ImageStorageError, ChunkingError, VERSION } from 'arkiv-images';
import { connectWallet, guardWallet, guardedWalletClient } from './wallet';
import { dateToBlocks, estimateExpirationDate, toLocalDateTimeInput, ExpirationInputError } from './expiration';
import { inspectImageEntities } from './inspection';
import { renderInspection } from './inspector-view';
import { entityUrl, transactionUrl } from './explorer';
import './style.css';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing interface element: ${id}`);
  return element as T;
};
const client = createPublicClient({ chain: tiramisu, transport: http(tiramisu.rpcUrls.default.http[0], { retryCount: 0, timeout: 30000, fetchOptions: { cache: 'no-store' } }) });
const wallets = new Map<string, { name: string; provider: EIP1193Provider }>();
const walletSelect = el<HTMLSelectElement>('wallet');
let connected: { provider: EIP1193Provider; address: Hex } | undefined;
let detachWallet: (() => void) | undefined;
let busy = false, selectionId = 0, originalUrl: string | undefined, recoveredUrl: string | undefined;
let selected: { bytes: Uint8Array; filename: string } | undefined;
let stored: { key: Hex; bytes: Uint8Array; sha256: Hex } | undefined;
function syncTheme() {
  const label = document.documentElement.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  el('theme-toggle').setAttribute('aria-label', label); el('theme-toggle').title = label;
}
el('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('arkiv-images-theme', theme); } catch { /* The toggle also works without storage. */ }
  syncTheme();
});
syncTheme();
el('version').textContent = `v${VERSION}`;
el<HTMLInputElement>('expiration').value = toLocalDateTimeInput(new Date(Date.now() + 86400000));
el('expiration-help').textContent = `Approximate date \u00b7 ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
el('pick-file').addEventListener('click', () => el<HTMLInputElement>('file').click());
function status(id: string, message: string, state = 'idle') { el(id).textContent = message; el(id).dataset.state = state; }
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button:not(#theme-toggle), select').forEach(c => { c.disabled = value; });
  el('workspace').setAttribute('aria-busy', String(value));
}
function mode(value: 'store' | 'retrieve') {
  el('upload-form').hidden = value !== 'store'; el('read-form').hidden = value !== 'retrieve';
  for (const tab of ['store', 'retrieve']) {
    const button = el<HTMLButtonElement>(`${tab}-tab`);
    button.setAttribute('aria-selected', String(tab === value));
    button.tabIndex = tab === value ? 0 : -1;
  }
}
for (const value of ['store', 'retrieve'] as const) {
  el(`${value}-tab`).addEventListener('click', () => mode(value));
  el(`${value}-tab`).addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); const other = value === 'store' ? 'retrieve' : 'store'; mode(other); el(`${other}-tab`).focus();
    }
  });
}
function refreshWallets() {
  const previous = walletSelect.value;
  walletSelect.replaceChildren(...[...wallets].map(([id,w]) => new Option(w.name,id)));
  if (!wallets.size) walletSelect.add(new Option('No wallet detected',''));
  if (wallets.has(previous)) walletSelect.value = previous;
  walletSelect.hidden = wallets.size < 2;
}
window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
  const { info, provider } = event.detail ?? {};
  if (info?.uuid && typeof info.name === 'string' && provider?.request) { wallets.set(info.uuid, { name: info.name, provider }); refreshWallets(); }
}) as EventListener);
window.dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(() => {
  const legacy = (window as Window & { ethereum?: EIP1193Provider & { isRabby?: boolean; isMetaMask?: boolean } }).ethereum;
  if (legacy && !wallets.size) wallets.set('injected', { name: legacy.isRabby ? 'Rabby' : legacy.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: legacy });
  refreshWallets();
}, 150);
function provider() { const p = wallets.get(walletSelect.value)?.provider; if (!p) throw new Error('NO_WALLET'); return p; }
function message(error: unknown): string {
  if (error instanceof ExpirationInputError) return error.message;
  if (error instanceof ImageStorageError || error instanceof ChunkingError) {
    const map: Record<string,string> = {
      INVALID_IMAGE: 'The image is not a supported PNG/JPEG, is damaged, or exceeds the pixel limit.',
      TOO_LARGE: 'The image exceeds 25 MiB. Choose a smaller file.',
      INVALID_INPUT: 'Check the image key, filename and expiration date.',
      NETWORK_MISMATCH: 'Reconnect your wallet to continue on Tiramisu.',
      NOT_FOUND: 'Image not found. Check the key and network; the entity may have expired.',
      UPLOAD_FAILED: 'Storing did not complete. Inspect your wallet and available receipts before trying again.',
      READ_FAILED: 'Could not reach Arkiv. Check your connection and try retrieving again.',
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
  const known: Record<string,string> = { NO_WALLET: 'Install or enable MetaMask or Rabby, then reload this page.', INVALID_RPC: 'Use a valid Tiramisu HTTPS URL. HTTP is accepted only on localhost.', CONNECT_FIRST: 'Connect a wallet before storing an image.', WRONG_CHAIN: 'Your wallet changed networks. Reconnect before storing.', WALLET_CHANGED: 'The account or network changed. Inspect confirmed transactions before trying again.', DECODE_FAILED: 'The browser could not decode the image. Choose a valid PNG/JPEG.', BYTES_DIFFER: 'The recovered image does not match the original file byte for byte.' };
  return known[(error as Error)?.message] ?? 'The operation did not complete. Check your connection, testnet funds and pending wallet requests.';
}

function disconnect(message = '') {
  detachWallet?.(); detachWallet = undefined; connected = undefined;
  el('connect').textContent = 'Connect wallet'; el('connect').removeAttribute('title');
  status('wallet-status', message, message ? 'error' : 'idle'); setBusy(busy);
}
walletSelect.addEventListener('change', () => disconnect());
el('connect').addEventListener('click', async () => {
  if (busy) return; disconnect(); setBusy(true); status('wallet-status','Confirm the connection in your wallet.','loading');
  try {
    const p = provider(), address = await connectWallet(p);
    connected = { provider:p, address };
    const invalidated = () => disconnect('Wallet changed. Reconnect to store.');
    p.on?.('accountsChanged', invalidated); p.on?.('chainChanged', invalidated);
    detachWallet = () => { p.removeListener?.('accountsChanged', invalidated); p.removeListener?.('chainChanged', invalidated); };
    el('connect').textContent = `${address.slice(0,6)}\u2026${address.slice(-4)}`; el('connect').title = address;
    status('wallet-status','');
  } catch(error) { status('wallet-status',message(error),'error'); } finally { setBusy(false); }
});
function clearRecovered() {
  el('download-result').hidden = true; el('result-empty').hidden = false;
  el<HTMLImageElement>('recovered').removeAttribute('src'); el('save').removeAttribute('href');
  el('inspection').replaceChildren(); el('inspection').hidden = true; status('inspection-status','');
  el('view-entity').removeAttribute('href'); el('entity-links').hidden = true; el('entity-link-list').replaceChildren();
  if (recoveredUrl) URL.revokeObjectURL(recoveredUrl); recoveredUrl = undefined;
}
async function decode(bytes: Uint8Array, type: string) {
  try { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)],{type})); bitmap.close(); } catch { throw new Error('DECODE_FAILED'); }
}
el<HTMLInputElement>('file').addEventListener('change', async () => {
  const id = ++selectionId, file = el<HTMLInputElement>('file').files?.[0]; selected = undefined;
  el('original-figure').hidden = true; el<HTMLImageElement>('original').removeAttribute('src');
  el('pick-empty').hidden = false;
  if (originalUrl) URL.revokeObjectURL(originalUrl); originalUrl = undefined;
  clearRecovered(); stored = undefined; el('upload-result').hidden = true;
  status('upload-status',''); status('read-status',''); el('result-state').textContent = 'Ready';
  el('approval-note').textContent = ''; setBusy(true);
  if (!file) { status('file-info','PNG or JPEG \u00b7 Up to 25 MiB'); setBusy(false); return; }
  status('file-info','Checking image\u2026','loading');
  try {
    planImage(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer()), info = inspectImage(bytes), plan = planImage(bytes.length);
    await decode(bytes,info.contentType);
    if (id !== selectionId) return;
    selected = {bytes,filename:file.name};
    originalUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:info.contentType}));
    el<HTMLImageElement>('original').src = originalUrl; el('original-figure').hidden = false;
    el('pick-empty').hidden = true;
    status('file-info',`${file.name} \u00b7 ${bytes.length.toLocaleString('en-US')} bytes \u00b7 ${info.width} \u00d7 ${info.height}`,'success');
    el('approval-note').textContent = `${plan.entityCount} ${plan.entityCount===1?'entity':'entities'} \u00b7 ${plan.transactionCount} wallet ${plan.transactionCount===1?'confirmation':'confirmations'}`;
  } catch(error) { if (id === selectionId) status('file-info',message(error),'error'); }
  finally { if (id === selectionId) setBusy(false); }
});
async function readImage(imageKey: Hex) {
  clearRecovered(); status('read-status','Retrieving and checking image bytes\u2026','loading'); el('result-state').textContent = 'Retrieving';
  el('result-empty').hidden = true;
  try {
    const original = stored?.key.toLowerCase()===imageKey.toLowerCase()?stored:undefined;
    const result = await retrieveImage({publicClient:client,imageKey,expectedSha256:original?.sha256,onProgress:p=>status('read-status',`Retrieving chunks: ${p.completed}/${p.total}\u2026`,'loading')});
    if (original && (original.bytes.length !== result.bytes.length || original.bytes.some((b,i)=>b!==result.bytes[i]))) throw new Error('BYTES_DIFFER');
    await decode(result.bytes,result.contentType);
    recoveredUrl = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:result.contentType}));
    el<HTMLImageElement>('recovered').src = recoveredUrl;
    el<HTMLAnchorElement>('save').href = recoveredUrl; el<HTMLAnchorElement>('save').download = result.filename;
    el<HTMLAnchorElement>('view-entity').href = entityUrl(imageKey);
    el('hash').textContent = result.sha256;
    el('read-summary').textContent = `${result.filename} \u00b7 ${result.byteLength.toLocaleString('en-US')} bytes \u00b7 ${result.width} \u00d7 ${result.height}`;
    el('result-expiration').textContent = 'Expiration estimate unavailable';
    el('result-empty').hidden = true; el('download-result').hidden = false; el('result-state').textContent = 'Verified';
    status('read-status', original ? 'Matches your original byte for byte.' : 'Image bytes verified.','success');
    try {
      const date = estimateExpirationDate(result.expiresAt, await client.getBlockTiming());
      el('result-expiration').textContent = `Available until approximately ${date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}`;
    } catch { /* A missing timing estimate must not hide a verified image. */ }
    status('inspection-status','Reading entity details\u2026','loading');
    try {
      const inspection = await inspectImageEntities(client,imageKey,result);
      renderInspection(el('inspection'),inspection); el('inspection').hidden = false; status('inspection-status','');
      if (inspection.manifest) {
        const entries = [
          { entity: inspection.root, label: 'Image entity' },
          { entity: inspection.manifest, label: 'Manifest' },
          ...inspection.chunks.map(chunk => ({ entity: chunk, label: `Chunk ${chunk.seq + 1}` })),
        ];
        el('entity-link-list').replaceChildren(...entries.map(({entity,label}) => {
          const li = document.createElement('li'), link = document.createElement('a');
          link.href = entityUrl(entity.key); link.textContent = `${label} \u2197`; link.title = entity.key;
          link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link); return li;
        }));
        el('entity-links').hidden = false;
      }
    } catch {
      status('inspection-status','Image verified, but entity details could not be verified. Retrieve again to retry.','error');
    }
  } catch(error) { el('result-empty').hidden = false; el('result-state').textContent = 'Could not retrieve'; status('read-status',message(error),'error'); }
}
el<HTMLFormElement>('upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (!connected) { status('upload-status','Connect your wallet above to store this image.','error'); el('connect').focus(); return; }
  if (!selected) { status('upload-status','Choose a valid image first.','error'); return; }
  const original = selected, session = connected;
  setBusy(true); stored = undefined; el('upload-result').hidden = true; clearRecovered(); status('read-status','');
  let key: Hex | undefined;
  try {
    if (session.provider !== provider()) throw new Error('CONNECT_FIRST');
    await guardWallet(session.provider,session.address,connected !== session);
    const expirationBlocks = dateToBlocks(new Date(el<HTMLInputElement>('expiration').value),await client.getBlockTiming(),planImage(original.bytes.length).transactionCount);
    el('result-state').textContent = 'Storing'; status('upload-status','Confirm the transactions in your wallet\u2026','loading');
    const result = await storeImage({publicClient:client,walletClient:guardedWalletClient(session.provider,session.address,()=>connected !== session),bytes:original.bytes,filename:original.filename,expirationBlocks,onProgress:p=>status('upload-status',`Storing: ${p.completed}/${p.total} chunks. Check your wallet\u2026`,'loading')});
    stored = {key:result.imageKey,bytes:original.bytes,sha256:result.sha256}; key = result.imageKey;
    el<HTMLInputElement>('image-key').value = key; el('uploaded-key').textContent = key;
    el('receipts').replaceChildren(...result.transactionHashes.map(hash => {
      const li = document.createElement('li');
      try {
        const link = document.createElement('a'); link.href = transactionUrl(hash); link.textContent = hash;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link);
      } catch { li.textContent = hash; }
      return li;
    }));
    el('upload-result').hidden = false; status('upload-status','Stored.','success');
  } catch(error) {
    let detail = message(error);
    if(error instanceof ImageStorageError && error.manifestKey) detail += ` Recovery manifest: ${error.manifestKey}. Confirmed transactions: ${error.transactionHashes.join(', ')}. This is a file key, not an image key.`;
    el('result-state').textContent = 'Could not store'; status('upload-status',detail,'error');
  }
  try { if(key) await readImage(key); } finally { setBusy(false); }
});
el<HTMLFormElement>('read-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(busy)return; setBusy(true); status('upload-status','');
  el('upload-result').hidden = true;
  try { await readImage(el<HTMLInputElement>('image-key').value.trim() as Hex); } finally { setBusy(false); }
});
window.addEventListener('pagehide',()=>{detachWallet?.();if(originalUrl)URL.revokeObjectURL(originalUrl);if(recoveredUrl)URL.revokeObjectURL(recoveredUrl);});
mode('store'); setBusy(false);
