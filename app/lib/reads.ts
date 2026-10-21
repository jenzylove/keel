import 'server-only';
import { formatUnits } from 'viem';
import { MAINNET, deployed, mainnet, testnet } from './chains';
import { erc20Abi, mainnetAbi, marketAbi, strategyAbi, veAbi } from './abi';

const n = (v: bigint, d = 18) => Number(formatUnits(v, d));

/** Runs a read and returns null instead of throwing, so a failed source shows
 *  as unavailable rather than as a made-up number. */
async function safe<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

/** Pages are cached and refreshed in the background. If a refresh can't read
 *  the chain, throwing makes Next keep serving the last good page instead of
 *  caching blanks. At build time there is no last page, so it renders what it
 *  has. */
export function keepLastGoodUnless(ok: boolean, what: string): void {
  if (!ok && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error(`${what} unavailable; serving the last good page`);
  }
}

export type MainnetSnapshot = {
  at: string;
  block: number | null;
  idleSavings: number | null;
  savingsStrategy: string | null;
  troves: number | null;
  troveDebt: number | null;
  musdSupply: number | null;
  enclaveDebt: number | null;
  bootstrapDebt: number | null;
  wallStable: number | null;
  wallMusd: number | null;
  safetyBufferBtc: number | null;
  veBtcLocked: number | null;
  btcPrice: number | null;
  /** What one sMUSD earned over the last 30 days, as a yearly rate. */
  saverRate30d: number | null;
};

/** The vault's yield index is the total MUSD paid per sMUSD, so its change
 *  over a window is exactly what a saver earned in it. */
async function saverRate30d(head: bigint | null): Promise<number | null> {
  if (head === null) return null;
  const blockNumber = head - BigInt(Math.floor((30 * 86400) / 3.874));
  const [now, then] = await Promise.all([
    safe(() => mainnet.readContract({ address: MAINNET.smusd, abi: mainnetAbi, functionName: 'yieldIndex' })),
    safe(() => mainnet.readContract({ address: MAINNET.smusd, abi: mainnetAbi, functionName: 'yieldIndex', blockNumber })),
  ]);
  if (now === null || then === null) return null;
  return (n(now - then) * 365) / 30;
}

export async function mainnetSnapshot(): Promise<MainnetSnapshot> {
  const [block, strategy, troves, troveDebt, supply, enclave, bootstrap, wallStable, wallMusd, buffer, ve, price] =
    await Promise.all([
      safe(() => mainnet.getBlockNumber()),
      safe(() => mainnet.readContract({ address: MAINNET.smusd, abi: mainnetAbi, functionName: 'strategy' })),
      safe(() => mainnet.readContract({ address: MAINNET.troveManager, abi: mainnetAbi, functionName: 'getTroveOwnersCount' })),
      safe(() => mainnet.readContract({ address: MAINNET.troveManager, abi: mainnetAbi, functionName: 'getEntireSystemDebt' })),
      safe(() => mainnet.readContract({ address: MAINNET.musd, abi: erc20Abi, functionName: 'totalSupply' })),
      safe(() => mainnet.readContract({ address: MAINNET.enclaveDebtManager, abi: mainnetAbi, functionName: 'getTotalOutstandingDebt' })),
      safe(() => mainnet.readContract({ address: MAINNET.pcv, abi: mainnetAbi, functionName: 'debtToPay' })),
      safe(() => mainnet.readContract({ address: MAINNET.musdc, abi: erc20Abi, functionName: 'balanceOf', args: [MAINNET.wallPool] })),
      safe(() => mainnet.readContract({ address: MAINNET.musd, abi: erc20Abi, functionName: 'balanceOf', args: [MAINNET.wallPool] })),
      safe(() => mainnet.getBalance({ address: MAINNET.safetyBuffer })),
      safe(() => mainnet.readContract({ address: MAINNET.veBTC, abi: mainnetAbi, functionName: 'supply' })),
      safe(() => mainnet.readContract({ address: MAINNET.priceFeed, abi: mainnetAbi, functionName: 'fetchPrice' })),
    ]);
  const [idle, saverRate] = await Promise.all([
    strategy
      ? safe(() => mainnet.readContract({ address: MAINNET.musd, abi: erc20Abi, functionName: 'balanceOf', args: [strategy] }))
      : null,
    saverRate30d(block),
  ]);
  return {
    at: new Date().toISOString(),
    block: block === null ? null : Number(block),
    idleSavings: idle === null ? null : n(idle),
    savingsStrategy: strategy,
    troves: troves === null ? null : Number(troves),
    troveDebt: troveDebt === null ? null : n(troveDebt),
    musdSupply: supply === null ? null : n(supply),
    enclaveDebt: enclave === null ? null : n(enclave),
    bootstrapDebt: bootstrap === null ? null : n(bootstrap),
    wallStable: wallStable === null ? null : n(wallStable, 6),
    wallMusd: wallMusd === null ? null : n(wallMusd),
    safetyBufferBtc: buffer === null ? null : n(buffer),
    veBtcLocked: ve === null ? null : n(ve),
    btcPrice: price === null ? null : n(price),
    saverRate30d: saverRate,
  };
}

/** Open MUSD loans at points in the past, read from archive state. */
export async function troveHistory(): Promise<{ daysAgo: number; troves: number; debt: number }[] | null> {
  const head = await safe(() => mainnet.getBlockNumber());
  if (head === null) return null;
  const secondsPerBlock = 3.874;
  const points = [300, 240, 180, 150, 120, 90, 60, 45, 30, 14, 7, 0];
  const rows = await Promise.all(
    points.map(async (d) => {
      const blockNumber = head - BigInt(Math.floor((d * 86400) / secondsPerBlock));
      const [t, debt] = await Promise.all([
        safe(() => mainnet.readContract({ address: MAINNET.troveManager, abi: mainnetAbi, functionName: 'getTroveOwnersCount', blockNumber })),
        safe(() => mainnet.readContract({ address: MAINNET.troveManager, abi: mainnetAbi, functionName: 'getEntireSystemDebt', blockNumber })),
      ]);
      return t === null || debt === null ? null : { daysAgo: d, troves: Number(t), debt: n(debt) };
    }),
  );
  return rows.every(Boolean) ? (rows as { daysAgo: number; troves: number; debt: number }[]) : null;
}

/** Daily MUSD price from CoinGecko. */
export async function musdPriceHistory(days = 180): Promise<{ t: number; p: number }[] | null> {
  return safe(async () => {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/mezo-usd/market_chart?vs_currency=usd&days=${days}&interval=daily`, {
      next: { revalidate: 21600 },
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { prices: [number, number][] };
    return j.prices.map(([t, p]) => ({ t, p }));
  });
}

export type KeelLoan = {
  id: number;
  owner: string;
  kind: 'BTC' | 'veBTC';
  btc: number;
  nftId: number;
  permanent: boolean | null;
  collateralValue: number;
  debt: number;
  health: number | null;
  borrowLimit: number;
};

export type KeelState = {
  principal: number;
  lent: number;
  liquid: number;
  lendable: number;
  reserve: number;
  yieldOwed: number;
  badDebt: number;
  rate: number;
  saverRate: number;
  pegPremium: number;
  lastMusdPrice: number;
  lastPegStep: number;
  btcPrice: number;
  borrowingOpen: boolean;
  loans: KeelLoan[];
};

const S = deployed.contracts.keelStrategy as `0x${string}`;
const M = deployed.contracts.keelMarket as `0x${string}`;
const VE = deployed.mezo.veBTC as `0x${string}`;

export async function keelState(): Promise<KeelState | null> {
  return safe(async () => {
    const rs = (f: 'principal' | 'lent' | 'liquid' | 'lendable' | 'reserve' | 'yieldOwed' | 'badDebt') =>
      testnet.readContract({ address: S, abi: strategyAbi, functionName: f });
    const rm = <F extends 'currentRate' | 'saverRate' | 'pegPremium' | 'lastMusdPrice' | 'lastPegStep' | 'lastBtcPrice' | 'nextLoanId'>(f: F) =>
      testnet.readContract({ address: M, abi: marketAbi, functionName: f });
    const [principal, lent, liquid, lendable, reserve, yieldOwed, badDebt, rate, saverRate, peg, musdP, pegAt, btcP, next, open] =
      await Promise.all([
        rs('principal'), rs('lent'), rs('liquid'), rs('lendable'), rs('reserve'), rs('yieldOwed'), rs('badDebt'),
        rm('currentRate'), rm('saverRate'), rm('pegPremium'), rm('lastMusdPrice'), rm('lastPegStep'), rm('lastBtcPrice'), rm('nextLoanId'),
        testnet.readContract({ address: M, abi: marketAbi, functionName: 'borrowingOpen' }),
      ]);
    const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
    const loans = (
      await Promise.all(
        ids.map(async (id): Promise<KeelLoan | null> => {
          const [l, pos] = await Promise.all([
            testnet.readContract({ address: M, abi: marketAbi, functionName: 'loans', args: [id] }),
            testnet.readContract({ address: M, abi: marketAbi, functionName: 'position', args: [id] }),
          ]);
          const [owner, kind, , btc, nftId] = l;
          if (kind === 0) return null;
          let permanent: boolean | null = null;
          if (kind === 2) {
            const lk = await safe(() => testnet.readContract({ address: VE, abi: veAbi, functionName: 'locked', args: [nftId] }));
            permanent = lk ? lk[2] : null;
          }
          const health = pos[2] > 10n ** 30n ? null : n(pos[2]);
          return {
            id: Number(id),
            owner,
            kind: kind === 1 ? 'BTC' : 'veBTC',
            btc: n(btc),
            nftId: Number(nftId),
            permanent,
            collateralValue: n(pos[0]),
            debt: n(pos[1]),
            health,
            borrowLimit: n(pos[3]),
          };
        }),
      )
    ).filter((x): x is KeelLoan => x !== null);
    return {
      principal: n(principal), lent: n(lent), liquid: n(liquid), lendable: n(lendable), reserve: n(reserve),
      yieldOwed: n(yieldOwed), badDebt: n(badDebt), rate: n(rate), saverRate: n(saverRate), pegPremium: n(peg),
      lastMusdPrice: n(musdP), lastPegStep: Number(pegAt), btcPrice: n(btcP), borrowingOpen: open, loans,
    };
  });
}

/** MUSD price from the 24h TWAP of the mainnet mUSDC/MUSD wall pool, the
 *  same reading Keel's mainnet peg oracle uses. */
export async function musdWallTwap(): Promise<number | null> {
  return safe(async () => {
    const [cum] = await mainnet.readContract({
      address: MAINNET.wallPool,
      abi: [{ type: 'function', name: 'observe', stateMutability: 'view', inputs: [{ type: 'uint32[]' }], outputs: [{ type: 'int56[]' }, { type: 'uint160[]' }] }] as const,
      functionName: 'observe',
      args: [[86400, 0]],
    });
    const tick = Number(cum[1] - cum[0]) / 86400;
    // token0 = mUSDC (6), token1 = MUSD (18): MUSD per mUSDC in whole units.
    const musdPerUsdc = Math.pow(1.0001, tick) / 1e12;
    return 1 / musdPerUsdc;
  });
}
