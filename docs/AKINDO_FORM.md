# AKINDO submission form, ready to paste

**Project name:** Keel

**Project category:** Lending, savings yield

**TL;DR:** Keel is a drop in strategy for Mezo's MUSD Savings Vault that lends its idle MUSD to BTC and veBTC holders, outside redemptions, so savers earn from borrowers who stay and borrowers can't be redeemed away.

**How it works:**
MUSD has traded under $0.9925 since July, so anyone can buy it cheap and redeem it against the weakest loan. That emptied Mezo's loan book: 49 MUSD loans in June, 1 on Oct 20. The savings vault holds 1.30M MUSD of principal (Nov 8) that is lent to no one, and its savers are paid mostly by those same redemptions: 65% of the last 30 days' yield arrived as BTC fees from redemptions. With almost no loans left, that income is running out.

Keel implements Mezo's own IVaultStrategy interface. One `setStrategy` call by the multisig that owns the vault moves the idle MUSD into KeelStrategy. At least 80% stays liquid for withdrawals. Up to 20% is lent (half on the small opt in mainnet vault) through KeelMarket against native BTC, timed veBTC or permanent veBTC. Those loans live outside Mezo's TroveManager, so redemptions can't reach them, and veBTC borrowers keep voting and keep their rewards. Interest goes to savers over a week, with 10% kept as a reserve that takes losses first. The rate adds a peg premium when MUSD trades under $0.995, read from a 24 hour average of Mezo's mUSDC/MUSD pool, and new borrowing pauses when that pool's dollar side runs thin. Settings change only after a timelock, and Keel's admin is the vault's owner, read live, so it adds no new party to trust.

MUSD is the asset lent and the yield savers earn; MEZO isn't used.

**Target group:** sMUSD savers who want income that doesn't depend on redemptions; BTC and veBTC holders on Mezo who want MUSD without redemption risk; and Mezo governance, the one party that can plug Keel into the real vault. Crypto native, intermediate to advanced, global, desktop first, with a mobile friendly site.

**Tech stack:** Solidity 0.8.28 and Foundry (unit, fuzz and mainnet fork tests), a Python answer key eval, Next.js 16 and viem 2 on Vercel, Mezo's MUSDSavingsRate, PriceFeed, veBTC VotingEscrow, Voter and pool TWAP oracles.

**Track:** Track 1 (DeFi)

**Chain deployed on:** Mezo mainnet (opt in vault, capped at 2,000 MUSD, owned by a 48 hour timelock) and Mezo testnet

**Project status:** Existing product, continued from Wave 1

**Project readiness:** Mainnet deployment (small opt in vault) plus testnet

**Future milestones:**
1. Next: real outside savers and borrowers on the opt in mainnet vault, with small caps, before Mezo is asked to trust Keel with the main vault.
2. Then: an external audit and a clean mainnet record.
3. After: a governance proposal for Mezo to move its idle savings into Keel with one `setStrategy` call.

**Links:**
- Live: https://keel-psi-seven.vercel.app (app: /app)
- Repo: https://github.com/jenzylove/keel
- Deck: https://github.com/jenzylove/keel/blob/main/docs/Keel-deck.pdf
- Video: https://youtu.be/3Wd_9V7KwTg

**Team:** JDollar (solo builder: product, contracts, app). X: @dollar782
