import { createPublicClient, defineChain, fallback, http } from 'viem';
import deployment from './testnet.json';

export const mezoMainnet = defineChain({
  id: 31612,
  name: 'Mezo',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://mezo.drpc.org'] } },
  blockExplorers: { default: { name: 'Mezo Explorer', url: 'https://explorer.mezo.org' } },
});

export const mezoTestnet = defineChain({
  id: 31611,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://mezo-testnet.drpc.org', 'https://rpc.test.mezo.org'] } },
  blockExplorers: { default: { name: 'Mezo Testnet Explorer', url: 'https://explorer.test.mezo.org' } },
  testnet: true,
});

/** Mainnet reads try each public RPC in turn. dRPC's free tier drops some
 *  calls from shared hosts, which once left the live page with blanks. Reads
 *  are batched into Multicall3 (deployed on both chains), so a page costs a
 *  few requests, not dozens. */
const MAINNET_RPCS = [
  process.env.MEZO_MAINNET_RPC,
  'https://mezo.drpc.org',
  'https://rpc-http.mezo.boar.network',
  'https://mainnet.mezo.public.validationcloud.io',
].filter((u): u is string => Boolean(u));

export const mainnet = createPublicClient({
  chain: mezoMainnet,
  batch: { multicall: true },
  transport: fallback(MAINNET_RPCS.map((u) => http(u, { timeout: 12_000, retryCount: 2 }))),
});

/** Testnet reads go to dRPC first. Mezo's own public testnet RPC balances
 *  across nodes that disagree: measured on 2026-10-21, 5 of 12 receipt
 *  requests for a mined transaction came back null. It stays as a fallback. */
export const TESTNET_RPCS = ['https://mezo-testnet.drpc.org', 'https://rpc.test.mezo.org'];

export const testnet = createPublicClient({
  chain: mezoTestnet,
  batch: { multicall: true },
  transport: fallback(TESTNET_RPCS.map((u) => http(u, { timeout: 20_000, retryCount: 1 }))),
});

export const deployed = deployment;

export const MAINNET = {
  musd: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186',
  smusd: '0xb4D498029af77680cD1eF828b967f010d06C51CC',
  troveManager: '0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',
  priceFeed: '0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88',
  enclaveDebtManager: '0x2c5e9afbb670c4a61ac2dcad62c258ee2391389a',
  pcv: '0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993',
  safetyBuffer: '0xB0C9A818A4E5d9184E5C9108a144E607dEa90100',
  wallPool: '0xCC372B7E15535aB225fe17c1075831D38ef7aC1a',
  musdc: '0x04671C72Aab5AC02A03c1098314b1BB6B560c197',
  veBTC: '0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279',
  multisig: '0x98D8899c3030741925BE630C710A98B57F397C7a',
} as const;

export const txUrl = (hash: string, net: 'testnet' | 'mainnet' = 'testnet') =>
  `${net === 'testnet' ? 'https://explorer.test.mezo.org' : 'https://explorer.mezo.org'}/tx/${hash}`;

export const addressUrl = (a: string, net: 'testnet' | 'mainnet' = 'testnet') =>
  `${net === 'testnet' ? 'https://explorer.test.mezo.org' : 'https://explorer.mezo.org'}/address/${a}`;
