import type { Abi, Account, Chain, PublicClient, Transport, WalletClient } from 'viem';

/** Writes a contract call with 30% gas headroom. Keel's interest accrual only
 *  writes storage once time has passed, so an estimate taken in the same
 *  second as the previous action comes out short. */
export async function writeWithHeadroom(
  pub: PublicClient,
  wallet: WalletClient<Transport, Chain | undefined, Account | undefined>,
  req: { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[]; account?: Account | `0x${string}`; chain?: Chain },
) {
  const account = req.account ?? wallet.account;
  if (!account) throw new Error('no account');
  const gas = await pub.estimateContractGas({ ...req, account } as Parameters<PublicClient['estimateContractGas']>[0]);
  return wallet.writeContract({ ...req, account, chain: req.chain ?? wallet.chain, gas: (gas * 13n) / 10n } as Parameters<WalletClient['writeContract']>[0]);
}
