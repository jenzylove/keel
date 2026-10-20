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

## Still to run live

- veBTC loan liquidation (discount sale, surplus to borrower)
- Reward claim forwarded to the borrower (needs gauge fees or bribes on testnet)
- Throttle pausing new borrowing
- Peg step with a fresh Pyth price (needs a Hermes API key)
- Saver withdrawal with earned yield after interest accrues
