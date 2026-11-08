import type { Address } from 'viem';

/** Mezo testnet pools a veBTC lock can vote for, with the contracts that pay
 *  its voters. Read from Mezo's own voter (0x72F8…5738): pools(i), gauges,
 *  gaugeToFees, gaugeToBribe, and each reward contract's rewards list. */
export type Pool = { name: string; pool: Address; fees: Address; bribe: Address; tokens: Address[] };

const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const BTC = '0x7b7C000000000000000000000000000000000000';

export const TESTNET_POOLS: Pool[] = [
  {
    name: 'MUSD / BTC',
    pool: '0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9',
    fees: '0xbCF0FAF26Dab69050b004eaE5DC817B522d5d813',
    bribe: '0xD57eEA1BD19c483cEa19cc498575D21F512d4735',
    tokens: [MUSD, BTC],
  },
  {
    name: 'MUSD / mUSDC',
    pool: '0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e',
    fees: '0x4d20a8003F81fDa90275cD3eC3272c26f2831630',
    bribe: '0x7F46db87fb54D1989c797895E147eAE35723915a',
    tokens: [MUSD, '0xe1a26db653708A2AD8F824E92Db9852410e33A59'],
  },
  {
    name: 'mcbBTC / BTC',
    pool: '0xc8BA1027e1D4f9C646B9963Eab89B1e7CF2A476E',
    fees: '0xC147562c74eeC71D8FaD93571ff0Fc238b9ddd3d',
    bribe: '0x6E928BeEDd77F1DBf3b0FDb8b43F7b58678ba0b7',
    tokens: ['0x2278CAAE0009E8a325a346feA573eF23C5756DbF', BTC],
  },
  {
    name: 'MUSD / mT',
    pool: '0x0E6BD7E52e4491320012f8C9E6161cD915BB0D19',
    fees: '0x41Ee5EE27FA3076088497E72DC6B19fe79088BFa',
    bribe: '0xAa8a371f64F1bc444B5e4cb68b00562cCF0f3796',
    tokens: [MUSD, '0xdd8Bf5ACa0579bEE7e6cd20AC7683E279a5f7d48'],
  },
];
