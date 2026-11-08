import type { Address, Chain, PublicClient } from 'viem';
import { MAINNET_RPCS, TESTNET_RPCS, mainnet, mezoMainnet, mezoTestnet, testnet } from './chains';
import { MAINNET_POOLS, TESTNET_POOLS, type Pool } from './pools';
import testnetDeployment from './testnet.json';
import mainnetDeployment from './mainnet.json';

export type NetKey = 'testnet' | 'mainnet';

/** Everything the app needs to run on one Mezo network. The testnet entry is
 *  the free default; mainnet is Keel's small opt in vault with real funds. */
export type Network = {
  key: NetKey;
  label: string;
  chain: Chain;
  client: PublicClient;
  /** Public RPCs for reads and receipt checks, in order. */
  rpcs: string[];
  /** RPCs handed to a wallet that doesn't know the chain yet. */
  walletRpcs: string[];
  explorer: string;
  txUrl: (hash: string) => string;
  addressUrl: (a: string) => string;
  contracts: { vault: Address; keelStrategy: Address; keelMarket: Address };
  tokens: { musd: Address; btc: Address; veBTC: Address };
  pools: Pool[];
  faucet: string | null;
  hasDemo: boolean;
  /** How much of savings Keel may lend, in words, and what stays liquid. */
  lendShare: string;
  liquidPct: number;
  /** "test BTC" on testnet, "BTC" on mainnet. */
  btcLabel: string;
  /** Below this a wallet is shown how to get BTC: on testnet too little to
   *  lock anything useful, on mainnet too little to pay gas. */
  lowBtc: bigint;
};

const explorerOf = (base: string) => ({
  explorer: base,
  txUrl: (hash: string) => `${base}/tx/${hash}`,
  addressUrl: (a: string) => `${base}/address/${a}`,
});

export const NETWORKS: Record<NetKey, Network> = {
  testnet: {
    key: 'testnet',
    label: 'Testnet',
    chain: mezoTestnet,
    client: testnet as PublicClient,
    rpcs: TESTNET_RPCS,
    // Mezo's own RPC first: wallets use the first one, and dRPC drops some calls.
    walletRpcs: ['https://rpc.test.mezo.org', 'https://mezo-testnet.drpc.org'],
    ...explorerOf('https://explorer.test.mezo.org'),
    contracts: {
      vault: testnetDeployment.contracts.vault as Address,
      keelStrategy: testnetDeployment.contracts.keelStrategy as Address,
      keelMarket: testnetDeployment.contracts.keelMarket as Address,
    },
    tokens: {
      musd: testnetDeployment.mezo.musd as Address,
      btc: testnetDeployment.mezo.btc as Address,
      veBTC: testnetDeployment.mezo.veBTC as Address,
    },
    pools: TESTNET_POOLS,
    faucet: 'https://faucet.test.mezo.org',
    hasDemo: true,
    lendShare: 'a fifth',
    liquidPct: 80,
    btcLabel: 'test BTC',
    lowBtc: 1_000_000_000_000_000n, // 0.001 BTC
  },
  mainnet: {
    key: 'mainnet',
    label: 'Mainnet',
    chain: mezoMainnet,
    client: mainnet as PublicClient,
    rpcs: MAINNET_RPCS,
    walletRpcs: ['https://mainnet.mezo.public.validationcloud.io', 'https://rpc-http.mezo.boar.network'],
    ...explorerOf('https://explorer.mezo.org'),
    contracts: {
      vault: mainnetDeployment.contracts.vault as Address,
      keelStrategy: mainnetDeployment.contracts.keelStrategy as Address,
      keelMarket: mainnetDeployment.contracts.keelMarket as Address,
    },
    tokens: {
      musd: mainnetDeployment.mezo.musd as Address,
      btc: mainnetDeployment.mezo.btc as Address,
      veBTC: mainnetDeployment.mezo.veBTC as Address,
    },
    pools: MAINNET_POOLS,
    faucet: null,
    hasDemo: false,
    lendShare: 'half',
    liquidPct: 50,
    btcLabel: 'BTC',
    lowBtc: 10_000_000_000_000n, // 0.00001 BTC
  },
};

export const DEFAULT_NET: NetKey = 'testnet';

export const isNetKey = (v: unknown): v is NetKey => v === 'testnet' || v === 'mainnet';


