'use client';

import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { NETWORKS, type Network, type NetKey } from './networks';

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

/** Connects the browser wallet and puts it on the chosen Mezo network,
 *  adding the network to the wallet first if it doesn't know it. */
export async function connect(net: Network = NETWORKS.testnet): Promise<{ wallet: WalletClient; account: Address }> {
  if (!window.ethereum) throw new Error(`No browser wallet found. Install one${net.hasDemo ? ', or use the no-wallet demo' : ''}.`);
  const [account] = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as Address[];
  await switchTo(net);
  const wallet = createWalletClient({ account, chain: net.chain, transport: custom(window.ethereum) });
  return { wallet, account };
}

/** Switches the wallet to a Mezo network, adding it when the wallet doesn't know it. */
export async function switchTo(net: Network): Promise<void> {
  if (!window.ethereum) throw new Error('No browser wallet found.');
  const hex = `0x${net.chain.id.toString(16)}`;
  const add = {
    chainId: hex,
    chainName: net.chain.name,
    nativeCurrency: net.chain.nativeCurrency,
    rpcUrls: net.walletRpcs,
    blockExplorerUrls: [net.explorer],
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
}

type WalletError = { code?: number; message?: string; data?: { originalError?: { code?: number } }; cause?: { code?: number } };

function unknownChain(e: unknown) {
  const w = e as WalletError;
  if (w?.code === 4902 || w?.data?.originalError?.code === 4902 || w?.cause?.code === 4902) return true;
  return /unrecognized chain|unknown chain|not been added|not added|add(ing)? the chain|4902/i.test(w?.message ?? '');
}

/** Turns wallet and node errors into one plain sentence for the screen. */
export function friendlyError(e: unknown, key: NetKey = 'testnet'): string {
  const net = NETWORKS[key];
  const w = e as WalletError;
  const msg = (w?.message ?? String(e)).split('\n')[0];
  if (w?.code === 4001 || /user (rejected|denied)|rejected the request|cancel/i.test(msg)) return 'You cancelled in your wallet. Nothing was sent.';
  if (unknownChain(e))
    return `Your wallet could not switch to Mezo ${key}. Add it in your wallet (chain ${net.chain.id}, RPC ${net.walletRpcs[0].replace('https://', '')}) and try again.`;
  if (/LendCapExceeded|0xc375827a|lend cap/i.test(raw(e)))
    return `Keel has reached its lending cap for now: at most ${net.lendShare} of savings is ever lent. Borrow less, or try again after a loan is repaid.`;
  if (/InsufficientLiquidity|0xa17e11d5/i.test(raw(e))) return 'Keel has less free MUSD than that right now. Try a smaller amount, or try again after a repayment.';
  if (/BelowLiquidityBuffer|0xa76fc46c/i.test(raw(e))) return 'Keel keeps a slice of savings free for withdrawals, and this loan would dip into it. Borrow less, or try after a repayment.';
  if (/PrincipalCapReached|0xbec55d89/i.test(raw(e))) return 'Keel’s mainnet vault is full: it holds at most 2,000 MUSD of savings for now. Try a smaller amount.';
  if (/NotAllowed|0x3d693ada/i.test(raw(e))) return 'Only the borrower can claim for this loan until they turn on auto pay.';
  if (/does not exist|is not available|method not found/i.test(msg))
    return `Your wallet’s Mezo ${key} connection dropped the request. In your wallet’s network settings, set the Mezo ${net.label} RPC to ${net.walletRpcs[0]} and try again.`;
  if (/insufficient funds|exceeds balance/i.test(msg))
    return net.faucet ? 'This wallet needs testnet BTC to pay gas. Get some free at faucet.test.mezo.org.' : 'This wallet needs a little BTC on Mezo to pay gas. Bring some over through Mezo’s bridge.';
  if (/No browser wallet/i.test(msg)) return msg;
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

/** Every message a viem error carries, so contract error names nested in it are found. */
function raw(e: unknown): string {
  const parts: string[] = [];
  let x = e as { message?: string; shortMessage?: string; details?: string; metaMessages?: string[]; cause?: unknown } | undefined;
  for (let i = 0; x && i < 6; i++) {
    parts.push(x.shortMessage ?? '', x.message ?? '', x.details ?? '', ...(x.metaMessages ?? []));
    x = x.cause as typeof x;
  }
  return parts.join(' ');
}
