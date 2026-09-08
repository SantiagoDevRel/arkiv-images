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
el('limits').textContent = `Hasta ${INLINE_MAX_BYTES.toLocaleString('es-CO')} bytes: una entity y una transacción. Por encima: chunking, hasta ${MAX_IMAGE_BYTES.toLocaleString('es-CO')} bytes (25 MiB) y ${MAX_IMAGE_PIXELS.toLocaleString('es-CO')} píxeles. El tamaño depende del archivo, no solo de sus dimensiones.`;
function status(id: string, message: string, state = 'idle') { el(id).textContent = message; el(id).dataset.state = state; }
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach(c => { c.disabled = value; });
  for (const id of ['upload-form','read-form']) el(id).setAttribute('aria-busy', String(value));
}
function refreshWallets() {
  const previous = walletSelect.value;
  walletSelect.replaceChildren(...[...wallets].map(([id,w]) => new Option(w.name,id)));
  if (!wallets.size) walletSelect.add(new Option('No se detectó una wallet',''));
  if (wallets.has(previous)) walletSelect.value = previous;
}
window.addEventListener('eip6963:announceProvider', ((event: CustomEvent) => {
  const { info, provider } = event.detail ?? {};
  if (info?.uuid && typeof info.name === 'string' && provider?.request) { wallets.set(info.uuid, { name: info.name, provider }); refreshWallets(); }
}) as EventListener);
window.dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(() => {
  const legacy = (window as Window & { ethereum?: EIP1193Provider & { isRabby?: boolean; isMetaMask?: boolean } }).ethereum;
  if (legacy && wallets.size === 0) wallets.set('injected', { name: legacy.isRabby ? 'Rabby' : legacy.isMetaMask ? 'MetaMask' : 'Wallet del navegador', provider: legacy });
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
      INVALID_IMAGE: 'La imagen no es un PNG/JPEG compatible, está dañada o excede el límite de píxeles.',
      TOO_LARGE: 'La imagen supera 25 MiB. Selecciona un archivo menor.',
      INVALID_INPUT: 'Revisa la clave, el nombre del archivo y los bloques de Entity Expiration.',
      NETWORK_MISMATCH: 'La wallet y el RPC deben usar Tiramisu. Usa el botón Usar Tiramisu.',
      NOT_FOUND: 'No se encontró la imagen. Revisa la clave y la red; la entity puede haber expirado.',
      UPLOAD_FAILED: 'La subida no terminó. Revisa la wallet y los comprobantes disponibles antes de intentarlo otra vez.',
      READ_FAILED: 'No se pudo consultar Arkiv. Revisa la conexión RPC, su access key y los límites del proveedor.',
      MISSING_CHUNK: 'Faltan fragmentos, posiblemente expirados. No se mostrará una imagen parcial.',
      INCOMPLETE_UPLOAD: 'El archivo fragmentado no terminó de guardarse. No se mostrará una imagen parcial.',
      HASH_MISMATCH: 'Los bytes no coinciden con SHA-256. Se bloqueó la imagen.',
      INVALID_ENTITY: 'La entity no contiene una imagen válida para esta herramienta.',
      INVALID_MANIFEST: 'El manifiesto no es válido. No se mostrará la imagen.',
      INVALID_CHUNK: 'Hay fragmentos inválidos. No se mostrará la imagen.'
    }; return map[error.code] ?? 'La operación no pudo completarse.';
  }
  const code = (error as { code?: number })?.code;
  if (code === 4001) return 'Rechazaste la solicitud en la wallet. No se confirmó esta operación.';
  const known: Record<string,string> = { NO_WALLET: 'Instala o habilita MetaMask o Rabby y recarga la página.', INVALID_RPC: 'Usa una URL HTTPS válida de Tiramisu. HTTP solo se acepta en localhost.', CONNECT_FIRST: 'Conecta una wallet antes de guardar.', WRONG_CHAIN: 'Selecciona Tiramisu en la wallet con el botón Usar Tiramisu.', WALLET_CHANGED: 'La cuenta o red cambió. Revisa las transacciones confirmadas antes de repetir.', DECODE_FAILED: 'El navegador no pudo decodificar la imagen. Elige un PNG/JPEG válido.', BYTES_DIFFER: 'La imagen recuperada no coincide byte por byte con el archivo original.' };
  return known[(error as Error)?.message] ?? 'No se completó la operación. Revisa el RPC, los fondos de testnet y cualquier solicitud pendiente en la wallet.';
}
walletSelect.addEventListener('change', () => { connected = undefined; status('wallet-status','Conecta la wallet seleccionada.'); });
el('connect').addEventListener('click', async () => {
  if (busy) return; setBusy(true);
  try {
    const p = provider(), addresses = await p.request({ method:'eth_requestAccounts' });
    if (!addresses[0]) throw new Error('CONNECT_FIRST');
    connected = { provider:p,address:addresses[0] };
    status('wallet-status', `Cuenta: ${addresses[0]}. ${Number(await p.request({ method:'eth_chainId' })) === tiramisu.id ? 'Tiramisu conectada.' : 'Selecciona Usar Tiramisu.'}`);
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
    status('wallet-status','Tiramisu seleccionada. Conecta tu cuenta si aún no lo has hecho.');
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
  if (!file) { status('file-info','Selecciona una imagen para ver su tamaño.'); return; }
  status('file-info','Leyendo y comprobando la imagen…','loading');
  try {
    planImage(file.size);
    const bytes = new Uint8Array(await file.arrayBuffer()), info = inspectImage(bytes), plan = planImage(bytes.length);
    await decode(bytes,info.contentType);
    if (id !== selectionId) return;
    selected = {bytes,filename:file.name};
    originalUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:info.contentType}));
    el<HTMLImageElement>('original').src = originalUrl; el('original-figure').hidden = false;
    status('file-info', `${file.name} · ${bytes.length.toLocaleString('es-CO')} bytes · ${info.width} × ${info.height} píxeles. ${plan.mode === 'inline' ? 'Cabe en una entity.' : `${plan.chunkCount} fragmentos + manifiesto + entity de imagen.`} ${plan.transactionCount} ${plan.transactionCount === 1 ? 'transacción' : 'transacciones'} para guardar.`, 'success');
  } catch(e) { if (id === selectionId) status('file-info',message(e),'error'); }
});
el<HTMLFormElement>('upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  if (!selected) { status('upload-status','Selecciona una imagen válida y espera a que termine su comprobación.','error'); return; }
  if (!el<HTMLInputElement>('consent').checked) return;
  setBusy(true); stored = undefined; el('upload-result').hidden = true; clearRecovered(); status('read-status','Guarda una imagen o introduce una clave para recuperarla.'); el<HTMLInputElement>('image-key').value = '';
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
    status('upload-status','Guardando en Arkiv. Confirma las transacciones en tu wallet…','loading');
    const result = await storeImage({publicClient:publicClient(),walletClient,bytes:original.bytes,filename:original.filename,expirationBlocks:Number(el<HTMLInputElement>('expiration').value),onProgress: progress => status('upload-status',`Guardando: ${progress.completed}/${progress.total} fragmentos. Confirma las solicitudes pendientes en tu wallet…`,'loading')});
    stored = {key:result.imageKey,bytes:original.bytes,sha256:result.sha256};
    el<HTMLInputElement>('image-key').value = result.imageKey; el('uploaded-key').textContent = result.imageKey;
    el('upload-summary').textContent = `${result.byteLength.toLocaleString('es-CO')} bytes guardados. ${result.transactionHashes.length} transacciones confirmadas. Recupera la imagen para verificarla.`;
    el('receipts').replaceChildren(...result.transactionHashes.map(hash => {const li=document.createElement('li');if(explorer){const link=document.createElement('a');link.textContent=hash;link.href=`${explorer}/tx/${hash}`;link.target='_blank';link.rel='noopener noreferrer';li.append(link);}else{li.textContent=hash;}return li;}));
    el('upload-result').hidden=false; status('upload-status','Imagen guardada. Continúa con Recuperar imagen.','success');
  } catch(e) {
    let detail = message(e);
    if (e instanceof ImageStorageError && e.manifestKey) detail += ` Manifiesto de recuperación: ${e.manifestKey}. Transacciones confirmadas: ${e.transactionHashes.join(', ')}. Esta clave es de archivo, no de imagen.`;
    status('upload-status',detail,'error');
  } finally { cleanup?.(); setBusy(false); }
});
el<HTMLFormElement>('read-form').addEventListener('submit', async event => {
  event.preventDefault(); if(busy)return; setBusy(true);clearRecovered();
  try {
    const imageKey=el<HTMLInputElement>('image-key').value.trim() as Hex, original=stored?.key.toLowerCase()===imageKey.toLowerCase()?stored:undefined;
    status('read-status','Consultando la imagen y verificando sus bytes…','loading');
    const result=await retrieveImage({publicClient:publicClient(),imageKey,expectedSha256:original?.sha256,onProgress:p=>status('read-status',`Recuperando fragmentos: ${p.completed}/${p.total}…`,'loading')});
    if(original && (original.bytes.length!==result.bytes.length || original.bytes.some((b,i)=>b!==result.bytes[i]))) throw new Error('BYTES_DIFFER');
    await decode(result.bytes,result.contentType);
    recoveredUrl=URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:result.contentType}));
    el<HTMLImageElement>('recovered').src=recoveredUrl;
    el<HTMLAnchorElement>('save').href=recoveredUrl; el<HTMLAnchorElement>('save').download=result.filename;
    el('hash').textContent=result.sha256;
    el('read-summary').textContent=`${result.filename} · ${result.byteLength.toLocaleString('es-CO')} bytes · ${result.width} × ${result.height} píxeles. Disponible como máximo hasta el bloque ${result.expiresAt.toLocaleString('es-CO')}.`;
    el('download-result').hidden=false;
    status('read-status',original?'Verificada: la imagen recuperada coincide byte por byte con tu archivo original.':'Verificada: SHA-256 coincide con la entity. Esto verifica integridad, no la identidad del autor.','success');
  }catch(e){status('read-status',message(e),'error');}finally{setBusy(false);}
});
window.addEventListener('pagehide',()=>{if(originalUrl)URL.revokeObjectURL(originalUrl);if(recoveredUrl)URL.revokeObjectURL(recoveredUrl);});
