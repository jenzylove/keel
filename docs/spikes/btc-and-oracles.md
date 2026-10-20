# Spike: BTC on forks, veBTC custody, and price feeds

## 1. Can BTC be used on a mainnet fork?

**No.** Mezo's BTC token (`0x7b7C…0000`, contract `BTCCaller`) calls a native chain precompile. On a forge fork, even `balanceOf` reverts.

**Consequence.** Anything that only moves MUSD can be fork-tested on real mainnet state: the sMUSD migration and the MUSD lending accounting. Anything that moves BTC (veBTC locks, BTC collateral, loans) is proven on live Mezo testnet.

## 2. Can a contract hold, vote with and unlock veBTC?

**From the source (verified VeBTC implementation `0x41d0…aE3`):**
- `_transferFrom` only blocks `LOCKED`-type (managed) NFTs. Normal locks, timed or permanent, can be sent to a contract.
- `Voter.vote`, `reset`, `withdraw`, `unlockPermanent` and `increaseUnlockTime` all accept any approved or owner caller, so a contract that owns the NFT can do all of them.
- A voted NFT can't be withdrawn, merged, split or permanently unlocked until `reset` is called. Reset and vote only work once per epoch, and not in the distribute window right after Thursday 00:00 UTC.
- `split` is disabled for everyone (`canSplit(0) == false`), so collateral is whole NFTs only.
- Max lock is 28 days, rounded down to the week. `unlockPermanent` turns a permanent lock into a 28-day lock.

**Live proof:** pending testnet BTC. The deployer `0x471F65677F73B63929aA657B7a8240824Bad1523` needs faucet funds (faucet.test.mezo.org is not reachable from the build environment).

**Verdict so far:** works on paper. The live test is next.

## 3. Is there a live MUSD price on chain?

Pyth is deployed on Mezo (`0x2880…7B43`, same address on testnet and mainnet) with an MUSD/USD feed (`0x0617…c6de`). On 2026-10-20 the stored prices were about 95 days old on mainnet and 85 days old on testnet. Pyth is pull-based: prices only move when someone posts an update from Hermes.

**Consequence.** Keel's keeper posts the Hermes update in the same transaction as each rate step, and the contract rejects prices older than a set limit. That needs `hermes.pyth.network` reachable from wherever the keeper runs. If no fresh price is available, the peg term stays at its last value (fail closed, no guess).

## 4. Testnet state (2026-10-20)

Testnet has everything Keel needs live:
- MUSD with 274 open loans.
- An MUSD Savings Rate vault holding 886k.
- veBTC with 873 test BTC locked, plus the voter contract.
- A BTC price feed that tracks the real market ($76.5k 30 days ago, $82.6k now).

Mezo's own testnet sMUSD is owned by Mezo, so on testnet Keel runs behind a copy of the verified `MUSDSavingsRate` contract that we deploy and own. Mezo's real vault is migrated in the mainnet fork test.
