<p align="center">
  <img src="docs/media/brand/mark.svg" width="76" alt="Keel" />
</p>

<h1 align="center">Keel</h1>

<p align="center">
  <b>Borrow against your Bitcoin. Never redeemed.</b><br />
  A drop in strategy for Mezo's MUSD savings vault: it lends idle savings to BTC and veBTC holders, outside redemptions, and the interest goes to savers.
</p>

<p align="center">
  <a href="https://keel-psi-seven.vercel.app"><img alt="Live" src="https://img.shields.io/badge/live-keel--psi--seven.vercel.app-e5141b?style=flat-square" /></a>
  <a href="https://keel-psi-seven.vercel.app/proof"><img alt="Proof" src="https://img.shields.io/badge/proof-real%20testnet%20transactions-111111?style=flat-square" /></a>
  <img alt="Mezo testnet" src="https://img.shields.io/badge/Mezo-testnet%2031611-111111?style=flat-square" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-67%20unit%20%2B%206%20mainnet%20copy-111111?style=flat-square" />
  <img alt="Eval" src="https://img.shields.io/badge/eval-235%2F235-111111?style=flat-square" />
  <img alt="Built for" src="https://img.shields.io/badge/built%20for-Mezo%20Buildathon-e5141b?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" />
</p>

<p align="center">
  <img src="docs/media/hero.png" width="900" alt="Keel landing page: Borrow against Bitcoin. Never redeemed." />
</p>

## The problem, read from Mezo mainnet

- **MUSD has traded under $0.9925 since July.** Redeeming 1 MUSD pays $1 of BTC minus 0.75%, so below that price anyone can buy MUSD cheap and redeem it against the weakest loan.
- **That emptied the loan book.** There were 49 MUSD loans in June and 1 on 2026-10-20.
- **Savers are paid by that same process.** The vault's 7.38M MUSD of principal is lent to no one. Savers earned about 3% a year over the last 30 days, and 65% of it arrived as BTC fees that redemptions pay. With almost no loans left, that income is running out.
- **Locked Bitcoin can't be borrowed against.** 806 BTC sits in veBTC, and Mezo's own FAQ says it can't be used as collateral.

## What Keel does

Keel is a drop in strategy for Mezo's MUSD Savings Vault. One call, `setStrategy`, by the multisig that already owns the vault moves the idle MUSD into it.

1. **At least 80% stays liquid** for withdrawals.
2. **Up to 20% is lent** against BTC or a veBTC NFT, in KeelMarket rather than Mezo's TroveManager, so redemptions can't reach those loans. veBTC borrowers keep voting and keep their rewards.
3. **Interest goes to savers** over a week, with 10% kept as a reserve that absorbs losses first.
4. **The rate leans against the peg.** Below $0.995 it steps up, at most 1 point a week, read from a 24 hour average of Mezo's own mUSDC/MUSD pool. New borrowing pauses when that pool's dollar side runs thin.
5. **Settings only change after a delay**, and only the vault's owner can propose them. Keel adds no new party to trust.

## Start here

| | |
|---|---|
| **Live site** | [keel-psi-seven.vercel.app](https://keel-psi-seven.vercel.app): the app on Mezo testnet, with Mezo mainnet readings |
| **Use it** | [/app](https://keel-psi-seven.vercel.app/app): Borrow, Save and Loans, quote before any wallet, Connect wallet top right |
| **Run a real loan, no wallet** | press "No wallet? Watch our demo wallet run a real loan" in the panel on [/app](https://keel-psi-seven.vercel.app/app), or open [/demo](https://keel-psi-seven.vercel.app/demo): a demo wallet locks BTC, borrows, repays and gets its BTC back, each step a real testnet transaction |
| **Proof** | [/proof](https://keel-psi-seven.vercel.app/proof) and [docs/proof/testnet-runs.md](docs/proof/testnet-runs.md): every claim linked to a transaction |
| **Product spec** | [docs/PRD.md](docs/PRD.md), including the questions the Mezo team will ask |
| **Audit notes** | [docs/AUDIT.md](docs/AUDIT.md) |
| **Eval** | [docs/eval/RESULTS.md](docs/eval/RESULTS.md): the contracts against an answer key, peg term on and off |
| **Security** | [SECURITY.md](SECURITY.md): scope, protections and how to report |

## Judge fast path

No keys needed.

1. Open the [app](https://keel-psi-seven.vercel.app/app) and read the live quote in the Borrow tab.
2. Press "No wallet? Watch our demo wallet run a real loan" and open any transaction link.
3. Open [/proof](https://keel-psi-seven.vercel.app/proof): savers paid back with interest, a bad loan cleared by the keeper, and the plug in on a copy of Mezo mainnet.
4. Read the problem in Mezo's own numbers on the [landing page](https://keel-psi-seven.vercel.app/#problem).
5. Optional: run the mainnet fork test command shown in "Run it".

## What is real and what is not

| Part | Status |
|---|---|
| Contracts on Mezo testnet | Live, real transactions |
| Mainnet integration | Proven on a fork with Mezo's real 7.38M vault, not deployed |
| Home page numbers | Read live from Mezo testnet and mainnet |
| Demo wallet loan | Real testnet transactions |
| Loop run | Real testnet transactions, fresh wallets playing both sides |
| Keeper | Daily cron, real liquidation on 2026-10-22 |
| Savers' yield on Mezo mainnet today | Read live from the vault's yield index |

## The front door

<p align="center">
  <img src="docs/media/app.png" width="860" alt="The Keel app: a live quote before any wallet, Connect wallet top right" />
</p>

The app lives at /app, with Connect wallet in the top bar on every page. One panel, three tabs:

- **Borrow** shows a live quote before any wallet: the most you can borrow, the rate, your health after borrowing, and that redemptions can't take the loan. A wallet is asked for only when you press the action. Collateral is Bitcoin or a veBTC lock.
- **Save** takes MUSD and shows the live saver rate.
- **Loans** lists your loans with Repay and close.

A live wallet test on the deployed site on 2026-10-24 ran save, borrow, repay and close end to end with a test wallet, and each step was confirmed in the app.

**The loop run.** Fresh wallets play two savers and three borrowers on Mezo testnet. Savers deposited 120 MUSD. Borrowers took 75 MUSD across three loans, one of them against a veBTC lock (#407) the borrower created, repaid with interest about four hours later and got their collateral back. Each saver withdrew 60.0000015 MUSD for their 60; the rest of the interest keeps releasing over the week by design. All 36 steps are on /proof, under "Savers got their money back, with interest". Script: [contracts/script/loop.mjs](contracts/script/loop.mjs), record: [deployments/loop-run.json](deployments/loop-run.json).

**The keeper** is a daily Vercel cron. It claims savers' yield, steps the peg premium, and liquidated an unhealthy loan from its own MUSD float on 2026-10-22 (tx `0xc190a65dcf0e93a0b8572c1105e265c3d49885eecdab3561e9897cc2497e4a42`).


## Contracts

| Contract | What it does |
|---|---|
| [`KeelStrategy`](contracts/src/KeelStrategy.sol) | Implements Mezo's `IVaultStrategy`. Holds savers' principal, lends a capped share, keeps the reserve, releases yield |
| [`KeelMarket`](contracts/src/KeelMarket.sol) | Loans against BTC and veBTC, liquidation, vote and reward passthrough, peg premium, throttle, config timelock |
| [`KeelMath`](contracts/src/libraries/KeelMath.sol) | Interest, health, liquidation and the rate curve |
| [`PegOracles`](contracts/src/oracles/PegOracles.sol) | MUSD price from Mezo pools: concentrated liquidity TWAP on mainnet, basic pool `quote()` on testnet |

Testnet addresses are in [deployments/testnet.json](deployments/testnet.json).

## Run it

```bash
# contracts: unit, fuzz and eval tests
cd contracts && npm ci && forge test --no-match-path 'test/fork/*'

# mainnet fork: Mezo's multisig moves the real 7.38M into Keel
forge test --match-path 'test/fork/*'

# the loop: fresh wallets play savers and borrowers on testnet (run from contracts/)
node script/loop.mjs open
# the loop: repay, close and withdraw, the second half
node script/loop.mjs close

# deploy to Mezo testnet (mainnet dry run on a fork passes)
node script/deploy.mjs testnet

# eval: recompute every number from the PRD's rules and compare
cd .. && python3 eval/answer_key.py

# app
cd app && npm ci && npm run dev
```

## Scope

- The live product runs on Mezo testnet. Mainnet readings are read only, and the mainnet integration is proven on a fork with Mezo's real savings vault. Wave 2 brings it to mainnet.
- The contracts are unaudited. Savers carry bad debt beyond the reserve, which is why lending is capped at 20%.
- Borrower demand on Mezo is small today: about 60 BTC outside veBTC and the Enclaves, plus a handful of mid sized veBTC locks.

## License

MIT
