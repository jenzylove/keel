'use client';

import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { mezoTestnet } from './chains';

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

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
  } catch {
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
