# MUSD Savings Rate (vendored)

Verified source of Mezo's `MUSDSavingsRate` and `IdleStrategy`, copied from the Mezo mainnet explorer
(implementation `0xB33C3f97BF3B7df59417D114c694353E42929e87`, MIT licence, solc 0.8.33, optimizer 100 runs).

Keel deploys this unchanged on Mezo testnet behind a proxy that Keel owns, because Mezo owns its own testnet
vault. That lets the full `setStrategy(KeelStrategy)` path run live. Mezo's real vault is migrated in
`test/fork/SmusdMigration.t.sol`.
