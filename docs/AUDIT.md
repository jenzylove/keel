# Release readiness audit

**Date:** 2026-10-21. **Starting commit:** `a685066` (fixes land in the commit after it).
**Target:** Mezo Buildathon Wave 1, due Sun 2026-10-26 15:00 UTC. Deliverables: live link, public repo, deck, 2-minute video, AKINDO form.
**Method:** a clean clone, building and testing it, live checks on the site and on testnet, and two independent adversarial reviews (contracts; app and API), each told to prove findings with tests where it could. This is a readiness audit, not a professional security audit.

## Decision: ship with caveats once the fixes below are deployed

**The case for shipping:**
- The product works end to end on testnet.
- The numbers reconcile to the wei.
- The mainnet-fork proof holds.

**What the review found:**
- Three real economic exploits in the contracts. All three are now fixed, and regression tests that started out as the exploits now pass.
- A blank-data bug on the live site, also fixed.

**Hard gates still open:**
- The testnet redeploy with these fixes.
- Repo made public.
- README, deck, video.
- AKINDO form.

## Verified working

| Check | Result | How |
|---|---|---|
| Clean clone: contracts build, unit + eval tests | 51 → 65 after fixes, all pass | `forge test` |
| Mainnet-fork tests (real sMUSD, real 7.38M) | 6/6 pass, same outputs after the fixes | `forge test --match-path 'test/fork/*'` |
| Eval against an answer key | 235/235 (first run 233, see `docs/eval/RESULTS.md`) | `python3 eval/answer_key.py` |
| App: clean install, `npm audit`, types, production build | 0 vulnerabilities, clean, builds | `npm ci && npm run build` |
| Live strategy books | Balance = principal − lent + yield owed + reserve, exact to the wei (1,390.000000162444734355 MUSD) | chain reads |
| Keeper endpoint without the secret | 401 | observed live |
| Demo run against live testnet (hardened route) | open, repay, close in 46 s | observed (local server, live chain) |
| Cross-site POST to the demo | refused, 403 | reproduced locally |
| Secrets | none in client bundles; keys only in server routes and gitignored `.env`; git history clean | bundle grep, history scan |

## Findings and fixes

### Contracts

| # | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| 1 | High | **Flash deposit dodged interest.** Changes to principal didn't accrue the market first, so the next accrual priced the whole past period at that moment's utilisation. A borrower could deposit 19M, repay and withdraw in one go: 5,000 MUSD of interest dropped to 449.5, and most of what was paid came back as yield to the borrower's own deposit. | Reviewer's PoC | The strategy calls `market.accrue()` before every allocate, deallocate, migrate-in and cap change. Yield is released over 7 days. Test: `test_flash_deposit_no_longer_dodges_interest` |
| 2 | High | **A withdrawal repriced the past.** The mirror of #1: a whale withdrawal pushed utilisation up, so the past year was charged at the spiked rate (105,000 → 121,200). | Reviewer's PoC | Same accrual fix. Test: `test_withdrawal_no_longer_reprices_the_past` |
| 3 | High | **Dust yield could freeze the vault.** The vault claims strategy yield inside every deposit and withdrawal, and reverts (`AmountTooSmall`) if the amount can't move its index. 1 wei of interest owed would have blocked every deposit and withdrawal until more interest arrived. | Found reading the vault source | `claimYield` holds back amounts below `totalSupply / 1e18`. Test: `test_dust_yield_is_held_back_so_vault_calls_never_revert` |
| 4 | High | **A loss beyond the reserve blocked migration.** `migrate` tried to send full principal from a smaller balance, so `setStrategy` would revert for good. | Reviewer's PoC | `migrate` sends what's there. New interest makes good an uncovered loss before anything goes to the reserve or savers, and anyone can `coverLoss`. Leftover reserve can be swept to governance after migrating. Tests: `test_migration_still_works_after_a_loss` and 4 more |
| 5 | Medium | **Cap and reserve changes skipped the timelock.** `setParams` was instant, and lowering the cap raises the rate, which the PRD says only moves after a delay. | Reviewer's PoC | Replaced with `proposeParams` / `applyParams`, which wait the market's config delay. Test: `test_params_wait_the_market_delay_and_accrue_first` |
| 6 | Medium | **Yield sniping.** Interest reached the vault in one lump at repayment, so a deposit just before a big repayment took a full share. | Reviewer's analysis | 7-day release. Test: `test_deposit_before_a_repayment_earns_only_its_time` (an hour's share ≈ 13 of 4,500) |
| 7 | Medium | **Uncollected interest paid out as yield on an underwater liquidation.** | Eval miss | Principal first when a loan is written off (eval commit) |
| 8 | Low | **Votes weren't reset before an NFT left the market**, though the PRD said they were. | Code reading | Market tries `voter.reset` before return or liquidation. Mezo refuses it in the epoch the NFT voted, and the transfer goes ahead anyway. Test: `test_votes_reset_before_the_nft_is_returned` |
| 9 | Claim | **"Savers can always withdraw" was false.** Withdrawals can use up the liquid share while loans are out. | Reviewer's PoC | PRD and site copy corrected |

### App and API

| # | Severity | Finding | Fix |
|---|---|---|---|
| 10 | High | **Live mainnet numbers were blank** ("—"). The free RPC dropped some of 13+ parallel calls from Vercel, and the page cache kept the failed render. | Reads batch into Multicall3. Mainnet falls back across dRPC, Boar and Validation Cloud. A refresh that can't read the chain now throws, so Next keeps serving the last good page |
| 11 | High | **The demo could get stuck for good** if Vercel cut a run off mid-loan. Every later visitor got "another visitor is running". | A loan left open more than 90 s with nothing pending is repaid and closed by the next run. A fresh loan (~45 s) only starts if the run is under 12 s in, so it fits the 60 s limit, and the UI says so if a run is cut off. Proven on testnet: loan #8 stranded on purpose, then tidied (`0xa2cf…5fed`, `0x820e…73d9`) |
| 12 | High | **Concurrent runs could collide on a nonce.** | One run per instance, plus a pending-vs-latest nonce check across instances |
| 13 | Medium | **Any site could trigger demo runs** (a body-less POST is a simple CORS request). | `Sec-Fetch-Site` / `Origin` check |
| 14 | Medium | **Keeper would time out as loans grow**, and one failure hid the rest. | Batched reads, each step reported separately, claims only released yield, timing-safe secret check |
| 15 | Medium | **Wallet flow:** a declined network switch tried to add the network, the page didn't follow account or network changes, and bad amounts weren't caught before sending. | Fixed: add the network only on 4902, follow `accountsChanged` / `chainChanged`, strict amount parsing |
| 16 | Medium | **Fixed figures shown beside live ones without a date**; "every number is read from mainnet" wasn't true (prices come from CoinGecko). | Dated or reworded |
| 17 | Low | No social metadata. | Open Graph / Twitter tags added. A share image comes with the redesign |

## Scope and limits

Facts, not fixes:
- **Not a professional audit.** This was two focused reviews and a test suite. The contracts are unaudited and hold testnet funds only.
- **The live product runs on testnet.** Mainnet readings are read-only. The mainnet integration is proven on a fork, not deployed.
- **Bad debt beyond the reserve is borne by the last savers out**, because Mezo's vault pays 1:1 and can't share a loss out. Keel limits it (reserve, principal-first liquidation, interest covers losses first, `coverLoss`), but can't remove it.
- **The throttle is a brake, not a guarantee.** It reads a spot pool balance, which one transaction can push up for a moment.
- **The peg price comes from a thin pool** (~$58k on the dollar side). A 24-hour average plus 1-point weekly steps limit what pushing it gains.
- **veBTC liquidations need capital**, because the liquidator pays near full value for BTC that stays locked for weeks. Large NFTs may not find a buyer quickly.
- **Anyone can choose when `stepPeg` runs** after each week. The keeper calls it daily once it's due. Interest compounds at each accrual, so frequent activity compounds slightly more (5% simple ≈ 5.13% continuous).
- **The demo has no per-IP rate limit.** Abuse costs testnet gas and can make the demo busy, but can't take funds.
- **Mezo's public testnet RPC is unreliable**, and the app routes around it.

## Not verified

- Behaviour on Vercel under real concurrent visitors (only reproduced locally against the live chain).
- The added mainnet RPC fallbacks: this sandbox can't reach them, so they're only proven once deployed.
- Real gauge fees or bribes forwarded to a borrower: posted, claimable from Thu 2026-10-22 00:00 UTC.
- Mobile layout, beyond reading the CSS. The UI is being redesigned next.
