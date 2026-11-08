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

const M_MUSD = '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186';
const M_BTC = '0x7b7C000000000000000000000000000000000000';

/** Mezo mainnet MUSD pools, read the same way from the mainnet voter
 *  (0x4823…1f03). */
export const MAINNET_POOLS: Pool[] = [
  {
    name: 'BTC / MUSD',
    pool: '0x52e604c44417233b6CcEDDDc0d640A405Caacefb',
    fees: '0x0453820c89084E20658068A27EbB90824F1A6C6d',
    bribe: '0x94A9A494872BF7231D8378d0Aef7d32BA552E305',
    tokens: [M_BTC, M_MUSD],
  },
  {
    name: 'mUSDC / MUSD',
    pool: '0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356',
    fees: '0x898bBe9353DC576745724E8C64A02472645561Cd',
    bribe: '0xf2B88Ec68c8fBD5261c5483D1385c46dc7619589',
    tokens: ['0x04671C72Aab5AC02A03c1098314b1BB6B560c197', M_MUSD],
  },
  {
    name: 'MUSD / mUSDT',
    pool: '0x10906a9E9215939561597b4C8e4b98F93c02031A',
    fees: '0x24e2d2EfC692aAB0AE54E0DD8b4C19aabc463c3b',
    bribe: '0x6F3e2aFc81A8FD8e3490DDb032a91d339B371AFB',
    tokens: [M_MUSD, '0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E'],
  },
  {
    name: 'mT / MUSD',
    pool: '0x6688F868E9c81Ee671867E77fBC618BBEA2e9782',
    fees: '0xf702Cd0C9fcfd453165Aef6c84627937695D5A6C',
    bribe: '0xF4C0067b6A38ca5B28fB2c8E1d8A2a20D20d2af3',
    tokens: ['0xaaC423eDC4E3ee9ef81517e8093d52737165b71F', M_MUSD],
  },
  {
    name: 'mSolvBTC / MUSD',
    pool: '0x5Cd2A025C001E07Ae354A4C22C3009908De1aC59',
    fees: '0x0fCF5322DeDBe67B68208199DB234e98EF54c888',
    bribe: '0xA2e2F01F9342582557917D114CaBCCe4A26Bb47f',
    tokens: ['0xa10aD2570ea7b93d19fDae6Bd7189fF4929Bc747', M_MUSD],
  },
];
