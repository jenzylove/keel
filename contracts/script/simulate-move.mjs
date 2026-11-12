// Dry run of moving the deployer's Mezo testnet loan into Keel: signs the
// CloseTrove message and simulates openFromTrove with eth_call. Sends nothing,
// and the signature is not used up (Mezo's nonce only moves on a real close).
//
//   node script/simulate-move.mjs [topUpBtc]
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const viemPath = join(root, '..', 'app', 'node_modules', 'viem');
const v = await import(pathToFileURL(join(viemPath, '_esm', 'index.js')).href);
const { privateKeyToAccount } = await import(pathToFileURL(join(viemPath, '_esm', 'accounts', 'index.js')).href);
const env = Object.fromEntries((existsSync(join(root, '..', '.env')) ? readFileSync(join(root, '..', '.env'), 'utf8') : '').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const RPC = 'https://mezo-testnet.drpc.org';
const chain = v.defineChain({ id: 31611, name: 'mezo-testnet', nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = v.createPublicClient({ chain, transport: v.http(RPC, { retryCount: 5, timeout: 30_000 }) });
const account = privateKeyToAccount(env.DEPLOYER_PK);
const dep = JSON.parse(readFileSync(join(root, '..', 'deployments', 'testnet.json'), 'utf8'));
const MARKET = dep.contracts.keelMarket;
const BOS = '0xD757e3646AF370b15f32EB557F0F8380Df7D639e';
const topUp = v.parseUnits(process.argv[2] ?? '0', 18);

const nonce = await pub.readContract({ address: BOS, abi: v.parseAbi(['function getNonce(address) view returns (uint256)']), functionName: 'getNonce', args: [account.address] });
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
const sig = await account.signTypedData({
  domain: { name: 'BorrowerOperationsSignatures', version: '1', chainId: 31611, verifyingContract: BOS },
  types: { CloseTrove: [{ name: 'borrower', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
  primaryType: 'CloseTrove',
  message: { borrower: account.address, recipient: MARKET, nonce, deadline },
});
const abi = v.parseAbi(['function openFromTrove(uint256 extraBtc, uint256 deadline, bytes sig) returns (uint256)']);
try {
  const { result } = await pub.simulateContract({ address: MARKET, abi, functionName: 'openFromTrove', args: [topUp, deadline, sig], account: account.address });
  const gas = await pub.estimateContractGas({ address: MARKET, abi, functionName: 'openFromTrove', args: [topUp, deadline, sig], account: account.address });
  console.log('OK: would open Keel loan', result, 'gas', gas, 'market', MARKET);
} catch (e) {
  console.log('REVERT:', e.shortMessage, e.metaMessages?.slice(0, 3).join(' | '));
}
