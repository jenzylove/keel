import { timingSafeEqual } from 'node:crypto';
import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployed, mezoTestnet, testnet } from '@/lib/chains';
import { erc20Abi, mainnetAbi, marketAbi, strategyAbi, vaultAbi } from '@/lib/abi';
import { sendTx } from '@/lib/send';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MARKET = deployed.contracts.keelMarket as Address;
const STRATEGY = deployed.contracts.keelStrategy as Address;
const VAULT = deployed.contracts.vault as Address;
const PEG_INTERVAL = 7n * 24n * 3600n;

const MUSD = deployed.mezo.musd as Address;

/** Daily keeper run (Vercel cron). Claims savers' yield into the vault, steps
 *  the peg premium once its interval has passed, and liquidates unhealthy
 *  loans from its own MUSD float, so savers don't depend on an outside
 *  liquidator turning up. Loans it can't afford are reported. */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Runs one step and records its outcome, so one failure doesn't hide the rest. */
async function attempt(report: Record<string, unknown>, key: string, f: () => Promise<unknown>) {
  try {
    report[key] = await f();
  } catch (e) {
    report[key] = { error: (e as Error).message.split('\n')[0] };
  }
}

export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const pk = process.env.KEEPER_PK as `0x${string}` | undefined;
  if (!pk) return Response.json({ error: 'KEEPER_PK not set' }, { status: 503 });
  const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain: mezoTestnet, transport: http(mezoTestnet.rpcUrls.default.http[0]) });
  const report: Record<string, unknown> = { at: new Date().toISOString() };

  // Interest is released to savers over a week, so claim only what's released.
  await attempt(report, 'yield', async () => {
    const [owed, held] = await Promise.all([
      testnet.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'yieldOwed' }),
      testnet.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'unreleased' }).catch(() => 0n),
    ]);
    if (owed <= held) return { owed: owed.toString(), unreleased: held.toString(), claimed: false };
    const { hash, receipt } = await sendTx(testnet, wallet, { address: VAULT, abi: vaultAbi, functionName: 'receiveYieldFromStrategy' });
    return { released: (owed - held).toString(), hash, status: receipt.status };
  });

  await attempt(report, 'peg', async () => {
    const [last, block] = await Promise.all([
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'lastPegStep' }),
      testnet.getBlock(),
    ]);
    if (block.timestamp < last + PEG_INTERVAL) return { nextAt: new Date(Number(last + PEG_INTERVAL) * 1000).toISOString() };
    const { hash, receipt } = await sendTx(testnet, wallet, { address: MARKET, abi: marketAbi, functionName: 'stepPeg' });
    const premium = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'pegPremium' });
    return { hash, status: receipt.status, premium: premium.toString() };
  });

  // Judge health at a fresh BTC price, not the one last stored by a
  // transaction. Reads are batched into one multicall.
  let unhealthy: { id: bigint; debt: bigint; value: bigint }[] = [];
  await attempt(report, 'health', async () => {
    const [feed, next, eta] = await Promise.all([
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'priceFeed' }),
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' }),
      testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'pendingEta' }),
    ]);
    const price = await testnet.readContract({ address: feed, abi: mainnetAbi, functionName: 'fetchPrice' });
    const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
    const positions = await Promise.all(
      ids.map((id) => testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'positionAt', args: [id, price] })),
    );
    unhealthy = ids
      .map((id, i) => ({ id, value: positions[i][0], debt: positions[i][1], health: positions[i][2] }))
      .filter((p) => p.debt > 0n && p.health < 10n ** 18n);
    return {
      btcPrice: price.toString(),
      pendingConfigEta: eta.toString(),
      liquidatable: unhealthy.map((p) => Number(p.id)),
    };
  });

  // Liquidate from the keeper's float. A BTC loan takes at most its debt, and
  // the market stops the payment at what the collateral covers. A veBTC loan
  // costs the NFT's value less the bonus, so it needs that much MUSD on hand.
  await attempt(report, 'liquidations', async () => {
    const done: unknown[] = [];
    for (const p of unhealthy) {
      const [loan, balance] = await Promise.all([
        testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [p.id] }),
        testnet.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.account.address] }),
      ]);
      const isVe = loan[1] === 2;
      const need = isVe ? p.value : p.debt;
      if (balance < need) {
        done.push({ id: Number(p.id), skipped: 'float too small', need: need.toString(), have: balance.toString() });
        continue;
      }
      const allowance = await testnet.readContract({
        address: MUSD, abi: erc20Abi, functionName: 'allowance', args: [wallet.account.address, MARKET],
      });
      if (allowance < need) {
        await sendTx(testnet, wallet, { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, need] });
      }
      const { hash, receipt } = await sendTx(testnet, wallet, {
        address: MARKET, abi: marketAbi, functionName: 'liquidate', args: [p.id, need],
      });
      done.push({ id: Number(p.id), kind: isVe ? 'veBTC' : 'BTC', hash, status: receipt.status });
    }
    return done;
  });
  return Response.json(report);
}
