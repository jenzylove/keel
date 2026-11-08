'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Address, WalletClient } from 'viem';
import { connect as connectWallet, friendlyError } from '@/lib/wallet';
import { DEFAULT_NET, NETWORKS, isNetKey, type NetKey, type Network } from '@/lib/networks';

type WalletState = {
  wallet: WalletClient | null;
  account: Address | null;
  error: string | null;
  connecting: boolean;
  connect: () => Promise<{ wallet: WalletClient; account: Address } | null>;
  disconnect: () => void;
  /** The Mezo network the app reads and sends on. */
  net: Network;
  setNet: (k: NetKey) => Promise<void>;
};

const Ctx = createContext<WalletState | null>(null);
const STORE = 'keel.net';

/** One wallet and one network for the whole site: the top bar picks both,
 *  the app uses them. Testnet is the default; `?net=mainnet` or a saved
 *  choice opens mainnet. */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [netKey, setNetKey] = useState<NetKey>(DEFAULT_NET);
  /** Read inside wallet events, which outlive a render. */
  const netRef = useRef<NetKey>(DEFAULT_NET);

  // Pick up the network from the link first, then from the last visit.
  useEffect(() => {
    let k: NetKey | null = null;
    const q = new URLSearchParams(window.location.search).get('net');
    if (isNetKey(q)) k = q;
    else {
      try {
        const saved = window.localStorage.getItem(STORE);
        if (isNetKey(saved)) k = saved;
      } catch {}
    }
    if (k && k !== netRef.current) {
      netRef.current = k;
      setNetKey(k);
    }
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const c = await connectWallet(NETWORKS[netRef.current]);
      setWallet(c.wallet);
      setAccount(c.account);
      return c;
    } catch (e) {
      setError(friendlyError(e, netRef.current));
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAccount(null);
  }, []);

  /** Changes network. A connected wallet is moved to the same chain, so
   *  nothing is ever signed on the other one; if it refuses, it disconnects. */
  const setNet = useCallback(
    async (k: NetKey) => {
      if (k === netRef.current) return;
      netRef.current = k;
      setNetKey(k);
      setError(null);
      try {
        window.localStorage.setItem(STORE, k);
      } catch {}
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has('net')) {
          if (k === DEFAULT_NET) u.searchParams.delete('net');
          else u.searchParams.set('net', k);
          window.history.replaceState(null, '', u);
        }
      } catch {}
      if (!wallet) return;
      setConnecting(true);
      try {
        const c = await connectWallet(NETWORKS[k]);
        setWallet(c.wallet);
        setAccount(c.account);
      } catch (e) {
        setWallet(null);
        setAccount(null);
        setError(friendlyError(e, k));
      } finally {
        setConnecting(false);
      }
    },
    [wallet],
  );

  // Follow the wallet: a new account reconnects; a move to a chain other
  // than the chosen network reloads the page, so nothing is sent on the
  // wrong chain. Keel's own switch lands on the chosen chain and is kept.
  useEffect(() => {
    const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
    if (!eth?.on || !wallet) return;
    const onAccounts = (a: unknown) => {
      if (!(a as Address[])[0]) return disconnect();
      connect();
    };
    const onChain = (id: unknown) => {
      const n = typeof id === 'string' ? parseInt(id, 16) : Number(id);
      if (n === NETWORKS[netRef.current].chain.id) return;
      window.location.reload();
    };
    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [wallet, connect, disconnect]);

  return (
    <Ctx.Provider value={{ wallet, account, error, connecting, connect, disconnect, net: NETWORKS[netKey], setNet }}>
      {children}
    </Ctx.Provider>
  );
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

/** The top bar's network switch: Testnet or Mainnet. */
export function NetToggle() {
  const { net, setNet, connecting } = useWallet();
  return (
    <div className="net-toggle" role="radiogroup" aria-label="Mezo network">
      {(['testnet', 'mainnet'] as NetKey[]).map((k) => (
        <button key={k} role="radio" aria-checked={net.key === k} disabled={connecting} onClick={() => setNet(k)}>
          {net.key === k && <span className="net-dot" />}
          {NETWORKS[k].label}
        </button>
      ))}
    </div>
  );
}

/** Shows its children only on the chosen network, for server rendered parts
 *  of a page that differ per network. */
export function OnNet({ net, children }: { net: NetKey; children: React.ReactNode }) {
  const { net: cur } = useWallet();
  return cur.key === net ? <>{children}</> : null;
}
