import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployed, mezoTestnet, testnet } from '@/lib/chains';
import { marketAbi, strategyAbi, vaultAbi } from '@/lib/abi';
import { writeWithHeadroom } from '@/lib/send';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MARKET = deployed.contracts.keelMarket as Address;
const STRATEGY = deployed.contracts.keelStrategy as Address;
const VAULT = deployed.contracts.vault as Address;
const PEG_INTERVAL = 7n * 24n * 3600n;

/** Daily keeper run (Vercel cron). Claims savers' yield into the vault, steps
 *  the peg premium once its interval has passed, and reports loans that can be
 *  liquidated. It never liquidates itself: that's left to anyone with MUSD. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const pk = process.env.KEEPER_PK as `0x${string}` | undefined;
  if (!pk) return Response.json({ error: 'KEEPER_PK not set' }, { status: 503 });
  const wallet = createWalletClient({ account: privateKeyToAccount(pk), chain: mezoTestnet, transport: http(mezoTestnet.rpcUrls.default.http[0]) });

  const report: Record<string, unknown> = { at: new Date().toISOString() };

  const owed = await testnet.readContract({ address: STRATEGY, abi: strategyAbi, functionName: 'yieldOwed' });
  if (owed > 0n) {
    const hash = await writeWithHeadroom(testnet, wallet, { address: VAULT, abi: vaultAbi, functionName: 'receiveYieldFromStrategy' });
    const r = await testnet.waitForTransactionReceipt({ hash });
    report.yield = { owed: owed.toString(), hash, status: r.status };
  } else {
    report.yield = 'nothing owed';
  }

  const last = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'lastPegStep' });
  const block = await testnet.getBlock();
  if (block.timestamp >= last + PEG_INTERVAL) {
    const hash = await writeWithHeadroom(testnet, wallet, { address: MARKET, abi: marketAbi, functionName: 'stepPeg' });
    const r = await testnet.waitForTransactionReceipt({ hash });
    report.peg = { hash, status: r.status, premium: (await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'pegPremium' })).toString() };
  } else {
    report.peg = { nextAt: new Date(Number(last + PEG_INTERVAL) * 1000).toISOString() };
  }

  const next = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' });
  const unhealthy: number[] = [];
  for (let id = 1n; id < next; id++) {
    const pos = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'position', args: [id] });
    if (pos[1] > 0n && pos[2] < 10n ** 18n) unhealthy.push(Number(id));
  }
  report.liquidatable = unhealthy;
  return Response.json(report);
}
