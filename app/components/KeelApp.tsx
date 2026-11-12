'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, parseAbi, parseUnits, type Address, type Hash, type WalletClient } from 'viem';
import { useWallet } from '@/components/WalletProvider';
import { erc20Abi, marketAbi, troveAbi, vaultAbi, veAbi } from '@/lib/abi';
import { sendTx } from '@/lib/send';
import { friendlyError } from '@/lib/wallet';
import { DemoRunner } from '@/app/demo/DemoRunner';
import type { NetKey } from '@/lib/networks';
import { GetBtc } from '@/components/GetBtc';

const strategyAbi = parseAbi(['function lendable() view returns (uint256)', 'function lent() view returns (uint256)', 'function withdrawable() view returns (uint256)']);

type Tab = 'borrow' | 'save' | 'loans';
type Coll = 'btc' | 've';
type Line = { text: string; hash?: Hash; url?: string; ok?: boolean };
type MyLoan = { id: bigint; kind: number; btc: bigint; nftId: bigint; debt: bigint; health: bigint; autoPay: boolean };
type Nft = { id: bigint; amount: bigint; permanent: boolean };
/** The wallet's open Mezo loan (a trove), which redemptions can reach. */
type Trove = { coll: bigint; debt: bigint };
/** Mezo burns its loans' debt less this gas reserve when a loan is closed. */
const GAS_COMP = 200n * 10n ** 18n;
/** The next day Mezo pools pay voters (Thursday, 00:00 UTC). */
const nextPayout = () => {
  const d = new Date();
  const days = (4 - d.getUTCDay() + 7) % 7 || 7;
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
  return t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

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

export function KeelApp({ markets }: { markets: Record<NetKey, Market | null> }) {
  const { wallet, account, connect, error: walletError, net } = useWallet();
  const market = markets[net.key];
  const pub = net.client;
  const { keelMarket: MARKET, keelStrategy: STRATEGY, vault: VAULT } = net.contracts;
  const { musd: MUSD, btc: BTC, veBTC: VE } = net.tokens;
  const POOLS = net.pools;
  /** The network a read started on, so a late answer from the other one is dropped. */
  const netNow = useRef(net.key);
  netNow.current = net.key;
  const [tab, setTab] = useState<Tab>('borrow');
  const [coll, setColl] = useState<Coll>('btc');
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState<{ btc: bigint; musd: bigint; smusd: bigint } | null>(null);
  const [loans, setLoans] = useState<MyLoan[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [trove, setTrove] = useState<Trove | null>(null);
  /** Mezo's own loan rate, read live, to set beside Keel's on the move card. */
  const [mezoRate, setMezoRate] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);

  const [btcIn, setBtcIn] = useState('0.002');
  const [borrowIn, setBorrowIn] = useState('20');
  /** MUSD Keel can still lend: savings are lent up to a cap, read live. */
  const [room, setRoom] = useState<number | null>(null);
  /** MUSD savers can withdraw right now: liquid savings plus the reserve. */
  const [canWithdraw, setCanWithdraw] = useState<bigint | null>(null);
  const [nftPick, setNftPick] = useState('');
  const [saveIn, setSaveIn] = useState('100');
  const [poolPick, setPoolPick] = useState(0);

  const say = (l: Line) => setLog((x) => [...x, l]);

  const refresh = useCallback(async (who: Address) => {
    const k = net.key;
    const stale = () => netNow.current !== k;
    const [btc, musd, smusd, next, veCount] = await Promise.all([
      pub.getBalance({ address: who }),
      pub.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [who] }),
      pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'balanceOf', args: [who] }),
      pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' }),
      pub.readContract({ address: VE, abi: veAbi, functionName: 'balanceOf', args: [who] }),
    ]);
    if (stale()) return;
    setBal({ btc, musd, smusd });
    const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
    const mine = (
      await Promise.all(
        ids.map(async (id) => {
          const l = await pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [id] });
          if (l[0].toLowerCase() !== who.toLowerCase() || l[1] === 0) return null;
          const [pos, auto] = await Promise.all([
            pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'position', args: [id] }),
            pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'autoPay', args: [id] }),
          ]);
          return { id, kind: l[1], btc: l[3], nftId: l[4], debt: pos[1], health: pos[2], autoPay: auto };
        }),
      )
    ).filter((x): x is MyLoan => x !== null);
    if (stale()) return;
    setLoans(mine);
    const owned = await Promise.all(
      Array.from({ length: Number(veCount) }, async (_, i) => {
        const id = await pub.readContract({ address: VE, abi: veAbi, functionName: 'ownerToNFTokenIdList', args: [who, BigInt(i)] });
        const lk = await pub.readContract({ address: VE, abi: veAbi, functionName: 'locked', args: [id] });
        return { id, amount: BigInt(lk[0]), permanent: lk[2] };
      }),
    );
    if (stale()) return;
    setNfts(owned.filter((x) => x.amount > 0n));
    const tm = net.mezo.troveManager;
    const status = await pub.readContract({ address: tm, abi: troveAbi, functionName: 'getTroveStatus', args: [who] }).catch(() => 0n);
    if (status !== 1n) {
      if (!stale()) setTrove(null);
      return;
    }
    const [coll, debt] = await Promise.all([
      pub.readContract({ address: tm, abi: troveAbi, functionName: 'getTroveColl', args: [who] }),
      pub.readContract({ address: tm, abi: troveAbi, functionName: 'getTroveDebt', args: [who] }),
    ]);
    if (!stale()) setTrove({ coll, debt });
    const bps = await pub
      .readContract({ address: net.mezo.interestRateManager, abi: troveAbi, functionName: 'interestRate' })
      .catch(() => null);
    if (!stale() && bps !== null) setMezoRate(Number(bps) / 10_000);
  }, [net.key, net.mezo.troveManager, pub, MUSD, VAULT, MARKET, VE]);

  const doConnect = async (): Promise<{ w: WalletClient; a: Address } | null> => {
    const c = await connect();
    if (!c) return null;
    return { w: c.wallet, a: c.account };
  };

  const readRoom = useCallback(async () => {
    const k = net.key;
    const [cap, out, free] = await Promise.all([
      pub.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'lendable' }),
      pub.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'lent' }),
      pub.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'withdrawable' }),
    ]);
    if (netNow.current !== k) return;
    setCanWithdraw(free);
    setRoom(Math.max(0, Number(formatUnits(cap > out ? cap - out : 0n, 18))));
  }, [net.key, pub, STRATEGY]);

  // A new network starts clean: its own balances, loans, locks and room.
  useEffect(() => {
    setRoom(null);
    setCanWithdraw(null);
    setBal(null);
    setLoans([]);
    setNfts([]);
    setTrove(null);
    setNftPick('');
    setPoolPick(0);
    setLog([]);
    setDemo(false);
  }, [net.key]);
  useEffect(() => {
    readRoom().catch(() => {});
    const id = setInterval(() => readRoom().catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, [readRoom]);

  // Load positions whenever a wallet connects or changes account.
  useEffect(() => {
    if (account) refresh(account).catch(() => {});
    else {
      setBal(null);
      setLoans([]);
      setNfts([]);
      setTrove(null);
    }
  }, [account, refresh]);

  useEffect(() => {
    if (!nftPick && nfts.length) setNftPick(String(nfts[0].id));
  }, [nfts, nftPick]);

  /** Connects if needed, then runs the transactions and refreshes positions. */
  const act = async (f: (w: WalletClient, a: Address) => Promise<void>) => {
    let w = wallet;
    let a = account;
    // Never sign with a wallet bound to the other network.
    if (!w || !a || w.chain?.id !== net.chain.id) {
      const c = await doConnect();
      if (!c) return;
      w = c.w;
      a = c.a;
    }
    setBusy(true);
    try {
      await f(w, a);
    } catch (e) {
      say({ text: friendlyError(e, net.key), ok: false });
    } finally {
      setBusy(false);
      await refresh(a).catch(() => {});
      readRoom().catch(() => {});
    }
  };

  const send = async (w: WalletClient, a: Address, label: string, req: Omit<Parameters<typeof sendTx>[2], 'chain' | 'account'>, ready?: () => Promise<boolean>) => {
    say({ text: `${label}: confirm in your wallet` });
    if (w.chain?.id !== net.chain.id) throw new Error(`Your wallet is not on Mezo ${net.key}. Switch it and try again.`);
    const { hash, receipt } = await sendTx(pub, w, { ...req, chain: w.chain, account: a } as Parameters<typeof sendTx>[2], { ready });
    const ok = receipt.status === 'success';
    say({ text: `${label}: ${ok ? 'confirmed' : 'reverted'}`, hash, url: net.txUrl(hash), ok });
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
  const collLimit = risk ? (collValue * risk[0]) / 10_000 : NaN;
  const roomBound = room !== null && Number.isFinite(collLimit) && room < collLimit;
  const want = num(borrowIn);
  const health = risk && want > 0 ? (collValue * risk[1]) / 10_000 / want : NaN;
  const tooMuch = Number.isFinite(want) && Number.isFinite(collLimit) && want > collLimit;
  const overRoom = !tooMuch && room !== null && Number.isFinite(want) && want > room;
  const tooLittle = market && Number.isFinite(want) && want > 0 && want < market.minLoan;
  // Lending is full when what Keel can still lend is under the smallest loan.
  const full = !!market && room !== null && room < market.minLoan;

  const borrow = () =>
    act(async (w, a) => {
      const debt = amount(borrowIn || '0', 'the MUSD to borrow', true);
      if (coll === 'btc') {
        const c = amount(btcIn, 'the BTC to lock');
        if (bal && c >= bal.btc) throw new Error(`This wallet has ${fmt(bal.btc, 18, 5)} ${net.btcLabel}, and a little is needed for fees. Lock less.`);
        await send(w, a, 'Approve BTC', { address: BTC, abi: erc20Abi, functionName: 'approve', args: [MARKET, c] });
        await send(w, a, 'Lock BTC and borrow', { address: MARKET, abi: marketAbi, functionName: 'openWithBtc', args: [c, debt] });
      } else {
        if (!nftPick) throw new Error(`This wallet holds no veBTC lock on Mezo ${net.key}`);
        const id = BigInt(nftPick);
        await send(w, a, `Approve veBTC #${id}`, { address: VE, abi: veAbi, functionName: 'approve', args: [MARKET, id] });
        await send(w, a, `Deposit veBTC #${id} and borrow`, { address: MARKET, abi: marketAbi, functionName: 'openWithVeBTC', args: [id, debt] });
      }
      setTab('loans');
    });

  // ----- moving a Mezo loan into Keel -----
  // Keel pays the Mezo loan with MUSD it lends, Mezo sends the loan's BTC to
  // Keel, and the same debt reopens in Keel, where redemptions can't reach it.
  const moveDebt = trove ? trove.debt - GAS_COMP : 0n;
  const moveDebtN = Number(formatUnits(moveDebt, 18));
  const troveBtc = trove ? Number(formatUnits(trove.coll, 18)) : 0;
  const maxLtv = market ? market.risk.btc[0] / 10_000 : NaN;
  const liqLtv = market ? market.risk.btc[1] / 10_000 : NaN;
  // BTC to add so the moved loan sits inside Keel's limit, with 2% to spare.
  const topUp = market && trove ? Math.max(0, (moveDebtN / (market.btcPrice * maxLtv)) * 1.02 - troveBtc) : 0;
  const topUpBig = topUp > 0 ? parseUnits(topUp.toFixed(6), 18) : 0n;
  const moveHealth = market && trove ? ((troveBtc + topUp) * market.btcPrice * liqLtv) / moveDebtN : NaN;
  const moveFits = room === null || room >= moveDebtN;

  const moveTrove = () =>
    act(async (w, a) => {
      if (!trove) throw new Error('This wallet has no open Mezo loan to move.');
      if (bal && topUpBig > 0n && topUpBig >= bal.btc)
        throw new Error(`Moving needs ${topUp.toFixed(5)} more ${net.btcLabel} on top of the loan's, and this wallet has ${fmt(bal.btc, 18, 5)}.`);
      const bos = net.mezo.bos;
      const nonce = await pub.readContract({ address: bos, abi: troveAbi, functionName: 'getNonce', args: [a] });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      say({ text: 'Sign once: Mezo lets Keel close your Mezo loan and take its BTC' });
      const sig = await w.signTypedData({
        account: a,
        domain: { name: 'BorrowerOperationsSignatures', version: '1', chainId: net.chain.id, verifyingContract: bos },
        types: {
          CloseTrove: [
            { name: 'borrower', type: 'address' },
            { name: 'recipient', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'CloseTrove',
        message: { borrower: a, recipient: MARKET, nonce, deadline },
      });
      say({ text: 'Signed. Nothing has moved yet', ok: true });
      if (topUpBig > 0n) await send(w, a, `Approve ${topUp.toFixed(5)} BTC top up`, { address: BTC, abi: erc20Abi, functionName: 'approve', args: [MARKET, topUpBig] });
      await send(w, a, 'Move my Mezo loan into Keel', { address: MARKET, abi: marketAbi, functionName: 'openFromTrove', args: [topUpBig, deadline, sig] });
      setTab('loans');
    });

  const deposit = () =>
    act(async (w, a) => {
      const amt = amount(saveIn, 'the amount');
      if (bal && amt > bal.musd) throw new Error(`This wallet has ${fmt(bal.musd, 18, 2)} MUSD. Deposit that much or less.`);
      await send(w, a, 'Approve MUSD', { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [VAULT, amt] });
      await send(w, a, 'Deposit into savings', { address: VAULT, abi: vaultAbi, functionName: 'deposit', args: [amt] });
    });

  const withdraw = () =>
    act(async (w, a) => {
      const amt = amount(saveIn, 'the amount');
      if (bal && amt > bal.smusd) throw new Error(`You have ${fmt(bal.smusd, 18, 2)} sMUSD saved. Withdraw that much or less.`);
      if (canWithdraw !== null && amt > canWithdraw)
        throw new Error(`Right now ${fmt(canWithdraw, 18, 2)} MUSD can leave at once while loans are out. Withdraw that much, and the rest frees up as loans are repaid.`);
      await send(w, a, 'Withdraw from savings', { address: VAULT, abi: vaultAbi, functionName: 'withdraw', args: [amt] });
    });

  /** Votes with the loan's veBTC, all weight on one Mezo pool. */
  const voteFor = (l: MyLoan) =>
    act(async (w, a) => {
      const p = POOLS[poolPick] ?? POOLS[0];
      await send(w, a, `Vote with veBTC #${l.nftId} for ${p.name}`, { address: MARKET, abi: marketAbi, functionName: 'vote', args: [l.id, [p.pool], [10_000n]] });
    });

  /** Claims what the loan's veBTC earned in every pool. MUSD pays the loan,
   *  interest first; every other token goes to the wallet. */
  const claimFor = (l: MyLoan) =>
    act(async (w, a) => {
      const fees = POOLS.map((p) => p.fees);
      const bribes = POOLS.map((p) => p.bribe);
      const tokens = POOLS.map((p) => p.tokens);
      await send(w, a, `Claim fees, MUSD to loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'claimRewardsToDebt', args: [l.id, fees, tokens, false] });
      await send(w, a, `Claim bribes, MUSD to loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'claimRewardsToDebt', args: [l.id, bribes, tokens, true] });
    });

  /** Lets the keeper claim this loan's rewards every day and pay the loan with them. */
  const toggleAutoPay = (l: MyLoan) =>
    act(async (w, a) => {
      await send(w, a, `${l.autoPay ? 'Turn off' : 'Turn on'} auto pay for loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'setAutoPay', args: [l.id, !l.autoPay] });
    });

  const repayAndClose = (l: MyLoan) =>
    act(async (w, a) => {
      const pay = l.debt + l.debt / 1000n + 1n; // headroom for interest accrued while signing
      if (bal && pay > bal.musd) throw new Error(`Repaying takes about ${fmt(pay, 18, 4)} MUSD and this wallet has ${fmt(bal.musd, 18, 4)}.`);
      await send(w, a, 'Approve MUSD', { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, pay] });
      await send(w, a, `Repay loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'repay', args: [l.id, pay] });
      await send(w, a, `Close loan #${l.id}`, { address: MARKET, abi: marketAbi, functionName: 'close', args: [l.id] }, async () =>
        (await pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'debtOf', args: [l.id] })) === 0n,
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

      {net.key === 'mainnet' && (
        <p className="net-note">
          <b>Mainnet: real BTC and MUSD.</b> A small opt in vault: 5 MUSD minimum loan, up to 2,000 MUSD of savings.
        </p>
      )}

      <GetBtc
        key={`${net.key}-${account && bal && bal.btc < net.lowBtc ? 'empty' : 'ok'}`}
        faucet={net.faucet}
        open={!!(account && bal && bal.btc < net.lowBtc)}
        empty={!!(account && bal && bal.btc < net.lowBtc)}
        onRefresh={account ? () => refresh(account).catch(() => {}) : undefined}
      />
      {account && bal && bal.btc >= net.lowBtc && (
        <div className="wallet-strip">
          <span>
            <b>{fmt(bal.btc, 18, 5)}</b> {net.btcLabel} · <b>{fmt(bal.musd, 18, 2)}</b> MUSD
          </span>
          {net.faucet && (
            <a href={net.faucet} target="_blank" rel="noreferrer">
              Need more test BTC? ↗
            </a>
          )}
        </div>
      )}

      {tab === 'borrow' && (
        <div className="app-body">
          {trove && (
            <div className="move-card">
              <p className="move-k">You have a Mezo loan that redemptions can reach</p>
              <dl className="quote">
                <div>
                  <dt>Your Mezo loan</dt>
                  <dd>
                    {money(troveBtc, 5)} BTC · {money(moveDebtN)} MUSD
                  </dd>
                </div>
                <div>
                  <dt>What moves</dt>
                  <dd>Your BTC and your debt, no MUSD needed</dd>
                </div>
                <div>
                  <dt>Rate on Mezo now</dt>
                  <dd>{mezoRate === null ? '—' : `${pct(mezoRate)} a year, and it can be redeemed`}</dd>
                </div>
                <div>
                  <dt>Rate on Keel now</dt>
                  <dd>{market ? `${pct(market.rate)} a year, never redeemed` : '—'}</dd>
                </div>
                <div>
                  <dt>With Mezo&apos;s savings vault behind Keel</dt>
                  <dd>About 3% a year: lending this loan would use a sliver of 1.3M MUSD</dd>
                </div>
                {topUp > 0 && (
                  <div>
                    <dt>Add to fit Keel&apos;s limit</dt>
                    <dd>{topUp.toFixed(5)} BTC</dd>
                  </div>
                )}
                <div>
                  <dt>Health after moving</dt>
                  <dd>{money(moveHealth)}</dd>
                </div>
                <div>
                  <dt>Can redemptions take it then?</dt>
                  <dd className="ok">No</dd>
                </div>
              </dl>
              {!moveFits && (
                <p className="hint warn">
                  Keel can lend {money(room!)} MUSD right now and this loan needs {money(moveDebtN)}. It fits once savers add more.
                </p>
              )}
              <div className="actions">
                <button className="btn" disabled={busy || !moveFits} onClick={moveTrove}>
                  {busy ? 'Working…' : 'Move my Mezo loan to Keel'}
                </button>
              </div>
              <p className="hint">
                One signature lets Mezo close your loan for Keel. Keel pays it off, Mezo sends its BTC here, and the same debt reopens in Keel. Keel&apos;s rate pays
                its savers, so it is higher than Mezo&apos;s, and it falls as more savers add MUSD; what you buy is a loan no redemption can sell.
              </p>
            </div>
          )}
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
              <span className="hint">It keeps its voting power and rewards, claimed through Keel&apos;s contract. Keel holds it until you repay.</span>
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 20 }}>
              {account
                ? `This wallet holds no veBTC lock on Mezo ${net.key}. Lock BTC in the Mezo ${net.key === 'testnet' ? 'testnet ' : ''}app to get one, or borrow against Bitcoin instead.`
                : 'Connect a wallet to pick one of your veBTC locks. It keeps its voting power and rewards while it backs your loan.'}
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
              <dt>Your collateral can back</dt>
              <dd>{Number.isFinite(collLimit) ? `${money(collLimit)} MUSD` : '—'}</dd>
            </div>
            <div>
              <dt>Keel can lend now</dt>
              <dd>{room === null ? '—' : `${money(room)} MUSD`}</dd>
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
          {full ? (
            <div className="full-note">
              <p>
                <b>Every MUSD Keel can lend is out on loan right now.</b> Borrowing opens again as savers add MUSD ({net.lendShare} of every MUSD saved can be lent) or a loan is repaid. Saving earns {pct(market!.saverRate)} a year in the meantime.
              </p>
              <button className="linkish" onClick={() => setTab('save')}>
                Save MUSD and open room
              </button>
            </div>
          ) : (
            <>
          {tooMuch && <p className="hint warn">That is more than this collateral can back. Lower the amount or add collateral.</p>}
          {overRoom && (
            <p className="hint warn">
              Keel can lend {money(room!)} MUSD more right now: at most {net.lendShare} of savings is ever lent. Borrow that much or less, or try again after a loan is repaid.
            </p>
          )}
          {!overRoom && roomBound && <p className="hint">Keel can lend {money(room!)} MUSD more right now, the cap on savings.</p>}
          {tooLittle && <p className="hint warn">The smallest loan is {money(market!.minLoan)} MUSD.</p>}
          {market && !market.borrowingOpen && <p className="hint warn">New borrowing is paused while Mezo&apos;s peg pool runs thin. Repaying stays open.</p>}
            </>
          )}

          <div className="actions">
            <button className="btn" disabled={busy || full || tooMuch || overRoom || !!tooLittle || (market !== null && !market.borrowingOpen)} onClick={borrow}>
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
          <p className="hint">At least {net.liquidPct}% of savings stays liquid for withdrawals. 10% of interest builds a reserve that takes losses first.</p>
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
                    <Fragment key={String(l.id)}>
                    <tr>
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
                    {l.kind !== 1 && (
                      <tr className="ve-row">
                        <td colSpan={5}>
                          <div className="ve-tools">
                            <span>Your lock keeps voting and earning:</span>
                            <select value={poolPick} onChange={(e) => setPoolPick(Number(e.target.value))} aria-label="Mezo pool">
                              {POOLS.map((p, i) => (
                                <option key={p.pool} value={i}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <button className="btn ghost small" disabled={busy} onClick={() => voteFor(l)}>
                              Vote
                            </button>
                            <button className="btn ghost small" disabled={busy} onClick={() => claimFor(l)}>
                              Claim rewards to loan
                            </button>
                            <button className={`btn small ${l.autoPay ? '' : 'ghost'}`} disabled={busy} onClick={() => toggleAutoPay(l)}>
                              {l.autoPay ? 'Auto pay on' : 'Turn on auto pay'}
                            </button>
                          </div>
                          <ol className="ve-loop">
                            <li>Your lock votes for a Mezo pool.</li>
                            <li>Every Thursday the pool pays its voters.</li>
                            <li>Keel collects your share and turns its BTC into MUSD on Mezo&apos;s own pool.</li>
                            <li>That MUSD pays this loan, interest first.</li>
                          </ol>
                          <p className="ve-note">
                            {l.autoPay ? `Auto pay is on: Keel collects for you. Next payout ${nextPayout()}.` : 'Turn on auto pay and Keel collects for you every week.'}
                          </p>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {bal && (
            <p className="hint">
              Wallet: {fmt(bal.btc, 18, 5)} {net.btcLabel} · {fmt(bal.musd, 18, 2)} MUSD
            </p>
          )}
        </div>
      )}

      {walletError && !account && <p className="hint warn">{walletError}</p>}
      {log.length > 0 && (
        <div className="log">
          {log.map((l, i) => (
            <div key={i} className={l.ok === false ? 'bad' : l.ok ? 'ok' : ''}>
              {l.text}{' '}
              {l.hash && (
                <a href={l.url ?? net.txUrl(l.hash)} target="_blank" rel="noreferrer">
                  {l.hash.slice(0, 12)}…
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {net.hasDemo && (
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
      )}
    </div>
  );
}
