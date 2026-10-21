# Testnet runs

Real transactions on Mezo testnet (chain 31611). Explorer: `https://explorer.test.mezo.org/tx/<hash>`.
Addresses are in `deployments/testnet.json`. The deployer and borrower is `0x471F…1523`, and the liquidator is a separate wallet.

## 1. Savings vault → Keel

| Step | Transaction |
|---|---|
| Our copy of Mezo's verified `MUSDSavingsRate` deployed behind a proxy | `0x832b6fe8f50f5a2106823fafd128baee2407309dd515b0b6b99894c0ff16fe2a` |
| First KeelStrategy plugged in with `setStrategy` | `0x3564f948658940a95fee70d3cee6d6451cc4c30d5aacb9546e4d4623d44e3486` |
| Saver deposits 1,500 MUSD, which is allocated straight into KeelStrategy | `0x3fabc2249706e970312000b42e518aff2fd019c03fe80ccb790eb987e42b3596` |
| **Live migration:** the vault moves its 1,500 MUSD from the first KeelStrategy to the current one with `setStrategy` (the call Mezo's multisig would make on mainnet) | `0x10bccb32ec2709499f347c2bd5e9f40a7e32737a491bb47f06b0c47c0a7b3436` |

## 2. BTC loan, first market (since replaced)

| Step | Transaction |
|---|---|
| Open with 0.003 BTC, borrow 100 MUSD | `0x9f322dde6717513e5928c3964dc56d1d4c96d438cae80435e237e67b3525627b` |
| Repay in full (interest paid first, reaches the strategy as savers' yield) | `0xd4cfb053c5a1d26666c3e2bfb1c0b7849068506ca766e7a6f1c5d90fe69953e3` |
| Close, BTC returned | `0x7bdaedcc07c1068ca743839e835b5d9e567bb72b7b69fc57437e63ad475505d9` |
| Reserve released to savers before migrating | `0xf2f3bb3205a342664db54ebe223e030052fd87779c4215bd482cebf123583c96` |

## 3. Current market

| Step | Transaction |
|---|---|
| Loan 1: **permanent veBTC #393**, borrow 30 MUSD (limit 40% = 33.2) | `0x7af06047ae2067dd9385be3b51a71db790ea32a6aca17b73e68b98ad796c07d8` |
| Loan 2: **timed veBTC #394**, borrow 20 MUSD (limit 45% = 37.4) | `0x0a27d0415e8e0581ac62c531f36e49a2c5877c85025d355d1be960a96cbcf08d` |
| Borrower **votes with #394 through Keel** (MUSD/BTC pool gauge, weight 5.0e14) | `0xf6e2abe69a325d612ee21bf1e3dc9cf9da08b753964ba17442c846b01f9c2d60` |
| Loan 3: 0.003 BTC, borrow 110 MUSD | `0xa05b1a2be696fcaa3cf0c4038d0422109fc9ade6c92bbe858599d989a412e557` |

## 4. Liquidation (triggered by tightening risk settings)

Testnet's BTC price can't be moved, so the admin tightened the BTC loan settings to push loan 3 over its threshold, then put them back. The liquidation itself is real.

| Step | Transaction |
|---|---|
| A liquidation attempt while healthy is refused (`StillHealthy`) | not sent: rejected in simulation |
| Admin sets BTC risk to 30% / 40% / 5% bonus | `0x57e7eef352dfa0e6d9906481e320011746f17fb44585500a50b6ee75aee85058` |
| Liquidator repays 55 MUSD and receives **0.000696 BTC** (= 55 × 1.05 ÷ 82,991) | `0xe8033b84608d54eec88de9e4afb7ff87b85761c444e48a01bd3267bbde237f88` |
| Admin restores BTC risk to 50% / 65% / 5% | `0x2118255bbed2616617adcdf74db9f6294b3172607b18d6a958f182c0c4526ac9` |

## 5. veBTC liquidation (triggered by tightening risk settings)

| Step | Transaction |
|---|---|
| Admin sets permanent-veBTC risk to 20% / 30% / 10% bonus | `0x95393889e77fcdb0445603384e2ee0c03f287d46db79c472313939c9c22471d1` |
| Liquidator buys #393 for its value less 10% (74.71 MUSD): 30 MUSD clears the debt and **44.72 MUSD surplus goes to the borrower**. The NFT moves to the liquidator even though it voted this epoch | `0xa1770693b1bdb7456997aa48b0ef6a4e61dbcedf53f937c8ac27e195fac82582` |
| Admin restores 40% / 55% / 10% | `0x081f3eee41af421fef95c6330f27e4fb6a9bd1c8eed765cfa78b236e7ebe0e3f` |

## 6. Throttle

Watches the mUSDC side of the testnet mUSDC/MUSD pool (`0x525F…Dc3e`).

| Step | Transaction |
|---|---|
| Floor set just above the pool's mUSDC balance, so `borrowingOpen()` is false | `0x8697ad19f777e2184e03a3085ac0626027e3fe7d897de132aedb4cdd812a3d96` |
| Borrow refused with `BorrowingPaused()` (`0xd6767de2`) | not sent: rejected in simulation |
| Repay still works while paused | `0x305fa3b9eee26a809ff2ea544b81fdfece564f6751d43f726878a3870782f44e` |
| Throttle off, then borrowing works again | `0x7f91735ff4dfc66815b72f8161d273be99d6c5a96a061f63c25af94575674988`, `0x94c245109a9bee3f30def1c97fd07059f720c7032781189e3ee50f8347434cdb` |

An earlier run pointed the throttle at the pool's MUSD side by mistake (`0x8a82…358c`), and its repay check failed for a missing approval. That run is superseded by this one.

## 7. Yield reaches a saver

| Step | Transaction |
|---|---|
| Vault claims KeelStrategy's yield (`receiveYieldFromStrategy`) | `0x2416a4f79df9c41fa9a1169a15bc3ebe0b4e19cb22743de03928d8b9dead906e` |
| Saver withdraws 100 sMUSD and receives 100.0000371 MUSD. The extra is borrower interest from the minutes the loans were open | `0x244b706632850dc86fd2fc9f684c7b5e58f9449bafbd52882d5d4d099b9f93d8` |

## 8. Peg oracle and rate step (current market `0x6CD3…8579`)

The market was replaced to drop Pyth. Every open loan was repaid and closed first (`0x0811…a2fe`, `0x1a15…c3f5`, `0xeb37…c7b9`, `0xe93f…37d3be`), then the strategy accepted the new market.

| Step | Transaction |
|---|---|
| Testnet peg oracle reads MUSD at $0.8006 from the testnet pool (a test price) | read: `musdPrice()` on `0x003f…97e8` |
| `stepPeg`: premium moves one 1% step toward the 4% target, so the borrow rate goes from 3.00% to 4.00% | `0xf50e07bad16b85eb50bb8caa4a32fe7564fb7bdff24dd3afdf038a6dd00532cd` |
| A second step straight after is refused (`PegStepTooSoon`) | not sent: rejected in simulation |
| Demo loans reopened: veBTC #394 (20 MUSD), 0.003 BTC (100 MUSD) | `0xb2d2de9d53659ae2b0e72c7569658f2eb66ad88fcb4d18b8e9b0890ac38877b6`, `0xc8b8513243742ec025a7882bb39a90e233fa4d75ffc8c7ecad34df0504708185` |

## 9. Hardened contracts (current: strategy `0xC1DF…0abda`, market `0xae2c…B9Ee`)

Governance is now the vault's owner, read live. Config changes wait 600 s on testnet (the mainnet proposal is 48 h). The old market's loans were repaid and closed (`0xe6f7…c919`, `0x8bce…0b92`, `0x35f7…7dad`, `0x4fff…f574`), and its reserve was released to savers (`0x498b…3606`). Then:

| Step | Transaction |
|---|---|
| Hardened KeelStrategy deployed | `0x1075e03d937af4129102605d1f720a98371cd35911c6f31ac35ddbe4351ee2c3` |
| Hardened KeelMarket deployed (with config delay) | `0xa7940efb96113ff341f5a24cbf32a4e994d88b9f8ca09e65bf6201db0904872a` |
| **Vault migrates 1,400 MUSD to the hardened strategy** (`setStrategy`) | `0x37259e12bab7b3ff5afc4ac09d51b2aa31445ace685fad04a275cecb0c4131ce` |
| Demo run (local server): approve, open 10 MUSD on 0.0004 BTC, repay, close | `0x38d3…b9e2`, `0x1b5a850c715ff9a66639c8fbf6b923739c60ee3959fc2ca20b3f824e08a240ce`, `0x4f105702f7d74abbf5f573a7fa07050d3d5aaa15334f7f70ac0b6c76982d3208`, `0x04aea742653b6fba8b43ad990e6a44f9958d3e6d6a5ee8014ce8f9be3b8d3aee` |
| Demo run on the **live Vercel site**: open, repay, close | `0x753bd80d83f74255607f766252428b5b34835715466009043cd5479612a9caa0`, `0xe901ba2c15577bca8c3a0372cf29428d5b86f6611f47668000b8026511aadb98`, `0x8d556dcd4509ba6e38e73738f59b9f26dd95ea17acbc27762dc93421c3989f84` |
| Keeper claims savers' yield into the vault | `0xd588080de0920cc5cc85fdbdd6a4cc2e3b5a2d972eb18999927898c961e462db` |
| Keeper steps the peg premium (0 → 1%) | `0x5849848539fae0227f7f67da130b4e415a3b86096eea5655363a5c42e7c5ac13` |
| A non-owner tries to propose a config: reverts (`OnlyAdmin`) | `0xfe851d8a250551c2078f8f195bc011894b482f776c404d4866c4d262cf7343f0` |
| The vault owner proposes a config | `0xb873efbe5158298a32f1b884b4da8f8e9782ff99fe4bccf1c49ec6d7a806c072` |
| Applying it before the delay is refused (`TooEarly`, `0x2a35a324`) | not sent: rejected in simulation |

**Why the app changed too.** The first live demo on the hardened contracts failed. Mezo's public testnet RPC balances across nodes that disagree: on 2026-10-21, 5 of 12 receipt requests for a mined transaction came back `null`, and a gas estimate hit a node that hadn't seen the new loan. The app now reads through dRPC first, with Mezo's RPC as fallback. Server wallets sign locally, wait until the previous transaction is visible, and re-broadcast the same signed transaction to both endpoints until it's mined.

## Still to run live

- Reward claim forwarded to the borrower (needs gauge fees or bribes on testnet)
