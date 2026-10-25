# Security

Keel holds savers' MUSD and borrowers' collateral, so a bug can lose real money once it runs on mainnet. Today it runs on Mezo testnet only.

## Reporting a problem

Please report anything that could lose funds, block withdrawals or let someone change settings they shouldn't, privately, through a [GitHub security advisory](https://github.com/jenzylove/keel/security/advisories/new). Include the contract, the function and the steps. Please don't open a public issue for it.

You'll get a reply within 72 hours. Fixes ship on testnet first, and the report is credited unless you'd rather not be named.

## What is in scope

| Contract | Why it matters |
|---|---|
| [`KeelStrategy`](contracts/src/KeelStrategy.sol) | Holds savers' principal for Mezo's savings vault; caps lending, keeps the reserve, releases yield |
| [`KeelMarket`](contracts/src/KeelMarket.sol) | Holds BTC and veBTC collateral; loans, liquidation, the config timelock |
| [`KeelMath`](contracts/src/libraries/KeelMath.sol) | Interest, health, liquidation amounts and the rate curve |
| [`PegOracles`](contracts/src/oracles/PegOracles.sol) | The MUSD price that sets the peg premium and the borrowing brake |

The web app and the daily keeper are in scope where they could make a user sign something they didn't mean to, or leave a loan unliquidated.

## How it is protected today

- **Lending is capped.** At most 20% of savings is ever lent, and a principal cap limits the total.
- **A reserve takes losses first.** A tenth of interest builds it; on a shortfall, principal is paid before yield.
- **Liquidators can't overpay themselves.** A liquidation pays at most what the collateral covers (fixed after an internal review, with a test).
- **No new admin.** Keel is governed by whoever owns the savings vault, read live, and settings change only after a fixed delay (600 seconds on testnet, 48 hours proposed for mainnet).
- **Repaying always stays open,** even when new borrowing is paused.
- **Tests:** 67 unit and fuzz tests, 6 tests on a copy of Mezo mainnet with the real vault, and 235 numbers checked against a separately computed answer key. Internal review notes are in [docs/AUDIT.md](docs/AUDIT.md).

The contracts have not had an external audit. That comes before any mainnet deposit beyond the principal cap.
