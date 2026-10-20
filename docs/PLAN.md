# Keel — Build Plan

Deadline: **Sun 2026-10-26 15:00 UTC** (Wave 1). The plan was written on Tue 2026-10-20 at 21:45 UTC.
Each phase ends with a check that proves it's done. A phase is only done once its check passes.

| # | Phase | When (UTC) | Done when |
|---|---|---|---|
| 0 | Spikes | Tue 20 | ✅ sMUSD migration passes on a mainnet fork. ✅ BTC-on-fork limit found. ✅ Pyth staleness found. ✅ veBTC custody, permanent lock, vote and hand-back proven live on testnet |
| 1 | Core math | Wed 21 | Pure libraries for interest accrual, health, liquidation amounts and the rate curve with its bounded peg step. Unit and fuzz tests pass |
| 2 | KeelStrategy | Wed 21 | Implements `IVaultStrategy`. Tests: allocate, deallocate up to the liquid buffer at max lending, claimYield minus the reserve, migrate in and out. The mainnet fork test passes with the real vault and the real 7.38M |
| 3 | KeelMarket (BTC) | Thu 22 | Borrow, repay, add/remove collateral, liquidate with BTC collateral. Unit tests pass. Deployed to testnet, with one real borrow and repay on the explorer |
| 4 | veBTC collateral | Thu 22 – Fri 23 | Deposit a timed or permanent NFT, vote passthrough, reward claims to the borrower, lock extension, liquidation (including the permanent-unlock path), reset before return. Testnet transactions for each step |
| 5 | Rates, throttle, keeper | Fri 23 | The Pyth update plus weekly rate step runs on testnet. The throttle pauses new borrows when the pool floor is crossed, shown on testnet. A scheduled keeper is confirmed to run, with a fallback |
| 6 | Testnet vault | Fri 23 | Our copy of the verified `MUSDSavingsRate` is deployed and `setStrategy(KeelStrategy)` is called. A saver deposits, interest is claimed, the yield index rises, the saver withdraws with yield. All on the explorer |
| 7 | App | Sat 24 | Front door with live mainnet reads; borrow and save flows; `/demo`, `/proof`, `/data`. Driven in a headless browser, dark and light, with screenshots shown |
| 8 | Eval + audit | Sat 24 | Answer-key replay with the peg term on and off, misses published. `release-readiness-audit` run, findings fixed or listed under Scope and limits. Git history scanned for secrets |
| 9 | Gate | Sat 24 | **You review the live product and the audit and approve** |
| 10 | Launch | Sun 25 | README, deck, 2-minute video, launch reel, AKINDO form text, repo public. Submitted before Sun 26 15:00 UTC with a buffer |

## Risks and unknowns

| Risk | Status | Plan |
|---|---|---|
| Testnet BTC for the deployer and demo wallets | Funded (0.05 BTC) | Top up from faucet.test.mezo.org if needed |
| veBTC custody and voting by a contract | Proven live | See docs/spikes/btc-and-oracles.md. Never vote in the deposit block (flash protection) |
| BTC calls revert on forks | Known | Fork tests cover MUSD-only paths. BTC paths are proven on live testnet |
| Pyth MUSD price is stale on chain; Hermes needs an API key | Known | The keeper posts Hermes updates with a key. Without one, the peg term holds (fail closed) |
| Solidity compiler download is blocked here | Known | solc-js shim for local builds. Hosted CI uses normal solc |
| sMUSD needs MUSDSavingsRate source at 0.8.33 | Known | Install solc-js 0.8.33 for the testnet copy |
| Vote windows (once per epoch, none right after Thursday 00:00 UTC) | Known | Keeper schedules votes inside the window. Tests cover the edges |
| A borrower's NFT is mid-vote when liquidated | Known | Reset first. If reset isn't allowed this epoch, the liquidator gets the NFT with votes on and resets it next epoch. Documented |
| Repo creation from this environment | Blocked | You create the empty private `jenzylove/keel`, then it's attached and pushed |
| Hosting for the live link | Needs decision | Static app plus a small keeper. Host to be picked at phase 7 |
