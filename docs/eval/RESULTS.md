# Eval: the contracts against an answer key

**Result: 235 checks. The first run missed 2, which exposed a real accounting bug. The bug is fixed, and the rerun matches all 235 to the wei.**

## How it works

1. `contracts/test/eval/KeelEval.t.sol` runs five scenarios through the real `KeelMarket` and `KeelStrategy`, and logs every number. It decides nothing itself.
2. `eval/answer_key.py` works out the same numbers from the PRD's rules, using exact fractions. It doesn't read the Solidity. It then compares each one against the contracts' output and writes `eval/results.json`.
3. Rerun with `python3 eval/answer_key.py` (needs `forge` on PATH). It exits non-zero on any miss.

Settings are the proposed mainnet ones: rate is 3% + 4% × utilisation + the peg premium. The premium starts below $0.995 and is full (4%) at $0.985, moving at most 1 point a week. 10% of interest goes to the reserve.

## 1. MUSD's real price, peg term on and off

The scenario: a 1,000,000 MUSD vault lends 100,000 MUSD for 26 weeks. The peg oracle replays MUSD's real weekly price from CoinGecko, 2026-04-25 to 2026-10-21 (`eval/data/musd-weekly.json`), and the keeper steps the peg once a week.

| Weeks | MUSD | Peg premium | Borrow rate (on / off) | Savers' rate on the whole vault (on / off) |
|---|---|---|---|---|
| 1–9 (Apr 25 – Jun 20) | $0.998–$1.007 | 0 | 5.00% / 5.00% | 0.45% / 0.45% |
| 10 (Jun 27) | $0.9889 | 1.00% (capped by the weekly step) | 6.00% / 5.00% | 0.54% / 0.45% |
| 12 (Jul 11) | $0.9944 | 0.24% | 5.24% / 5.00% | 0.47% / 0.45% |
| 20 (Sep 5) | $0.9895 | 2.20% | 7.20% / 5.00% | 0.65% / 0.45% |
| 26 (Oct 17) | $0.9882 | 2.72% | 7.72% / 5.00% | 0.70% / 0.45% |

| Over the 26 weeks | Peg on | Peg off |
|---|---|---|
| Borrower pays in interest | 3,022.54 MUSD | 2,523.26 MUSD |
| Savers receive | 2,720.29 MUSD | 2,270.94 MUSD |
| Reserve | 302.25 MUSD | 252.33 MUSD |

**What it shows.** Since MUSD fell below $0.995 in late June, the peg term has charged borrowers up to 2.7 points more. That gives savers about 20% more over the half year, and it rewards repaying MUSD while it trades cheap.

**What it doesn't show.**
- It doesn't show whether this moves the peg. At 100k lent against a 29.5M supply, it won't on its own (PRD §6).
- The weekly step limits jumps of more than 1 point. Below that it passes the price straight through: week 11 → 12 went 1.08% → 0.24%. On mainnet the oracle is a 24-hour average, which smooths some of this. The replay feeds it weekly closing prices instead.

## 2. Loan lifecycle

| Scenario | Checked | Result |
|---|---|---|
| BTC loan, 40k on 1 BTC, one year | debt 41,520 (3.8% at 20% utilisation); health 0.94 at $60k and 0.86 at $55k, both below 1 so liquidatable | exact |
| BTC liquidation at $55k, 20k repaid | 0.381818 BTC seized (20k × 1.05 ÷ 55k), interest split 90/10, principal left | exact |
| Permanent veBTC, 30k on 1 BTC, BTC falls to $50k | sold at $45k (10% off), 14,911.23 MUSD surplus to the borrower, no bad debt | exact |
| Permanent veBTC sold below its debt ($27k against $31,680) | reserve takes the loss first, the rest is bad debt | **missed on the first run, fixed** |

## The miss, and the fix

**What the contracts did.** When a liquidation recovers less than the debt, the payment was applied to interest first, as in a normal repayment. On the underwater veBTC loan:
- The sale's first 1,680 MUSD counted as interest. 1,512 went to savers as yield, and 168 to the reserve.
- The rest of the principal was then written off, so bad debt was 3,952 MUSD.

Savers' net position came out the same. But the contracts paid out yield for interest that was never collected, and booked a bigger loss to make up for it. The vault pays yield out to today's savers, and losses land on whoever is holding when the strategy migrates. So the old order moved money from future savers to current ones.

**The answer key's rule (PRD §3.4).** The loss is what the sale didn't recover, and interest on a loan that can't be repaid isn't income.

**Fix.** `_settle` now applies principal first whenever a liquidation is about to write the loan off:
- a veBTC sale below its debt;
- or all of a BTC loan's collateral taken without clearing the debt.

Rerun: yield 5,040, which is only the BTC loan's real interest; reserve 0; bad debt 2,440. That's 235 / 235. A unit test now covers the BTC case (`test_shortfall_pays_principal_before_interest`).

The live testnet market still runs the old order. It will be redeployed with the fix after the pending reward-claim proof, which has to run on the current market.
