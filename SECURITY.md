# Security

Keel holds savers' MUSD and borrowers' collateral, so a bug can lose real money. It runs on Mezo testnet and in a small opt in vault on Mezo mainnet, capped at 2,000 MUSD of savings.

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

- **Lending is capped.** At most 20% of savings is lent on Mezo's main vault design and at most half on the small opt in mainnet vault, and a principal cap limits the total.
- **A reserve takes losses first.** A tenth of interest builds it; on a shortfall, principal is paid before yield.
- **Liquidators can't overpay themselves.** A liquidation pays at most what the collateral covers (fixed after an internal review, with a test).
- **No new admin.** Keel is governed by whoever owns the savings vault, read live, and settings change only after a fixed delay (600 seconds on testnet, 48 hours on mainnet). On mainnet the vault owner is itself a 48 hour [TimelockController](https://explorer.mezo.org/address/0x2f131C3e4aE7BcBB291859559c9bC720533a778a), so no admin call lands in less than two days.
- **Repaying always stays open,** even when new borrowing is paused.
- **A keeper on both networks.** A daily keeper with its own key and MUSD float liquidates unhealthy loans on testnet and on the mainnet vault.
- **Tests:** 85 unit and fuzz tests, 6 tests on a copy of Mezo mainnet with the real vault, and 235 numbers checked against a separately computed answer key. Internal review notes are in [docs/AUDIT.md](docs/AUDIT.md).

The contracts have not had an external audit. That comes before any mainnet deposit beyond the principal cap.
