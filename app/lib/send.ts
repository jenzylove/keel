import { createPublicClient, encodeFunctionData, http, keccak256 } from 'viem';
import { TESTNET_RPCS } from './chains';
import type { Abi, Account, Chain, Hash, PublicClient, TransactionReceipt, Transport, WalletClient } from 'viem';

/** Mezo's public testnet RPC sits behind a load balancer whose nodes can lag
 *  each other by a block or two. Right after a transaction lands, a read or a
 *  gas estimate can hit a node that hasn't seen it, which once made a repay
 *  look free (an estimate of ~21k gas) and run out of gas on chain.
 *
 *  So every transaction here: waits until the state it depends on is visible,
 *  retries the gas estimate while nodes catch up, never sends below a gas
 *  floor, and waits for its own receipt. */

type Req = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  account?: Account | `0x${string}`;
  chain?: Chain;
};

type Opts = {
  /** Lowest gas limit to send with, whatever the estimate says. */
  floor?: bigint;
  /** Explicit nonce, for a server wallet sending several in a row. */
  nonce?: number;
  /** Resolves true once the state this call depends on is visible. */
  ready?: () => Promise<boolean>;
  /** Give up re-broadcasting after this time (ms since epoch), so a server
   *  run ends with a clear error before its host's time limit. */
  deadline?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Default floors by function, generous for Mezo's cheap gas. */
const FLOORS: Record<string, bigint> = {
  approve: 80_000n,
  openWithBtc: 450_000n,
  openWithVeBTC: 450_000n,
  borrow: 350_000n,
  repay: 300_000n,
  close: 200_000n,
  deposit: 300_000n,
  withdraw: 300_000n,
  receiveYieldFromStrategy: 250_000n,
  stepPeg: 250_000n,
  liquidate: 600_000n,
};

export async function waitUntil(check: () => Promise<boolean>, tries = 12, everyMs = 1500): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      if (await check()) return;
    } catch {}
    await sleep(everyMs);
  }
  throw new Error('The network did not show the previous step in time. Try again in a moment.');
}

export async function sendTx(
  pub: PublicClient,
  wallet: WalletClient<Transport, Chain | undefined, Account | undefined>,
  req: Req,
  opts: Opts = {},
): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  const account = req.account ?? wallet.account;
  if (!account) throw new Error('no account');
  if (opts.ready) await waitUntil(opts.ready);

  let estimate = 0n;
  let lastError: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      estimate = await pub.estimateContractGas({ ...req, account } as Parameters<PublicClient['estimateContractGas']>[0]);
      break;
    } catch (e) {
      lastError = e;
      await sleep(1500);
    }
  }
  if (estimate === 0n) throw lastError instanceof Error ? lastError : new Error('gas estimate failed');

  const floor = opts.floor ?? FLOORS[req.functionName] ?? 200_000n;
  const padded = (estimate * 13n) / 10n;
  const gas = padded > floor ? padded : floor;
  const chain = req.chain ?? wallet.chain;

  // A browser wallet signs and broadcasts itself; just wait patiently.
  if (typeof account === 'string' || account.type !== 'local') {
    const hash = await wallet.writeContract({ ...req, account, chain, gas } as Parameters<WalletClient['writeContract']>[0]);
    return { hash, receipt: await waitReceipt(pub, hash) };
  }

  // A server wallet signs locally, so the same signed transaction can be
  // re-broadcast until it is mined. Mezo is strict about nonce order, and a
  // node that hasn't seen the previous block silently drops the next one.
  const nonce = opts.nonce ?? (await pub.getTransactionCount({ address: account.address, blockTag: 'latest' }));
  await waitUntil(async () => (await pub.getTransactionCount({ address: account.address, blockTag: 'latest' })) >= nonce);
  const data = encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args } as Parameters<typeof encodeFunctionData>[0]);
  const gasPrice = await pub.getGasPrice();
  const raw = await account.signTransaction({ to: req.address, data, gas, gasPrice, nonce, chainId: chain!.id, type: 'legacy' });
  const hash = keccak256(raw);
  // Broadcast to every testnet endpoint, so one lagging or dropping node
  // can't lose it.
  const endpoints = TESTNET_RPCS.map((u) => createPublicClient({ chain, transport: http(u, { timeout: 15_000, retryCount: 0 }) }));
  let lastBroadcastError = '';
  for (let i = 0; i < 20 && (!opts.deadline || Date.now() < opts.deadline); i++) {
    for (const ep of endpoints) {
      try {
        await ep.sendRawTransaction({ serializedTransaction: raw });
      } catch (e) {
        // "already known" or "nonce too low" once it's in: keep checking for the receipt.
        lastBroadcastError = (e as { details?: string }).details ?? (e as Error).message.split('\n')[0];
      }
    }
    const r = await pub.getTransactionReceipt({ hash }).catch(() => null);
    if (r) return { hash, receipt: r };
    await sleep(4000);
    const r2 = await pub.getTransactionReceipt({ hash }).catch(() => null);
    if (r2) return { hash, receipt: r2 };
  }
  throw new Error(`Transaction ${hash} was not mined after repeated broadcasts (${lastBroadcastError})`);
}

async function waitReceipt(pub: PublicClient, hash: Hash): Promise<TransactionReceipt> {
  // A node that hasn't seen the transaction yet answers "not found", so keep asking.
  return pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1500, retryCount: 60, retryDelay: 2000 });
}
