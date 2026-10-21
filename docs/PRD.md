# Keel — Product Requirements

**One line.** Keel is a drop-in strategy for Mezo's MUSD Savings Vault. It lends the vault's idle MUSD to people holding BTC or veBTC, outside the redemption system, so savers earn again and borrowers can't be redeemed away.

**Hackathon.** Mezo Buildathon (AKINDO), DeFi track. Wave 1 closes Sun 2026-10-26 15:00 UTC. Wave 2 runs Nov 2–15.

---

## 1. The problem, with evidence

Every number below was read from Mezo mainnet on 2026-10-20 (block ~12.646M) or from public price APIs. The scripts are in `scripts/data/`.

| What | Number | Source |
|---|---|---|
| MUSD in existence | 29.48M | MUSD `totalSupply` |
| Owed by 2 institutional Enclaves | 14.5M at 0% interest | EnclaveDebtManager `getTotalOutstandingDebt`, `maxRate = 0` |
| Owed by the protocol bootstrap loan | 14.95M | PCV `debtToPay` |
| Owed by ordinary MUSD loans | 14.5k across 1 loan (49 loans 120 days ago) | TroveManager `getTroveOwnersCount`, historical reads |
| MUSD price | about $0.990, below the $0.9925 redemption break-even since early July | CoinGecko, Aerodrome |
| Savings vault | 7.38M MUSD in `IdleStrategy`, earning nothing | sMUSD `strategy()`, IdleStrategy balance |
| Mezo's redemption sink (SafetyBuffer) | drained, 0.024 BTC left | SafetyBuffer balance |
| Mezo's mUSDC/MUSD liquidity wall | 5.3M MUSD against 58k mUSDC | CL pool balances |
| veBTC | 806 BTC; Mezo's FAQ says retail can't borrow against it | veBTC `supply`, docs FAQ |

**The loop.** MUSD trades below $0.9925, so any MUSD loan gets redeemed. With no borrowers, nobody pays interest, so the savings vault sits idle. With nothing earned, there's no reason to hold MUSD, so people sell, and the price stays below $0.9925.

**Who feels it.**
- **Savers:** 447 sMUSD holders get 0% on 7.38M.
- **BTC holders on Mezo:** about 60 BTC sits outside veBTC and the Enclaves. Any MUSD loan they open is redeemed at today's price.
- **veBTC holders:** their BTC is frozen for up to 28 days, or with no end date for permanent locks. They're told they can't use it as collateral.
- **Mezo:** its peg defenses (SafetyBuffer, liquidity wall) are spending money, and the savings product has nothing to pay.

## 2. Users and the front door

**Users.**
- **Savers:** sMUSD holders, and anyone depositing MUSD.
- **Borrowers:** people holding BTC or a veBTC NFT on Mezo.
- **Mezo governance:** the one party that can plug Keel into the real vault.

**First ten seconds.** The page opens on three live readings from Mezo mainnet:
- "Savings vault: 7.38M MUSD, earning 0%"
- "Open MUSD loans: 1"
- "Dollar side of the liquidity wall: $58k"

Below them, one sentence: "Keel lends idle savings to BTC holders, outside redemptions." Then two buttons: **Borrow** and **See the proof**.

**Borrower path (testnet, real transactions):**
1. Connect a wallet.
2. Deposit BTC, or deposit a veBTC NFT.
3. Borrow MUSD. There's no 1,800 minimum.
4. See the loan, its health, and the interest it pays savers.
5. Repay and withdraw.

**Saver path:** deposit MUSD into the Keel-backed savings vault, watch yield accrue each time interest is claimed, then withdraw.

**No-sign-up `/demo`:** a server-held testnet wallet runs a small real borrow and repay when the visitor clicks. The page shows each transaction with an explorer link.

## 3. Full scope (one build, nothing deferred)

### Contracts
1. **KeelStrategy**, which implements Mezo's `IVaultStrategy` (`allocate`, `deallocate`, `claimYield`, `migrate`, `onMigrated`).
   - It holds savers' principal and keeps at least `minLiquidBps` liquid (proposed 80%), so `deallocate` always succeeds.
   - It lends the rest through KeelMarket, up to `maxLentBps` (proposed 20%).
   - `claimYield` sends interest, minus the reserve share, to the vault.
2. **KeelMarket**, the lending book. The loan asset is MUSD. Collateral types:
   - Native BTC.
   - Timed veBTC (a normal lock with an end date).
   - Permanent veBTC.

   For each collateral type there's a max LTV, a liquidation threshold and a liquidation bonus. Proposed values:

   | Collateral | Max LTV | Liquidate at | Bonus |
   |---|---|---|---|
   | BTC | 50% | 65% | 5% |
   | Timed veBTC | 45% | 60% | 8% |
   | Permanent veBTC | 40% | 55% | 10% |

   The extra margin on veBTC covers the wait before its BTC can be withdrawn. That's up to 28 days, plus one more 28-day lock for permanent NFTs.

   The minimum loan is 100 MUSD. BTC price comes from Mezo's own MUSD `PriceFeed`, the same one the MUSD system uses.
3. **veBTC custody.** The market holds deposited NFTs. A borrower can:
   - choose gauges for Keel to vote with their NFT once per epoch;
   - claim that NFT's fees and bribes to their own wallet;
   - extend the lock.

   Votes are reset before an NFT is liquidated or returned.
4. **Liquidation.** When a loan passes its threshold, anyone can repay the debt and receive the collateral at the bonus.
   - **BTC:** paid out directly.
   - **Timed veBTC:** the NFT is transferred to the liquidator.
   - **Permanent veBTC:** the NFT is transferred as it is, and the liquidator unlocks it themselves (a further 28-day lock). That's why its bonus is the largest. Transfer works even if the NFT voted this epoch (proven on testnet), whereas unlocking would have to wait for the next epoch.
   - If a loan's debt ever exceeds its collateral value, the shortfall is taken from the reserve first, and the event is recorded.
5. **Rates.** The yearly rate is base + utilization slope + a peg term.
   - The peg term rises as MUSD falls below $0.995, up to a cap.
   - It moves in bounded weekly steps, so a short price push can't swing it.
   - The MUSD price is a time-weighted average from a Mezo pool. On mainnet that's the mUSDC/MUSD concentrated-liquidity pool holding Mezo's peg wall (24-hour average). On testnet it's the MUSD/mUSDC basic pool's `quote()` (about 24 hours of observations). Both are free and on chain. If the oracle can't produce a price, the peg term holds its last value.
6. **Throttle.** New borrowing pauses while a watched pool's dollar-side balance is below a set floor. On mainnet that's the mUSDC/MUSD wall. Repaying, adding collateral and liquidating always stay open.
7. **Reserve.** A set share of interest (proposed 10%) builds a bad-debt reserve, which lives in the strategy.
8. **Governance and timelock.**
   - Keel has no admin of its own. Both contracts are governed by whoever owns the savings vault, read live. On mainnet that's Mezo's multisig, which can already move the whole vault with `setStrategy`. So Keel adds no new party to trust.
   - Risk, rates, peg settings, the oracle and the minimum loan change only through `proposeConfig` then `applyConfig`, after an immutable delay. That's 48 hours proposed for mainnet, and 600 seconds on testnet so it can be shown. A borrower sees a tighter setting coming and can repay or add collateral first.
   - The borrowing throttle stays instant, because it can only pause new loans.
   - The strategy's market can only be replaced while nothing is lent.
   - The rate curve is capped at 100% a year before the peg premium.
   - A veBTC liquidation takes a maximum price, so a liquidator is never charged more than they agreed to.

### Off-chain
8. **Keeper:**
   - steps the rate weekly;
   - calls `receiveYieldFromStrategy`;
   - runs liquidations;
   - casts the votes borrowers chose each epoch.

   It runs on a schedule, and each run is confirmed to actually execute.
9. **App:**
   - the front door with live mainnet readings;
   - borrower and saver flows on testnet;
   - `/demo`;
   - `/proof`;
   - `/data`, the loop with real mainnet numbers.

### Proof
10. **Mainnet fork test:** Mezo's multisig moves the real 7.38M from `IdleStrategy` into KeelStrategy, lending runs against it, and savers withdraw with yield. Only MUSD moves, so it can be forked.
11. **Live testnet deployment:** our own copy of the verified `MUSDSavingsRate` contract (we own it), KeelStrategy plugged in with `setStrategy`, and KeelMarket with real BTC and veBTC loans, votes and a liquidation.
12. **Eval:** a replay of each borrower path against an answer key (expected debt, interest, health, liquidation outcome) with the peg term on and off. The first misses and their fixes are published on `/proof`.

### Nothing descoped
Nothing is cut. If something is cut at a checkpoint, it will be listed here with the reason.

## 4. How each judging criterion is met

| Criterion (weight) | How |
|---|---|
| Mezo Integration (30%) | Implements Mezo's own vault strategy interface, takes veBTC custody and votes through Mezo's Voter, lends MUSD, prices with Mezo's PriceFeed, and throttles on Mezo's pool |
| Product & Business Viability (30%) | Answers the DeFi track question with MUSD as working capital. Lenders are already there (7.38M idle). Directly fixes three measured problems and stops making the peg worse |
| Technical Implementation (20%) | Deployable as-is: the mainnet fork proves the governance call on real state, the testnet runs the full product, plus unit and fuzz tests |
| User Experience (10%) | One page that opens on real numbers, then borrow in a few clicks, plus a no-sign-up demo |
| Submission Materials (10%) | Every claim links to a chain read or a transaction |

## 5. Claims we will make, and how each is proven

| Claim | Proof |
|---|---|
| "7.38M MUSD sits idle in the savings vault" | Live read on the front door, linked to the explorer |
| "One governance call plugs Keel in" | Fork test output on `/proof`, rerunnable from the repo |
| "Keel loans can't be redeemed" | Loans live in KeelMarket, not TroveManager. A test shows a mainnet redemption can't touch them |
| "Savers earn borrower interest" | Testnet: yield index rises after `receiveYieldFromStrategy`, with transaction links |
| "Savers can always withdraw" | Test: withdrawing the whole liquid buffer succeeds even at max lending |
| "veBTC works as collateral" | Testnet transactions: deposit NFT, borrow, vote, repay, return |
| "Liquidation works, including permanent veBTC" | Testnet liquidation transaction(s), plus tests |
| Any APR shown | Computed live from on-chain rate state, never typed in |
| "The rate reads MUSD's real price" | Mainnet fork: both oracle adapters read about $0.991 from Mezo's own pools. On testnet the mechanism runs live, but the price is testnet's pool and is labelled as such |

## 6. What Keel does not do

- It doesn't mint MUSD, and it doesn't change the peg on its own. At today's peg the effect is roughly neutral.
- It doesn't move Mezo's real savings vault. Only Mezo's multisig can do that.
- It doesn't fix the MEZO price or the Enclaves' 0% terms.
- It doesn't let savers opt out of lending once governance plugs it in. The cap and reserve exist for that reason.
- The live product runs on testnet. Its mainnet readings are read-only.

## 7. Honest limits

- **Borrower demand on Mezo is small:** about 60 free BTC, plus about 7 veBTC locks of 1–15 BTC.
- **Savers take the bad-debt risk** beyond the reserve.
- **Governance can still tighten settings**, but only after the delay, in public, and only the vault's owner can propose.
- **The peg price comes from a thin pool** (about $58k on the dollar side on mainnet). A day-long average plus small weekly steps limit what moving it could gain, but it could be pushed.
- **The size of the payoff depends on Mezo choosing to migrate.**
