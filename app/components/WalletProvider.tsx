'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Address, WalletClient } from 'viem';
import { connect as connectWallet, friendlyError } from '@/lib/wallet';

type WalletState = {
  wallet: WalletClient | null;
  account: Address | null;
  error: string | null;
  connecting: boolean;
  connect: () => Promise<{ wallet: WalletClient; account: Address } | null>;
  disconnect: () => void;
};

const Ctx = createContext<WalletState | null>(null);

/** One wallet for the whole site: the top bar connects it, the app uses it. */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const c = await connectWallet();
      setWallet(c.wallet);
      setAccount(c.account);
      return c;
    } catch (e) {
      setError(friendlyError(e));
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAccount(null);
  }, []);

  // Follow the wallet: a new account reconnects; a new network reloads the
  // page, so nothing is sent on the wrong chain.
  useEffect(() => {
    const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
    if (!eth?.on || !wallet) return;
    const onAccounts = (a: unknown) => {
      if (!(a as Address[])[0]) return disconnect();
      connect();
    };
    const onChain = () => window.location.reload();
    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [wallet, connect, disconnect]);

  return <Ctx.Provider value={{ wallet, account, error, connecting, connect, disconnect }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet outside WalletProvider');
  return v;
}

/** The top bar's wallet button. */
export function ConnectButton() {
  const { account, connect, disconnect, connecting, error } = useWallet();
  if (account) {
    return (
      <button className="wallet on" onClick={disconnect} title="Disconnect">
        <span className="wallet-dot" />
        {account.slice(0, 6)}…{account.slice(-4)}
      </button>
    );
  }
  return (
    <button className="wallet" onClick={() => connect()} disabled={connecting} title={error ?? undefined}>
      {connecting ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}
