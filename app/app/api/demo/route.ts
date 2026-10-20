import { createWalletClient, http, parseUnits, type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployed, mezoTestnet, testnet } from '@/lib/chains';
import { erc20Abi, marketAbi } from '@/lib/abi';
import { writeWithHeadroom } from '@/lib/send';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MARKET = deployed.contracts.keelMarket as Address;
const MUSD = deployed.mezo.musd as Address;
const BTC = deployed.mezo.btc as Address;
const COLLATERAL = parseUnits('0.0004', 18); // about 33 MUSD of BTC at testnet prices
const BORROW = parseUnits('10', 18); // the testnet minimum loan

/** Runs one real loan on Mezo testnet with the demo wallet and streams each
 *  step as a line of JSON: open with BTC, borrow, repay, close. */
export async function POST() {
  const pk = process.env.DEMO_PK as `0x${string}` | undefined;
  if (!pk) return Response.json({ error: 'Demo wallet is not configured on this deployment.' }, { status: 503 });
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: mezoTestnet, transport: http(mezoTestnet.rpcUrls.default.http[0]) });

  // One run at a time: if the demo wallet already has an open loan, someone
  // else's run is in flight.
  const next = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' });
  for (let id = next - 1n; id > 0n && id > next - 6n; id--) {
    const l = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [id] });
    if (l[0] === account.address && l[1] !== 0) {
      return Response.json({ error: 'Another visitor is running the demo. Try again in about 30 seconds.' }, { status: 429 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const step = async (label: string, hash: Hash) => {
        emit({ label, hash, state: 'sent' });
        const r = await testnet.waitForTransactionReceipt({ hash, timeout: 40_000 });
        emit({ label, hash, state: r.status === 'success' ? 'confirmed' : 'reverted', block: Number(r.blockNumber) });
        if (r.status !== 'success') throw new Error(`${label} reverted`);
        return r;
      };
      try {
        emit({ label: 'Demo wallet', address: account.address, state: 'info' });
        const allowance = await testnet.readContract({ address: MUSD, abi: erc20Abi, functionName: 'allowance', args: [account.address, MARKET] });
        if (allowance < parseUnits('20', 18)) {
          await step('Approve MUSD for repayment', await writeWithHeadroom(testnet, wallet, { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, parseUnits('1000', 18)] }));
        }
        await step('Approve 0.0004 BTC as collateral', await writeWithHeadroom(testnet, wallet, { address: BTC, abi: erc20Abi, functionName: 'approve', args: [MARKET, COLLATERAL] }));
        const opened = await step(
          'Lock 0.0004 BTC and borrow 10 MUSD from idle savings',
          await writeWithHeadroom(testnet, wallet, { address: MARKET, abi: marketAbi, functionName: 'openWithBtc', args: [COLLATERAL, BORROW] }),
        );
        const log = opened.logs.find((l) => l.address.toLowerCase() === MARKET.toLowerCase() && l.topics.length === 3);
        const id = log ? BigInt(log.topics[1]!) : (await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' })) - 1n;
        const pos = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'position', args: [id] });
        emit({ label: `Loan #${id}`, state: 'info', debt: Number(pos[1]) / 1e18, collateralValue: Number(pos[0]) / 1e18, health: Number(pos[2]) / 1e18 });
        await step(`Repay loan #${id} (interest first, to savers)`, await writeWithHeadroom(testnet, wallet, { address: MARKET, abi: marketAbi, functionName: 'repay', args: [id, BORROW + parseUnits('0.01', 18)] }));
        await step(`Close loan #${id}, BTC returned`, await writeWithHeadroom(testnet, wallet, { address: MARKET, abi: marketAbi, functionName: 'close', args: [id] }));
        emit({ state: 'done' });
      } catch (e) {
        emit({ state: 'error', error: (e as Error).message.split('\n')[0] });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
