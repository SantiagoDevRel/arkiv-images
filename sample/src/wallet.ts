import { createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { custom, type EIP1193Provider, type Hex } from 'viem';

/**
 * The only RPC URL this sample offers to a wallet: Rabdi's keyless public endpoint.
 * Access keys stay server-side (`/api/rpc`); they never go into a wallet, the bundle, a URL or a QR.
 */
export const RABDI_PUBLIC_RPC = 'https://rpc.rabdi.db-chain.testnet.arkiv.network';
export const RABDI_EXPLORER = 'https://rabdi.explorer.arkiv.network';
// Chain metadata only: reads use /api/rpc and every wallet request goes through the injected provider.
const chain = { ...rabdi({ accessKey: '' }), rpcUrls: { default: { http: [RABDI_PUBLIC_RPC] } } };
const chainId = `0x${chain.id.toString(16)}`;

/** Parameters for `wallet_addEthereumChain`: Rabdi with only the keyless public RPC. */
export function rabdiAddChainParams() {
  return { chainId, chainName: 'Rabdi', nativeCurrency: { name: 'Golem', symbol: 'tGLM', decimals: 18 }, rpcUrls: [RABDI_PUBLIC_RPC], blockExplorerUrls: [RABDI_EXPLORER] };
}

/** Switches the wallet to Rabdi on a user action; a wallet without Rabdi (4902) is offered only the keyless RPC. */
export async function connectWallet(provider: EIP1193Provider): Promise<Hex> {
  const addresses = await provider.request({ method: 'eth_requestAccounts' });
  const address = addresses[0];
  if (!address) throw new Error('CONNECT_FIRST');
  if (Number(await provider.request({ method: 'eth_chainId' })) !== chain.id) {
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
    catch (error) {
      // 4902 = unknown chain; MetaMask Mobile wraps it as -32603 with data.originalError.code 4902.
      const failure = error as { code?: number; data?: { originalError?: { code?: number } } };
      if (failure.code !== 4902 && failure.data?.originalError?.code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [rabdiAddChainParams()] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    }
  }
  // Confirms 0x76edaf and the same account before the connection counts; every send rechecks both.
  await guardWallet(provider, address);
  return address;
}

export async function guardWallet(provider: EIP1193Provider, address: Hex, invalidated = false): Promise<void> {
  const [addresses, chainId] = await Promise.all([
    provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' }),
  ]);
  if (Number(chainId) !== chain.id) throw new Error('WRONG_CHAIN');
  if (invalidated || addresses[0]?.toLowerCase() !== address.toLowerCase()) throw new Error('WALLET_CHANGED');
}

/** Never switches networks or retries a signature halfway through a write. */
export function guardedWalletClient(provider: EIP1193Provider, address: Hex, invalidated: () => boolean) {
  const guarded = { request: async (args: { method: string; params?: unknown }) => {
    if (['eth_sendTransaction', 'eth_signTransaction', 'eth_sendRawTransaction', 'wallet_sendCalls'].includes(args.method))
      await guardWallet(provider, address, invalidated());
    return (provider.request as (args: { method: string; params?: unknown }) => Promise<unknown>)(args);
  }} as EIP1193Provider;
  return createWalletClient({ account: address, chain, transport: custom(guarded, { retryCount: 0 }) });
}
