# Build log

| Date (UTC) | Commit | What now works |
|---|---|---|
| 2026-10-20 | first | Spikes: sMUSD migration passes on a mainnet fork (7,382,416 MUSD moved, saver yield pro rata). Found the BTC precompile limit on forks and the stale Pyth feeds. PRD, plan and checklist written. |
| 2026-10-20 | spikes-2 | veBTC custody proven live on testnet: a contract held, made permanent, voted with and handed back NFT #393 (also while voted). Found flash protection (no vote in deposit block) and same-epoch reset limits. Hermes needs an API key. |
| 2026-10-20 | phase-2 | KeelStrategy: IVaultStrategy with liquid buffer, lend cap, reserve and yield. 10 unit/fuzz tests; mainnet fork: Mezo multisig moves real 7,382,416 MUSD in, lending at the 20% cap (1.476M), saver earns borrower interest, withdrawals stay open at max lending. |
