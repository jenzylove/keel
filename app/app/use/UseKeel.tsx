'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUnits, parseUnits, type Address, type Hash, type WalletClient } from 'viem';
import { connect } from '@/lib/wallet';
import { deployed, testnet, txUrl } from '@/lib/chains';
import { erc20Abi, marketAbi, vaultAbi, veAbi } from '@/lib/abi';
import { sendTx } from '@/lib/send';

const MARKET = deployed.contracts.keelMarket as Address;
const VAULT = deployed.contracts.vault as Address;
const MUSD = deployed.mezo.musd as Address;
const BTC = deployed.mezo.btc as Address;
const VE = deployed.mezo.veBTC as Address;

type Tab = 'btc' | 've' | 'save' | 'mine';
type Line = { text: string; hash?: Hash; ok?: boolean };
type MyLoan = { id: bigint; kind: number; btc: bigint; nftId: bigint; debt: bigint; limit: bigint; health: bigint };
type Nft = { id: bigint; amount: bigint; permanent: boolean };

/** Reads a typed amount, refusing anything but a plain decimal with at most
 *  18 places, so a typo can't become a negative or truncated amount. */
const amount = (s: string, what: string, allowZero = false): bigint => {
  const t = s.trim();
  if (!/^\d*\.?\d{0,18}$/.test(t) || t === '' || t === '.') throw new Error(`Enter ${what} as a number, like 0.5`);
  const v = parseUnits(t, 18);
  if (v === 0n && !allowZero) throw new Error(`Enter ${what} above zero`);
  return v;
};

const fmt = (v: bigint, d = 18, digits = 4) => Number(formatUnits(v, d)).toLocaleString('en-US', { maximumFractionDigits: digits });

export function UseKeel() {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [tab, setTab] = useState<Tab>('btc');
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState<{ btc: bigint; musd: bigint; smusd: bigint } | null>(null);
  const [loans, setLoans] = useState<MyLoan[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [price, setPrice] = useState<bigint>(0n);

  const say = (l: Line) => setLog((x) => [...x, l]);

  const refresh = useCallback(async (who: Address) => {
    const [btc, musd, smusd, next, p, veCount] = await Promise.all([
      testnet.getBalance({ address: who }),
      testnet.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [who] }),
      testnet.readContract({ address: VAULT, abi: vaultAbi, functionName: 'balanceOf', args: [who] }),
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' }),
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'lastBtcPrice' }),
      testnet.readContract({ address: VE, abi: veAbi, functionName: 'balanceOf', args: [who] }),
    ]);
    setBal({ btc, musd, smusd });
    setPrice(p);
    const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
    const mine = (
      await Promise.all(
        ids.map(async (id) => {
          const l = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [id] });
          if (l[0].toLowerCase() !== who.toLowerCase() || l[1] === 0) return null;
          const pos = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'position', args: [id] });
          return { id, kind: l[1], btc: l[3], nftId: l[4], debt: pos[1], limit: pos[3], health: pos[2] };
        }),
      )
    ).filter((x): x is MyLoan => x !== null);
    setLoans(mine);
    const owned = await Promise.all(
      Array.from({ length: Number(veCount) }, async (_, i) => {
        const id = await testnet.readContract({ address: VE, abi: veAbi, functionName: 'ownerToNFTokenIdList', args: [who, BigInt(i)] });
        const lk = await testnet.readContract({ address: VE, abi: veAbi, functionName: 'locked', args: [id] });
        return { id, amount: BigInt(lk[0]), permanent: lk[2] };
      }),
    );
    setNfts(owned.filter((n) => n.amount > 0n));
  }, []);

  const onConnect = async () => {
    try {
      const c = await connect();
      setWallet(c.wallet);
      setAccount(c.account);
      await refresh(c.account);
    } catch (e) {
      say({ text: (e as Error).message, ok: false });
    }
  };

  /** Sends one transaction, waits for it, and logs the result. `ready` waits
   *  until the state the call depends on is visible on the RPC. */
  const send = async (label: string, req: Parameters<typeof sendTx>[2], ready?: () => Promise<boolean>) => {
    if (!wallet) throw new Error('connect first');
    say({ text: `${label}: confirm in your wallet` });
    const { hash, receipt } = await sendTx(testnet, wallet, req, { ready });
    const ok = receipt.status === 'success';
    say({ text: `${label}: ${ok ? 'confirmed' : 'reverted'}`, hash, ok });
    if (!ok) throw new Error(`${label} reverted`);
  };

  const run = async (f: () => Promise<void>) => {
    if (!account) return;
    setBusy(true);
    try {
      await f();
    } catch (e) {
      say({ text: (e as Error).message.split('\n')[0], ok: false });
    } finally {
      setBusy(false);
      await refresh(account).catch(() => {});
    }
  };

  const base = { chain: wallet?.chain, account: account! } as const;

  // ----- forms -----
  const [btcIn, setBtcIn] = useState('0.003');
  const [borrowIn, setBorrowIn] = useState('100');
  const [nftPick, setNftPick] = useState('');
  const [veBorrow, setVeBorrow] = useState('20');
  const [saveIn, setSaveIn] = useState('100');

  useEffect(() => {
    if (!nftPick && nfts.length) setNftPick(String(nfts[0].id));
  }, [nfts, nftPick]);

  const btcValue = price && Number(btcIn) > 0 ? (Number(btcIn) * Number(formatUnits(price, 18))).toFixed(2) : '—';

  // Follow the wallet: a new account reloads its loans; a new network reloads
  // the page, so nothing is sent on the wrong chain.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on || !wallet) return;
    const onAccounts = (a: unknown) => {
      const next = (a as Address[])[0];
      if (!next) {
        setWallet(null);
        setAccount(null);
        return;
      }
      connect().then((c) => {
        setWallet(c.wallet);
        setAccount(c.account);
        refresh(c.account).catch(() => {});
      }, () => {});
    };
    const onChain = () => window.location.reload();
    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [wallet, refresh]);

  const openBtc = () =>
    run(async () => {
      const coll = amount(btcIn, 'the BTC to lock');
      await send('Approve BTC', { ...base, address: BTC, abi: erc20Abi, functionName: 'approve', args: [MARKET, coll] });
      await send('Open BTC loan', { ...base, address: MARKET, abi: marketAbi, functionName: 'openWithBtc', args: [coll, amount(borrowIn || '0', 'the MUSD to borrow', true)] });
    });

  const openVe = () =>
    run(async () => {
      const id = BigInt(nftPick);
      await send(`Approve veBTC #${id}`, { ...base, address: VE, abi: veAbi, functionName: 'approve', args: [MARKET, id] });
      await send(`Open loan on veBTC #${id}`, { ...base, address: MARKET, abi: marketAbi, functionName: 'openWithVeBTC', args: [id, amount(veBorrow || '0', 'the MUSD to borrow', true)] });
    });

  const deposit = () =>
    run(async () => {
      const amt = amount(saveIn, 'the amount');
      await send('Approve MUSD', { ...base, address: MUSD, abi: erc20Abi, functionName: 'approve', args: [VAULT, amt] });
      await send('Deposit into savings vault', { ...base, address: VAULT, abi: vaultAbi, functionName: 'deposit', args: [amt] });
    });

  const withdraw = () =>
    run(async () => {
      await send('Withdraw from savings vault', { ...base, address: VAULT, abi: vaultAbi, functionName: 'withdraw', args: [amount(saveIn, 'the amount')] });
    });

  const repayAndClose = (l: MyLoan) =>
    run(async () => {
      const pay = l.debt + l.debt / 1000n + 1n; // a little headroom for interest accrued while signing
      await send('Approve MUSD', { ...base, address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, pay] });
      await send(`Repay loan #${l.id}`, { ...base, address: MARKET, abi: marketAbi, functionName: 'repay', args: [l.id, pay] });
      await send(`Close loan #${l.id}`, { ...base, address: MARKET, abi: marketAbi, functionName: 'close', args: [l.id] }, async () =>
        (await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'debtOf', args: [l.id] })) === 0n,
      );
    });

  if (!account) {
    return (
      <div className="actions">
        <button className="btn" onClick={onConnect}>
          Connect wallet (Mezo testnet)
        </button>
        {log.map((l, i) => (
          <p key={i} className="hint" style={{ color: 'var(--danger)' }}>
            {l.text}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div className="readings" style={{ marginTop: 0 }}>
        <div className="reading">
          <div className="v">{bal ? fmt(bal.btc, 18, 5) : '—'}</div>
          <div className="l">test BTC in your wallet</div>
        </div>
        <div className="reading">
          <div className="v">{bal ? fmt(bal.musd, 18, 2) : '—'}</div>
          <div className="l">MUSD in your wallet</div>
        </div>
        <div className="reading">
          <div className="v">{bal ? fmt(bal.smusd, 18, 2) : '—'}</div>
          <div className="l">sMUSD (your savings)</div>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['btc', 'Borrow on BTC'],
            ['ve', 'Borrow on veBTC'],
            ['save', 'Save'],
            ['mine', `My loans (${loans.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 560 }}>
        {tab === 'btc' && (
          <>
            <div className="field">
              <label htmlFor="btc">BTC to lock</label>
              <input id="btc" inputMode="decimal" value={btcIn} onChange={(e) => setBtcIn(e.target.value)} />
              <span className="hint">Worth about {btcValue} MUSD at Mezo&apos;s testnet price. You can borrow up to 50% of it.</span>
            </div>
            <div className="field">
              <label htmlFor="b1">MUSD to borrow</label>
              <input id="b1" inputMode="decimal" value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} />
            </div>
            <div className="actions">
              <button className="btn" disabled={busy} onClick={openBtc}>
                {busy ? 'Working…' : 'Lock BTC and borrow'}
              </button>
            </div>
          </>
        )}

        {tab === 've' && (
          <>
            {nfts.length === 0 ? (
              <p className="hint" style={{ marginTop: 20 }}>
                This wallet holds no veBTC. Lock BTC on Mezo testnet to get one, then come back.
              </p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="nft">veBTC NFT</label>
                  <select id="nft" value={nftPick} onChange={(e) => setNftPick(e.target.value)}>
                    {nfts.map((n) => (
                      <option key={String(n.id)} value={String(n.id)}>
                        #{String(n.id)} · {fmt(n.amount, 18, 5)} BTC · {n.permanent ? 'permanent (40% limit)' : 'timed (45% limit)'}
                      </option>
                    ))}
                  </select>
                  <span className="hint">You keep voting with it and keep its rewards. Keel holds it until you repay.</span>
                </div>
                <div className="field">
                  <label htmlFor="b2">MUSD to borrow</label>
                  <input id="b2" inputMode="decimal" value={veBorrow} onChange={(e) => setVeBorrow(e.target.value)} />
                </div>
                <div className="actions">
                  <button className="btn" disabled={busy} onClick={openVe}>
                    {busy ? 'Working…' : 'Deposit veBTC and borrow'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'save' && (
          <>
            <div className="field">
              <label htmlFor="s">MUSD</label>
              <input id="s" inputMode="decimal" value={saveIn} onChange={(e) => setSaveIn(e.target.value)} />
              <span className="hint">The savings vault puts deposits straight into KeelStrategy. Withdrawals draw from its liquid 80%.</span>
            </div>
            <div className="actions">
              <button className="btn" disabled={busy} onClick={deposit}>
                Deposit
              </button>
              <button className="btn ghost" disabled={busy} onClick={withdraw}>
                Withdraw
              </button>
            </div>
          </>
        )}

        {tab === 'mine' && (
          <div className="scroll" style={{ marginTop: 16 }}>
            {loans.length === 0 ? (
              <p className="hint">No open loans for this wallet.</p>
            ) : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Loan</th>
                    <th>Collateral</th>
                    <th className="num">Debt</th>
                    <th className="num">Health</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={String(l.id)}>
                      <td className="mono">#{String(l.id)}</td>
                      <td>{l.kind === 1 ? `${fmt(l.btc, 18, 5)} BTC` : `veBTC #${String(l.nftId)}`}</td>
                      <td className="num">{fmt(l.debt, 18, 4)}</td>
                      <td className="num">{l.health > 10n ** 30n ? '∞' : fmt(l.health, 18, 2)}</td>
                      <td>
                        <button className="btn ghost" style={{ padding: '6px 14px', fontSize: 14 }} disabled={busy} onClick={() => repayAndClose(l)}>
                          Repay &amp; close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div className="log">
          {log.map((l, i) => (
            <div key={i} className={l.ok === false ? 'bad' : l.ok ? 'ok' : ''}>
              {l.text}{' '}
              {l.hash && (
                <a href={txUrl(l.hash)} target="_blank" rel="noreferrer">
                  {l.hash.slice(0, 12)}…
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
