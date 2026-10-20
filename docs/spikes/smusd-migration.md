# Spike: can the MUSD Savings Vault move its idle MUSD into a new strategy?

**Question.** sMUSD's 7.38M MUSD sits in `IdleStrategy`. Can one governance call move it into a Keel strategy, and does yield from that strategy reach savers?

**What was run.** `contracts/test/fork/SmusdMigration.t.sol` on a fork of Mezo mainnet (2026-10-20, block ~12.646M). The test impersonates the sMUSD owner, calls `setStrategy` with a minimal strategy that implements the vault's `IVaultStrategy` interface, then has a new saver deposit, pushes 10,000 MUSD of yield into the strategy, and withdraws.

```
forge test --match-contract MigrateSpike -vv --use <solc 0.8.28>
```

**Output.**

```
[PASS] test_migrate_idle_to_strategy()
  sMUSD owner: 0x98D8899c3030741925BE630C710A98B57F397C7a
  idle MUSD: 7382416
  migrated into strategy: 7382416
  saver received principal+yield (wei): 1001354386528903307000
  saver yield share (wei): 1354386528903307000
```

The saver's share is 1,000 / 7,383,416 of 10,000 MUSD = 1.354 MUSD, as expected.

**What the source says.**
- `setStrategy(new)` (owner only) claims pending yield from the old strategy, calls `old.migrate(new)`, then `new.onMigrated(amount)`.
- `deposit` calls `strategy.allocate(amount)`, and `withdraw` calls `strategy.deallocate(amount)` in the same transaction.
- `receiveYieldFromStrategy()` (anyone) calls `strategy.claimYield()`. The strategy must transfer the MUSD to the vault and return the amount.
- The owner is the Mezo multisig `0x98D8…7C7a`, which also owns MUSD.

**Verdict: works.** One owner call moves all of it, and strategy yield reaches savers pro rata.

**Design constraint it creates.** Withdrawals are synchronous. Keel must always be able to return principal on demand, so only a capped share can be lent out and the rest stays liquid in the strategy.
