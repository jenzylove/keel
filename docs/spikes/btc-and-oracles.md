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

**Live proof on Mezo testnet (2026-10-20).** The spike contract `VeHolder` (`contracts/spike/VeHolder.sol`) is at `0xD22AFb3a8Fa3823726f2e5AD533a1e6151aC3A5c`, and the deployer is `0x471F…1523`. veBTC is `0xB63f…9231`, and the Voter is `0x72F8…5738`.

| Step | Result | Transaction |
|---|---|---|
| Lock 0.001 BTC for 7 days → veBTC #393 | ✅ | `0x2dd1259a4468d1cac64c95d25c60604267a15aabede55e01f833b09b6149e92f` |
| Send #393 to the contract | ✅ | `0xd1ced39235b8ef02431f4f1b4f01b0a4ef5521d68886bb6e95dd80be39923f4c` |
| Contract makes it permanent (`lockPermanent`) | ✅ | `0xa02561191db5da5987227933b3e63805f645c6112485285ed53182f613c68dd7` |
| Contract resets votes (not yet voted) | ✅ | `0x929c9fe94dc74197fa9066db3331e567c33dc427393c6a0ec0c0af4ed5bd6019` |
| Contract hands it back | ✅ | `0x1e332b2bd41e587d4b5f4e54afa5463a1042e2c0b46e4a62d33f9a9e1674d00d` |
| Send to the contract again | ✅ | `0xea98eb48dee8468e77df976f9e4ce3e875f2b4cebac965995da5945c5dbcd743` |
| Contract votes for the MUSD/BTC pool gauge | ✅ (weight 1e15) | `0xf9a1fdc192c284dd75e2543c5a0f5a90132c94e6c0408df2c19fceaa1ca3ebb7` |
| Contract resets in the same epoch | ❌ reverts, as expected (`AlreadyVotedOrDeposited`) | not sent |
| Contract unlocks permanent while voted | ❌ reverts, as expected (`AlreadyVoted`) | not sent |
| Contract hands back a **voted** NFT | ✅ | `0xf0d2ce1cae95e8898d1952604c34b604314340404ace9ff849799bcace63febe` |

**Things learned live:**
- **Flash protection:** an NFT has zero voting power in the block it changes owner (`ZeroBalance`). The first vote, sent right after the deposit, reverted for that reason, and the next block worked. Keel must never vote in the deposit block.
- **Same-epoch limits:** after a vote, `reset` and `unlockPermanent` are blocked until the next epoch. A transfer still works. So liquidation of a voted NFT is done by **transfer**, and the new owner resets next epoch. Unlocking a permanent lock on liquidation has to wait for a fresh epoch, or go to the liquidator.

**Verdict: works.** A contract can hold, make permanent, vote with and hand back veBTC, including while it has a vote on it.

## 3. Is there a live MUSD price on chain?

Pyth is deployed on Mezo (`0x2880…7B43`, same address on testnet and mainnet) with an MUSD/USD feed (`0x0617…c6de`). On 2026-10-20 the stored prices were about 95 days old on mainnet and 85 days old on testnet. Pyth is pull-based: prices only move when someone posts an update from Hermes.

**Consequence.** Keel's keeper posts the Hermes update in the same transaction as each rate step, and the contract rejects prices older than a set limit. That needs `hermes.pyth.network` reachable from wherever the keeper runs. If no fresh price is available, the peg term stays at its last value (fail closed, no guess).

**Update 2026-10-20.** `hermes.pyth.network` is reachable from the build environment, but every request returns `401 unauthorized`. Public Hermes now needs an API key. The contract accepts a Pyth update from any keeper. A key is needed to run the peg term live.

## 4. Testnet state (2026-10-20)

Testnet has everything Keel needs live:
- MUSD with 274 open loans.
- An MUSD Savings Rate vault holding 886k.
- veBTC with 873 test BTC locked, plus the voter contract.
- A BTC price feed that tracks the real market ($76.5k 30 days ago, $82.6k now).

Mezo's own testnet sMUSD is owned by Mezo, so on testnet Keel runs behind a copy of the verified `MUSDSavingsRate` contract that we deploy and own. Mezo's real vault is migrated in the mainnet fork test.
