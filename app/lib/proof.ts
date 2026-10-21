/** Every claim on /proof, with the transaction or test that proves it. Kept in
 *  step with docs/proof/testnet-runs.md. */
export type ProofRow = { what: string; hash?: string; note?: string };
export type ProofGroup = { title: string; how: string; rows: ProofRow[] };

export const forkTests: { name: string; output: string }[] = [
  {
    name: 'One governance call moves the idle savings',
    output:
      'sMUSD owner (Mezo multisig): 0x98D8899c3030741925BE630C710A98B57F397C7a\nMUSD moved out of IdleStrategy: 7382416\nlendable at 20% cap: 1476483',
  },
  { name: 'Borrower interest reaches savers', output: 'saver deposits 10,000 MUSD → withdraws 10,060.87 after a borrower repays 1M + 50k interest' },
  { name: 'Withdrawals stay open at max lending', output: 'cap fully lent (1,476,483) → saver withdraws 1M → 5,905,933 still liquid' },
  { name: 'Keel reads mainnet veBTC', output: 'BTC locked in #6114 (an Enclave lock): 500' },
  { name: 'Peg oracle reads MUSD on mainnet', output: '24h average of the mUSDC/MUSD wall: $0.991043 · basic pool: $0.989539' },
];

/** From docs/eval/RESULTS.md; rerun with `python3 eval/answer_key.py`. */
export const evalRun = {
  headline: '235 checks against an answer key computed separately. The first run missed 2; they exposed a real bug, now fixed, and the rerun matches all 235 to the wei.',
  rows: [
    { what: 'Real MUSD price, 26 weeks: savers receive (peg term on / off)', result: '2,720.29 / 2,270.94 MUSD' },
    { what: 'Borrow rate by October (on / off)', result: '7.72% / 5.00%' },
    { what: 'BTC loan: a year of interest, health, liquidation with 5% bonus', result: 'exact' },
    { what: 'Permanent veBTC sold at 10% off, surplus to the borrower', result: 'exact' },
    {
      what: 'veBTC sold below its debt. First run: uncollected interest was paid out as yield and booked again as loss. Fixed: principal first when a loan is written off',
      result: 'missed → fixed',
    },
  ],
};

export const testnetGroups: ProofGroup[] = [
  {
    title: 'Current deployment (2026-10-21)',
    how: 'A fresh vault copy and Keel contracts with the review fixes: liquidation payments stop at what the collateral covers, and the keeper liquidates from its own float. The groups below ran on earlier deployments.',
    rows: [
      { what: 'Vault copy deployed behind a proxy, owned by the deployer', hash: '0x839eaac3b68b72d870797ddd527c985b20ec1e5a5b8a743ac888535e695ef62d' },
      { what: 'KeelMarket deployed', hash: '0x48ebd739b0d7234c3c1ad9359d7c8c0ea88fc219107eda289df8c7a1501a7ec0' },
      { what: 'The vault plugs in KeelStrategy with setStrategy', hash: '0x8f519e6950380fe3289b1b3c07a4e3c3bf6d50858c1dc04402de5610a212d282' },
      { what: 'A saver deposits 1,500 MUSD, allocated straight into Keel', hash: '0x99b25eaec6de78f73109439a0ceaf3509623b174f41648ba121c382e71c641b7' },
      { what: 'BTC loan #1: 0.001 BTC, borrow 20 MUSD', hash: '0xf293d362e7f35659a61d842d12b0705d091e9b60f1e4d22009877b1cd07c3ed5' },
      { what: 'Loan #1 borrows 21 more, to 49% of its collateral', hash: '0x4ba856865dc4cc3fc54c081c80325a2da862adfa217ffd063713ba415eccb645' },
      { what: 'The vault owner proposes a tighter BTC setting (liquidate at 45%)', hash: '0xc477a8b3bc2f880eb052a4ac934e40b7794252b5ececce25bd8d26302aad9af4' },
      { what: 'Applied after the 600 s delay: loan #1 health 0.93, open to liquidation', hash: '0xfac142edc56b6fd38f5df43d629dcdc46a753bb4d83f3996076dddd6060cdcda' },
      { what: 'Live-site demo: open 10 MUSD on 0.0004 BTC', hash: '0x88cdaacf1069255319d70620903d4dc79ef6ea385bc047b1fd65731322d5c79b' },
      { what: 'Live-site demo: repay (interest first, to savers)', hash: '0x7aa889a18223655d5ac7e34867216d88dcd7ae4eee1160270a141ec4e16d8227' },
      { what: 'Live-site demo: close, BTC returned', hash: '0xacfec9b61fa8d82112efcaddbd8ba749afc33aef85112862625fb3e8a08cadb0' },
    ],
  },
  {
    title: 'Hardened contracts, previous deployment',
    how: "Keel is governed by the savings vault's owner, read live, and config changes wait a fixed delay (600 s on testnet, 48 h proposed for mainnet). The vault moved its savings to these contracts with setStrategy.",
    rows: [
      { what: 'Vault migrates 1,400 MUSD to the hardened strategy', hash: '0x37259e12bab7b3ff5afc4ac09d51b2aa31445ace685fad04a275cecb0c4131ce' },
      { what: 'Live-site demo: open 10 MUSD on 0.0004 BTC', hash: '0x753bd80d83f74255607f766252428b5b34835715466009043cd5479612a9caa0' },
      { what: 'Live-site demo: repay (interest first, to savers)', hash: '0xe901ba2c15577bca8c3a0372cf29428d5b86f6611f47668000b8026511aadb98' },
      { what: 'Live-site demo: close, BTC returned', hash: '0x8d556dcd4509ba6e38e73738f59b9f26dd95ea17acbc27762dc93421c3989f84' },
      { what: 'Keeper claims savers’ yield into the vault', hash: '0xd588080de0920cc5cc85fdbdd6a4cc2e3b5a2d972eb18999927898c961e462db' },
      { what: 'Keeper steps the peg premium, 0 → 1%', hash: '0x5849848539fae0227f7f67da130b4e415a3b86096eea5655363a5c42e7c5ac13' },
      { what: 'A non-owner proposes a config: reverts', hash: '0xfe851d8a250551c2078f8f195bc011894b482f776c404d4866c4d262cf7343f0' },
      { what: 'The vault owner proposes a config; applying it early is refused', hash: '0xb873efbe5158298a32f1b884b4da8f8e9782ff99fe4bccf1c49ec6d7a806c072' },
      { what: 'After the delay, anyone applies it', hash: '0x9ba40cd425cdd15b875f27bc569c165c7f3fc187c6118de215c0d77a0b616181' },
    ],
  },
  {
    title: 'Savings vault → Keel',
    how: "Our own copy of Mezo's verified MUSDSavingsRate contract, which we own, so setStrategy can run on testnet.",
    rows: [
      { what: 'Savings vault deployed behind a proxy', hash: '0x832b6fe8f50f5a2106823fafd128baee2407309dd515b0b6b99894c0ff16fe2a' },
      { what: 'KeelStrategy plugged in with setStrategy', hash: '0x3564f948658940a95fee70d3cee6d6451cc4c30d5aacb9546e4d4623d44e3486' },
      { what: 'Saver deposits 1,500 MUSD, allocated straight to Keel', hash: '0x3fabc2249706e970312000b42e518aff2fd019c03fe80ccb790eb987e42b3596' },
      {
        what: 'Live migration: 1,500 MUSD moves from one KeelStrategy to the next, the same call Mezo would make on mainnet',
        hash: '0x10bccb32ec2709499f347c2bd5e9f40a7e32737a491bb47f06b0c47c0a7b3436',
      },
    ],
  },
  {
    title: 'Loans outside redemptions',
    how: 'Real loans in KeelMarket, priced by the MUSD system’s own testnet PriceFeed.',
    rows: [
      { what: 'Permanent veBTC #393 → 30 MUSD (limit 40%)', hash: '0x7af06047ae2067dd9385be3b51a71db790ea32a6aca17b73e68b98ad796c07d8' },
      { what: 'Timed veBTC #394 → 20 MUSD (limit 45%)', hash: '0x0a27d0415e8e0581ac62c531f36e49a2c5877c85025d355d1be960a96cbcf08d' },
      { what: 'Borrower votes with #394 through Keel', hash: '0xf6e2abe69a325d612ee21bf1e3dc9cf9da08b753964ba17442c846b01f9c2d60' },
      { what: '0.003 BTC → 110 MUSD', hash: '0xa05b1a2be696fcaa3cf0c4038d0422109fc9ade6c92bbe858599d989a412e557' },
      { what: 'Repay in full: interest first, to savers', hash: '0xd4cfb053c5a1d26666c3e2bfb1c0b7849068506ca766e7a6f1c5d90fe69953e3' },
    ],
  },
  {
    title: 'Liquidation',
    how: "Testnet's BTC price can't be moved, so the admin tightened the risk settings to push a loan over its line, then put them back. The liquidations are real, run by a separate wallet.",
    rows: [
      { what: 'Tighten BTC settings to 30% / 40%', hash: '0x57e7eef352dfa0e6d9906481e320011746f17fb44585500a50b6ee75aee85058' },
      { what: 'Liquidator repays 55 MUSD, receives 0.000696 BTC (55 × 1.05 ÷ 82,991)', hash: '0xe8033b84608d54eec88de9e4afb7ff87b85761c444e48a01bd3267bbde237f88' },
      { what: 'Tighten permanent-veBTC settings to 20% / 30%', hash: '0x95393889e77fcdb0445603384e2ee0c03f287d46db79c472313939c9c22471d1' },
      {
        what: 'Liquidator buys veBTC #393 at a 10% discount; 44.72 MUSD surplus goes back to the borrower',
        hash: '0xa1770693b1bdb7456997aa48b0ef6a4e61dbcedf53f937c8ac27e195fac82582',
      },
      { what: 'Settings restored', hash: '0x081f3eee41af421fef95c6330f27e4fb6a9bd1c8eed765cfa78b236e7ebe0e3f' },
    ],
  },
  {
    title: 'Throttle, peg rate, yield',
    how: "The throttle watches the mUSDC side of a pool. The peg step reads the testnet pool's time-weighted price, which is a test price ($0.80), not the real market.",
    rows: [
      { what: 'Throttle floor set above the pool’s mUSDC: borrowing pauses', hash: '0x8697ad19f777e2184e03a3085ac0626027e3fe7d897de132aedb4cdd812a3d96' },
      { what: 'Repay still works while paused', hash: '0x305fa3b9eee26a809ff2ea544b81fdfece564f6751d43f726878a3870782f44e' },
      { what: 'Peg step: rate moves one 1% step, 3% → 4%', hash: '0xf50e07bad16b85eb50bb8caa4a32fe7564fb7bdff24dd3afdf038a6dd00532cd' },
      { what: 'Vault claims Keel’s yield', hash: '0x2416a4f79df9c41fa9a1169a15bc3ebe0b4e19cb22743de03928d8b9dead906e' },
      { what: 'Saver withdraws 100 sMUSD, receives 100.0000371 MUSD', hash: '0x244b706632850dc86fd2fc9f684c7b5e58f9449bafbd52882d5d4d099b9f93d8' },
    ],
  },
];

export const notYet = [
  'Forwarding a gauge reward to a borrower is unit-tested, but testnet gauges have no fees or bribes to claim yet.',
  "The mainnet peg oracle (the wall pool's average) is proven on a mainnet fork. On testnet the same mechanism reads a test pool.",
];
