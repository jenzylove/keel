import { timingSafeEqual } from 'node:crypto';
import { createWalletClient, http, type Address, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { erc20Abi, mainnetAbi, marketAbi, strategyAbi, vaultAbi } from '@/lib/abi';
import { sendTx } from '@/lib/send';
import { NETWORKS, type Network } from '@/lib/networks';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const PEG_INTERVAL = 7n * 24n * 3600n;

/** Daily keeper run (Vercel cron), on testnet and on the mainnet vault, each
 *  with its own key. Claims savers' yield into the vault, steps the peg
 *  premium once its interval has passed, liquidates unhealthy loans from its
 *  own MUSD float, so savers don't depend on an outside liquidator turning up,
 *  and pays down auto pay loans from their veBTC rewards. Loans it can't
 *  afford are reported. */
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

const KEYS: Record<Network['key'], string> = { testnet: 'KEEPER_PK', mainnet: 'MAINNET_KEEPER_PK' };

export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const report: Record<string, unknown> = { at: new Date().toISOString() };
  const runs = (['testnet', 'mainnet'] as const).map(async (key) => {
    const pk = process.env[KEYS[key]] as `0x${string}` | undefined;
    report[key] = pk ? await run(NETWORKS[key], pk) : { skipped: `${KEYS[key]} not set` };
  });
  await Promise.all(runs);
  return Response.json(report);
}

async function run(net: Network, pk: `0x${string}`) {
  const pub = net.client as PublicClient;
  const MARKET = net.contracts.keelMarket;
  const STRATEGY = net.contracts.keelStrategy;
  const VAULT = net.contracts.vault;
  const MUSD = net.tokens.musd as Address;
  const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain: net.chain, transport: http(net.rpcs[0]) });
  const report: Record<string, unknown> = { keeper: wallet.account.address };

  // Interest is released to savers over a week, so claim only what's released.
  await attempt(report, 'yield', async () => {
    const [owed, held] = await Promise.all([
      pub.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'yieldOwed' }),
      pub.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'unreleased' }).catch(() => 0n),
    ]);
    if (owed <= held) return { owed: owed.toString(), unreleased: held.toString(), claimed: false };
    const { hash, receipt } = await sendTx(pub, wallet, { address: VAULT, abi: vaultAbi, functionName: 'receiveYieldFromStrategy' });
    return { released: (owed - held).toString(), hash, status: receipt.status };
  });

  await attempt(report, 'peg', async () => {
    const [last, block] = await Promise.all([
      pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'lastPegStep' }),
      pub.getBlock(),
    ]);
    if (block.timestamp < last + PEG_INTERVAL) return { nextAt: new Date(Number(last + PEG_INTERVAL) * 1000).toISOString() };
    const { hash, receipt } = await sendTx(pub, wallet, { address: MARKET, abi: marketAbi, functionName: 'stepPeg' });
    const premium = await pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'pegPremium' });
    return { hash, status: receipt.status, premium: premium.toString() };
  });

  // Judge health at a fresh BTC price, not the one last stored by a
  // transaction. Reads are batched into one multicall.
  let unhealthy: { id: bigint; debt: bigint; value: bigint }[] = [];
  await attempt(report, 'health', async () => {
    const [feed, next, eta] = await Promise.all([
      pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'priceFeed' }),
      pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' }),
      pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'pendingEta' }),
    ]);
    const price = await pub.readContract({ address: feed, abi: mainnetAbi, functionName: 'fetchPrice' });
    const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
    const positions = await Promise.all(
      ids.map((id) => pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'positionAt', args: [id, price] })),
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
        pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [p.id] }),
        pub.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.account.address] }),
      ]);
      const isVe = loan[1] === 2;
      const need = isVe ? p.value : p.debt;
      if (balance < need) {
        done.push({ id: Number(p.id), skipped: 'float too small', need: need.toString(), have: balance.toString() });
        continue;
      }
      const allowance = await pub.readContract({
        address: MUSD, abi: erc20Abi, functionName: 'allowance', args: [wallet.account.address, MARKET],
      });
      if (allowance < need) {
        await sendTx(pub, wallet, { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, need] });
      }
      const { hash, receipt } = await sendTx(pub, wallet, {
        address: MARKET, abi: marketAbi, functionName: 'liquidate', args: [p.id, need],
      });
      done.push({ id: Number(p.id), kind: isVe ? 'veBTC' : 'BTC', hash, status: receipt.status });
    }
    return done;
  });
  // Loans whose borrower turned on auto pay: claim what the veBTC earned in
  // every Mezo pool, and the MUSD among it pays the loan, interest first.
  await attempt(report, 'autoPay', async () => {
    const next = await pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' });
    const fees = net.pools.map((p) => p.fees);
    const bribes = net.pools.map((p) => p.bribe);
    const tokens = net.pools.map((p) => p.tokens);
    const done: unknown[] = [];
    for (let i = 1n; i < next; i++) {
      const [loan, on] = await Promise.all([
        pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [i] }),
        pub.readContract({ address: MARKET, abi: marketAbi, functionName: 'autoPay', args: [i] }),
      ]);
      if (!on || loan[1] !== 2) continue;
      for (const [kind, rewards] of [['fees', fees], ['bribes', bribes]] as const) {
        try {
          const { hash, receipt } = await sendTx(pub, wallet, {
            address: MARKET, abi: marketAbi, functionName: 'claimRewardsToDebt', args: [i, rewards, tokens, kind === 'bribes'],
          });
          done.push({ id: Number(i), kind, hash, status: receipt.status });
        } catch (e) {
          done.push({ id: Number(i), kind, error: (e as Error).message.split('\n')[0].slice(0, 160) });
        }
      }
    }
    return done;
  });
  return report;
}
