'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUnits, parseUnits, type Address, type Hash, type WalletClient } from 'viem';
import { connect } from '@/lib/wallet';
import { deployed, testnet, txUrl } from '@/lib/chains';
import { erc20Abi, marketAbi, vaultAbi, veAbi } from '@/lib/abi';
import { sendTx } from '@/lib/send';
import { DemoRunner } from '@/app/demo/DemoRunner';

const MARKET = deployed.contracts.keelMarket as Address;
const VAULT = deployed.contracts.vault as Address;
const MUSD = deployed.mezo.musd as Address;
const BTC = deployed.mezo.btc as Address;
const VE = deployed.mezo.veBTC as Address;

type Tab = 'borrow' | 'save' | 'loans';
type Coll = 'btc' | 've';
type Line = { text: string; hash?: Hash; ok?: boolean };
type MyLoan = { id: bigint; kind: number; btc: bigint; nftId: bigint; debt: bigint; health: bigint };
type Nft = { id: bigint; amount: bigint; permanent: boolean };

/** Live market numbers, read on the server so a visitor sees a real quote
 *  before connecting anything. */
export type Market = {
  rate: number;
  saverRate: number;
  btcPrice: number;
  borrowingOpen: boolean;
  minLoan: number;
  risk: { btc: [number, number]; veTimed: [number, number]; vePermanent: [number, number] };
};

/** Reads a typed amount, refusing anything but a plain decimal with at most
 *  18 places, so a typo can't become a negative or truncated amount. */
const amount = (s: string, what: string, allowZero = false): bigint => {
  const t = s.trim();
  if (!/^\d*\.?\d{0,18}$/.test(t) || t === '' || t === '.') throw new Error(`Enter ${what} as a number, like 0.5`);
  const v = parseUnits(t, 18);
  if (v === 0n && !allowZero) throw new Error(`Enter ${what} above zero`);
  return v;
};
const num = (s: string) => (/^\d*\.?\d+$|^\d+\.?$/.test(s.trim()) ? Number(s) : NaN);
const fmt = (v: bigint, d = 18, digits = 4) => Number(formatUnits(v, d)).toLocaleString('en-US', { maximumFractionDigits: digits });
const money = (v: number, digits = 2) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—');
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export function KeelApp({ market }: { market: Market | null }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [tab, setTab] = useState<Tab>('borrow');
  const [coll, setColl] = useState<Coll>('btc');
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState<{ btc: bigint; musd: bigint; smusd: bigint } | null>(null);
  const [loans, setLoans] = useState<MyLoan[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [demo, setDemo] = useState(false);

  const [btcIn, setBtcIn] = useState('0.002');
  const [borrowIn, setBorrowIn] = useState('50');
  const [nftPick, setNftPick] = useState('');
  const [saveIn, setSaveIn] = useState('100');

  const say = (l: Line) => setLog((x) => [...x, l]);

  const refresh = useCallback(async (who: Address) => {
    const [btc, musd, smusd, next, veCount] = await Promise.all([
      testnet.getBalance({ address: who }),
      testnet.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [who] }),
      testnet.readContract({ address: VAULT, abi: vaultAbi, functionName: 'balanceOf', args: [who] }),
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' }),
      testnet.readContract({ address: VE, abi: veAbi, functionName: 'balanceOf', args: [who] }),
    ]);
    setBal({ btc, musd, smusd });
    const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
    const mine = (
      await Promise.all(
        ids.map(async (id) => {
          const l = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [id] });
          if (l[0].toLowerCase() !== who.toLowerCase() || l[1] === 0) return null;
          const pos = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'position', args: [id] });
          return { id, kind: l[1], btc: l[3], nftId: l[4], debt: pos[1], health: pos[2] };
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
    setNfts(owned.filter((x) => x.amount > 0n));
  }, []);

  const doConnect = async (): Promise<{ w: WalletClient; a: Address } | null> => {
    try {
      const c = await connect();
      setWallet(c.wallet);
      setAccount(c.account);
      await refresh(c.account);
      return { w: c.wallet, a: c.account };
    } catch (e) {
      say({ text: (e as Error).message, ok: false });
      return null;
    }
  };

  useEffect(() => {
    if (!nftPick && nfts.length) setNftPick(String(nfts[0].id));
  }, [nfts, nftPick]);

  // Follow the wallet: a new account reloads its positions; a new network
  // reloads the page, so nothing is sent on the wrong chain.
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

  /** Connects if needed, then runs the transactions and refreshes positions. */
  const act = async (f: (w: WalletClient, a: Address) => Promise<void>) => {
    let w = wallet;
    let a = account;
    if (!w || !a) {
      const c = await doConnect();
      if (!c) return;
      w = c.w;
      a = c.a;
    }
    setBusy(true);
    try {
      await f(w, a);
    } catch (e) {
      say({ text: (e as Error).message.split('\n')[0], ok: false });
    } finally {
      setBusy(false);
      await refresh(a).catch(() => {});
    }
  };

  const send = async (w: WalletClient, a: Address, label: string, req: Omit<Parameters<typeof sendTx>[2], 'chain' | 'account'>, ready?: () => Promise<boolean>) => {
    say({ text: `${label}: confirm in your wallet` });
    const { hash, receipt } = await sendTx(testnet, w, { ...req, chain: w.chain, account: a } as Parameters<typeof sendTx>[2], { ready });
    const ok = receipt.status === 'success';
    say({ text: `${label}: ${ok ? 'confirmed' : 'reverted'}`, hash, ok });
    if (!ok) throw new Error(`${label} reverted`);
  };

  // ----- live quote, before any wallet -----
  const pick = nfts.find((x) => String(x.id) === nftPick);
  const risk = market
    ? coll === 'btc'
      ? market.risk.btc
      : pick?.permanent
        ? market.risk.vePermanent
        : market.risk.veTimed
    : null;
  const collBtc = coll === 'btc' ? num(btcIn) : pick ? Number(formatUnits(pick.amount, 18)) : NaN;
  const collValue = market ? collBtc * market.btcPrice : NaN;
  const maxBorrow = risk ? (collValue * risk[0]) / 10_000 : NaN;
  const want = num(borrowIn);
  const health = risk && want > 0 ? (collValue * risk[1]) / 10_000 / want : NaN;
  const tooMuch = Number.isFinite(want) && Number.isFinite(maxBorrow) && want > maxBorrow;
  const tooLittle = market && Number.isFinite(want) && want > 0 && want < market.minLoan;

  const borrow = () =>
    act(async (w, a) => {
      const debt = amount(borrowIn || '0', 'the MUSD to borrow', true);
      if (coll === 'btc') {
        const c = amount(btcIn, 'the BTC to lock');
        await send(w, a, 'Approve BTC', { address: BTC, abi: erc20Abi, functionName: 'approve', args: [MARKET, c] });
        await send(w, a, 'Lock BTC and borrow', { address: MARKET, abi: marketAbi, functionName: 'openWithBtc', args: [c, debt] });
      } else {
        if (!nftPick) throw new Error('This wallet holds no veBTC lock on Mezo testnet');
        const id = BigInt(nftPick);
        await send(w, a, `Approve veBTC #${id}`, { address: VE, abi: veAbi, functionName: 'approve', args: [MARKET, id] });
        await send(w, a, `Deposit veBTC #${id} and borrow`, { address: MARKET, abi: marketAbi, functionName: 'openWithVeBTC', args: [id, debt] });
      }
      setTab('loans');
    });

  const deposit = () =>
    act(async (w, a) => {
      const amt = amount(saveIn, 'the amount');
      await send(w, a, 'Approve MUSD', { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [VAULT, amt] });
      await send(w, a, 'Deposit into savings', { address: VAULT, abi: vaultAbi, functionName: 'deposit', args: [amt] });
    });

  const withdraw = () =>
    act(async (w, a) => {
      await send(w, a, 'Withdraw from savings', { address: VAULT, abi: vaultAbi, functionName: 'withdraw', args: [amount(saveIn, 'the amount')] });
    });

  const repayAndClose = (l: MyLoan) =>
    act(async (w, a) => {
      const pay = l.debt + l.debt / 1000n + 1n; // headroom for interest accrued while signing
      await send(w, a, 'Approve MUSD', { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, pay] });
      await send(w, a, `Repay loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'repay', args: [l.id, pay] });
      await send(w, a, `Close loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'close', args: [l.id] }, async () =>
        (await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'debtOf', args: [l.id] })) === 0n,
      );
    });

  return (
    <div className="app">
      <div className="app-tabs" role="tablist">
        {(
          [
            ['borrow', 'Borrow'],
            ['save', 'Save'],
            ['loans', account ? `Loans (${loans.length})` : 'Loans'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'borrow' && (
        <div className="app-body">
          <div className="seg" role="radiogroup" aria-label="Collateral">
            <button role="radio" aria-checked={coll === 'btc'} onClick={() => setColl('btc')}>
              Bitcoin
            </button>
            <button role="radio" aria-checked={coll === 've'} onClick={() => setColl('ve')}>
              Locked veBTC
            </button>
          </div>

          {coll === 'btc' ? (
            <div className="field">
              <label htmlFor="btc">You lock</label>
              <div className="unit">
                <input id="btc" inputMode="decimal" value={btcIn} onChange={(e) => setBtcIn(e.target.value)} />
                <span>BTC</span>
              </div>
            </div>
          ) : account && nfts.length > 0 ? (
            <div className="field">
              <label htmlFor="nft">You deposit</label>
              <select id="nft" value={nftPick} onChange={(e) => setNftPick(e.target.value)}>
                {nfts.map((x) => (
                  <option key={String(x.id)} value={String(x.id)}>
                    veBTC #{String(x.id)} · {fmt(x.amount, 18, 5)} BTC · {x.permanent ? 'permanent' : 'timed'}
                  </option>
                ))}
              </select>
              <span className="hint">You keep voting with it and keep its rewards. Keel holds it until you repay.</span>
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 20 }}>
              {account
                ? 'This wallet holds no veBTC lock on Mezo testnet. Lock BTC in the Mezo testnet app to get one, or borrow against Bitcoin instead.'
                : 'Connect a wallet to pick one of your veBTC locks. You keep voting with it and keep its rewards while it backs your loan.'}
            </p>
          )}

          <div className="field">
            <label htmlFor="borrow">You borrow</label>
            <div className="unit">
              <input id="borrow" inputMode="decimal" value={borrowIn} onChange={(e) => setBorrowIn(e.target.value)} />
              <span>MUSD</span>
            </div>
          </div>

          <dl className="quote">
            <div>
              <dt>Most you can borrow</dt>
              <dd>{Number.isFinite(maxBorrow) ? `${money(maxBorrow)} MUSD` : '—'}</dd>
            </div>
            <div>
              <dt>Rate now</dt>
              <dd>{market ? `${pct(market.rate)} a year` : '—'}</dd>
            </div>
            <div>
              <dt>Health after borrowing</dt>
              <dd className={Number.isFinite(health) && health < 1.2 ? 'warn' : ''}>{Number.isFinite(health) ? money(health) : '—'}</dd>
            </div>
            <div>
              <dt>Can redemptions take it?</dt>
              <dd className="ok">No. It lives outside Mezo&apos;s redemption system</dd>
            </div>
          </dl>
          {tooMuch && <p className="hint warn">That is more than this collateral can back. Lower the amount or add collateral.</p>}
          {tooLittle && <p className="hint warn">The smallest loan is {money(market!.minLoan)} MUSD.</p>}
          {market && !market.borrowingOpen && <p className="hint warn">New borrowing is paused while Mezo&apos;s peg pool runs thin. Repaying stays open.</p>}

          <div className="actions">
            <button className="btn" disabled={busy || tooMuch || !!tooLittle || (market !== null && !market.borrowingOpen)} onClick={borrow}>
              {busy ? 'Working…' : !account ? 'Connect wallet and borrow' : coll === 'btc' ? 'Lock BTC and borrow' : 'Deposit veBTC and borrow'}
            </button>
          </div>
          <p className="hint">If your health falls below 1, the loan can be sold at a discount and any surplus comes back to you.</p>
        </div>
      )}

      {tab === 'save' && (
        <div className="app-body">
          <div className="field">
            <label htmlFor="save">Amount</label>
            <div className="unit">
              <input id="save" inputMode="decimal" value={saveIn} onChange={(e) => setSaveIn(e.target.value)} />
              <span>MUSD</span>
            </div>
          </div>
          <dl className="quote">
            <div>
              <dt>Savers earn now</dt>
              <dd>{market ? `${pct(market.saverRate)} a year` : '—'}</dd>
            </div>
            <div>
              <dt>Paid by</dt>
              <dd>Borrowers&apos; interest, released over a week</dd>
            </div>
            {bal && (
              <div>
                <dt>Your savings</dt>
                <dd>{fmt(bal.smusd, 18, 2)} sMUSD</dd>
              </div>
            )}
            {bal && (
              <div>
                <dt>MUSD in your wallet</dt>
                <dd>{fmt(bal.musd, 18, 2)}</dd>
              </div>
            )}
          </dl>
          <div className="actions">
            <button className="btn" disabled={busy} onClick={deposit}>
              {busy ? 'Working…' : account ? 'Deposit' : 'Connect wallet and deposit'}
            </button>
            {account && (
              <button className="btn ghost" disabled={busy} onClick={withdraw}>
                Withdraw
              </button>
            )}
          </div>
          <p className="hint">At least 80% of savings stays liquid for withdrawals. 10% of interest builds a reserve that takes losses first.</p>
        </div>
      )}

      {tab === 'loans' && (
        <div className="app-body">
          {!account ? (
            <div className="actions">
              <button className="btn" onClick={() => doConnect()}>
                Connect wallet
              </button>
            </div>
          ) : loans.length === 0 ? (
            <p className="hint" style={{ marginTop: 20 }}>No open loans for this wallet yet.</p>
          ) : (
            <div className="scroll" style={{ marginTop: 16 }}>
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
                        <button className="btn ghost small" disabled={busy} onClick={() => repayAndClose(l)}>
                          Repay &amp; close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {bal && (
            <p className="hint">
              Wallet: {fmt(bal.btc, 18, 5)} test BTC · {fmt(bal.musd, 18, 2)} MUSD
            </p>
          )}
        </div>
      )}

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

      <div className="app-foot">
        {demo ? (
          <div className="terminal">
            <DemoRunner />
          </div>
        ) : (
          <button className="linkish" onClick={() => setDemo(true)}>
            No wallet? Watch our demo wallet run a real loan on Mezo testnet
          </button>
        )}
      </div>
    </div>
  );
}
