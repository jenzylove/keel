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
  const add = {
    chainId: hex,
    chainName: mezoTestnet.name,
    nativeCurrency: mezoTestnet.nativeCurrency,
    // Mezo's own RPC first: wallets use the first one, and dRPC drops some calls.
    rpcUrls: ['https://rpc.test.mezo.org', 'https://mezo-testnet.drpc.org'],
    blockExplorerUrls: [mezoTestnet.blockExplorers.default.url],
  };
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    // Wallets report "I don't know this network" in different ways: 4902,
    // a wrapped 4902, or only a message. Add it in every such case; a user
    // declining (4001) is passed on rather than retried.
    if (!unknownChain(e)) throw e;
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [add] });
    // Some wallets add the network without switching to it.
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }).catch(() => {});
  }
  const wallet = createWalletClient({ account, chain: mezoTestnet, transport: custom(window.ethereum) });
  return { wallet, account };
}

type WalletError = { code?: number; message?: string; data?: { originalError?: { code?: number } }; cause?: { code?: number } };

function unknownChain(e: unknown) {
  const w = e as WalletError;
  if (w?.code === 4902 || w?.data?.originalError?.code === 4902 || w?.cause?.code === 4902) return true;
  return /unrecognized chain|unknown chain|not been added|not added|add(ing)? the chain|4902/i.test(w?.message ?? '');
}

/** Turns wallet and node errors into one plain sentence for the screen. */
export function friendlyError(e: unknown): string {
  const w = e as WalletError;
  const msg = (w?.message ?? String(e)).split('\n')[0];
  if (w?.code === 4001 || /user (rejected|denied)|rejected the request|cancel/i.test(msg)) return 'You cancelled in your wallet. Nothing was sent.';
  if (unknownChain(e)) return 'Your wallet could not switch to Mezo testnet. Add it in your wallet (chain 31611, RPC rpc.test.mezo.org) and try again.';
  if (/does not exist|is not available|method not found/i.test(msg))
    return 'Your wallet’s Mezo testnet connection dropped the request. In your wallet’s network settings, set the Mezo Testnet RPC to https://rpc.test.mezo.org and try again.';
  if (/insufficient funds|exceeds balance/i.test(msg)) return 'This wallet needs testnet BTC to pay gas. Get some free at faucet.test.mezo.org.';
  if (/No browser wallet/i.test(msg)) return msg;
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}
