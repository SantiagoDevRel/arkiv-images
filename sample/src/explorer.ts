/** Verified Tiramisu indexer routes. SDK 0.8.0 has no blockExplorers entry. */
export const EXPLORER_URL = 'https://indexer.tiramisu.db-chain.testnet.arkiv.network';

export function entityUrl(key: string): string {
  if (!/^0x[\da-f]{64}$/i.test(key)) throw new Error('Invalid entity key');
  return `${EXPLORER_URL}/entity/${key}`;
}

export function transactionUrl(hash: string): string {
  if (!/^0x[\da-f]{64}$/i.test(hash)) throw new Error('Invalid transaction hash');
  return `${EXPLORER_URL}/tx/${hash}`;
}
