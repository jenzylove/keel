'use client';

import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { mezoTestnet } from './chains';

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, f: (arg: unknown) => void) => void;
  removeListener?: (event: string, f: (arg: unknown) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export async function connect(): Promise<{ wallet: WalletClient; account: Address }> {
  if (!window.ethereum) throw new Error('No browser wallet found. Install one, or use the no-wallet demo.');
  const [account] = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as Address[];
  const hex = `0x${mezoTestnet.id.toString(16)}`;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    // 4902: the wallet doesn't know Mezo testnet yet. Anything else, such as
    // the user declining (4001), is passed on rather than retried.
    if ((e as { code?: number }).code !== 4902) throw e;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hex,
          chainName: mezoTestnet.name,
          nativeCurrency: mezoTestnet.nativeCurrency,
          rpcUrls: mezoTestnet.rpcUrls.default.http,
          blockExplorerUrls: [mezoTestnet.blockExplorers.default.url],
        },
      ],
    });
  }
  const wallet = createWalletClient({ account, chain: mezoTestnet, transport: custom(window.ethereum) });
  return { wallet, account };
}
