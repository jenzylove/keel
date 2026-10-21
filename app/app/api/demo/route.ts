import { createWalletClient, http, parseUnits, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployed, mezoTestnet, testnet } from '@/lib/chains';
import { erc20Abi, marketAbi } from '@/lib/abi';
import { sendTx } from '@/lib/send';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MARKET = deployed.contracts.keelMarket as Address;
const MUSD = deployed.mezo.musd as Address;
const BTC = deployed.mezo.btc as Address;
const COLLATERAL = parseUnits('0.0004', 18); // about 33 MUSD of BTC at testnet prices
const BORROW = parseUnits('10', 18); // the testnet minimum loan
/** A loan older than this with nothing pending was left by a run the host cut off. */
const STRANDED_AFTER_S = 90;
/** A fresh loan takes about 45 s on testnet. Don't start one after this long,
 *  so open, repay and close all fit inside the 60 s host limit. */
const START_BY_MS = 12_000;

/** Only one run per server instance; across instances the pending-nonce check
 *  below catches a run in flight. */
let running = false;

/** Runs one real loan on Mezo testnet with the demo wallet and streams each
 *  step as a line of JSON: open with BTC, borrow, repay, close. A loan left
 *  open by an interrupted run is repaid and closed first. */
export async function POST(req: Request) {
  // Only this site's page may start a run, not another site's form or script.
  const site = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  if ((site && site !== 'same-origin') || (origin && new URL(origin).host !== req.headers.get('host'))) {
    return Response.json({ error: 'Runs start from the Keel demo page.' }, { status: 403 });
  }
  const pk = process.env.DEMO_PK as `0x${string}` | undefined;
  if (!pk) return Response.json({ error: 'Demo wallet is not configured on this deployment.' }, { status: 503 });
  if (running) return busy();
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain: mezoTestnet, transport: http(mezoTestnet.rpcUrls.default.http[0]) });

  const [latest, pending] = await Promise.all([
    testnet.getTransactionCount({ address: account.address, blockTag: 'latest' }),
    testnet.getTransactionCount({ address: account.address, blockTag: 'pending' }),
  ]);
  if (pending > latest) return busy();

  // Loans the demo wallet still has open: in flight if recent, else stranded.
  const next = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'nextLoanId' });
  const head = await testnet.getBlock();
  const stranded: bigint[] = [];
  for (let id = next - 1n; id > 0n && id > next - 6n; id--) {
    const l = await testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'loans', args: [id] });
    if (l[0] !== account.address || l[1] === 0) continue;
    const opened = await testnet.getBlock({ blockNumber: BigInt(l[2]) });
    if (Number(head.timestamp - opened.timestamp) < STRANDED_AFTER_S) return busy();
    stranded.push(id);
  }

  running = true;
  const started = Date.now();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const emit = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      // The demo wallet numbers its own transactions so a lagging RPC node
      // can't hand back a nonce that's already used.
      let nonce = latest;
      const step = async (label: string, req: Parameters<typeof sendTx>[2], ready?: () => Promise<boolean>) => {
        emit({ label, state: 'sending' });
        const { hash, receipt } = await sendTx(testnet, wallet, req, { nonce: nonce++, ready, deadline: started + 57_000 });
        const ok = receipt.status === 'success';
        emit({ label, hash, state: ok ? 'confirmed' : 'reverted', block: Number(receipt.blockNumber) });
        if (!ok) throw new Error(`${label} reverted`);
        return receipt;
      };
      const debtOf = (id: bigint) => testnet.readContract({ address: MARKET, abi: marketAbi, functionName: 'debtOf', args: [id] });
      const repayAndClose = async (id: bigint, what: string) => {
        const debt = await debtOf(id);
        if (debt > 0n) {
          await step(
            `Repay loan #${id}${what} (interest first, to savers)`,
            { address: MARKET, abi: marketAbi, functionName: 'repay', args: [id, debt + parseUnits('0.01', 18)] },
            async () => (await debtOf(id)) > 0n,
          );
        }
        await step(`Close loan #${id}, BTC returned`, { address: MARKET, abi: marketAbi, functionName: 'close', args: [id] }, async () => (await debtOf(id)) === 0n);
      };
      try {
        emit({ label: 'Demo wallet', address: account.address, state: 'info' });
        const allowance = await testnet.readContract({ address: MUSD, abi: erc20Abi, functionName: 'allowance', args: [account.address, MARKET] });
        if (allowance < parseUnits('20', 18)) {
          await step('Approve MUSD for repayment', { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [MARKET, parseUnits('1000', 18)] });
        }
        for (const id of stranded) await repayAndClose(id, ', left open by an interrupted run');
        if (Date.now() - started > START_BY_MS) {
          throw new Error('Tidied up a loan an interrupted run left open. Run it again for a fresh loan.');
        }
        await step('Approve 0.0004 BTC as collateral', { address: BTC, abi: erc20Abi, functionName: 'approve', args: [MARKET, COLLATERAL] });
        const opened = await step('Lock 0.0004 BTC and borrow 10 MUSD from idle savings', {
          address: MARKET,
          abi: marketAbi,
          functionName: 'openWithBtc',
          args: [COLLATERAL, BORROW],
        });
        const log = opened.logs.find((l) => l.address.toLowerCase() === MARKET.toLowerCase() && l.topics.length === 3);
        if (!log) throw new Error('Loan opened but its id was not in the receipt');
        await repayAndClose(BigInt(log.topics[1]!), '');
        emit({ state: 'done' });
      } catch (e) {
        emit({ state: 'error', error: (e as Error).message.split('\n')[0] });
      } finally {
        running = false;
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}

function busy() {
  return Response.json({ error: 'Another visitor is running the demo. Try again in about 30 seconds.' }, { status: 429 });
}
