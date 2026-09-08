import { createWalletClient } from '@arkiv-network/sdk';
import { tiramisu } from '@arkiv-network/sdk/chains';
import { custom, type EIP1193Provider, type Hex } from 'viem';

/** Connect includes network setup; a successful result is always on Tiramisu. */
export async function connectWallet(provider: EIP1193Provider): Promise<Hex> {
  const addresses = await provider.request({ method: 'eth_requestAccounts' });
  const address = addresses[0];
  if (!address) throw new Error('CONNECT_FIRST');
  if (Number(await provider.request({ method: 'eth_chainId' })) !== tiramisu.id) {
    const chainId = `0x${tiramisu.id.toString(16)}`;
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
    catch (error) {
      if ((error as { code?: number }).code !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId, chainName: tiramisu.name, nativeCurrency: tiramisu.nativeCurrency,
        rpcUrls: [tiramisu.rpcUrls.default.http[0]],
        ...(tiramisu.blockExplorers?.default.url ? { blockExplorerUrls: [tiramisu.blockExplorers.default.url] } : {}),
      }] });
      // Adding a network does not guarantee that every wallet selects it.
      if (Number(await provider.request({ method: 'eth_chainId' })) !== tiramisu.id)
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    }
  }
  await guardWallet(provider, address);
  return address;
}

export async function guardWallet(provider: EIP1193Provider, address: Hex, invalidated = false): Promise<void> {
  const [addresses, chainId] = await Promise.all([
    provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' }),
  ]);
  if (Number(chainId) !== tiramisu.id) throw new Error('WRONG_CHAIN');
  if (invalidated || addresses[0]?.toLowerCase() !== address.toLowerCase()) throw new Error('WALLET_CHANGED');
}

/** Never switches networks or retries a signature halfway through a write. */
export function guardedWalletClient(provider: EIP1193Provider, address: Hex, invalidated: () => boolean) {
  const guarded = { request: async (args: { method: string; params?: unknown }) => {
    if (['eth_sendTransaction', 'eth_signTransaction', 'eth_sendRawTransaction', 'wallet_sendCalls'].includes(args.method))
      await guardWallet(provider, address, invalidated());
    return (provider.request as (args: { method: string; params?: unknown }) => Promise<unknown>)(args);
  }} as EIP1193Provider;
  return createWalletClient({ account: address, chain: tiramisu, transport: custom(guarded, { retryCount: 0 }) });
}
