# AKINDO submission form, ready to paste

**Project name:** Keel

**Project category:** Lending, savings yield

**TL;DR:** Keel is a drop in strategy for Mezo's MUSD Savings Vault that lends its idle MUSD to BTC and veBTC holders, outside redemptions, so savers earn from borrowers who stay and borrowers can't be redeemed away.

**How it works:**
MUSD has traded under $0.9925 since July, so anyone can buy it cheap and redeem it against the weakest loan. That emptied Mezo's loan book: 49 MUSD loans in June, 1 on Oct 20. The savings vault holds 7.38M MUSD of principal that is lent to no one, and its savers are paid mostly by those same redemptions: 65% of the last 30 days' yield arrived as BTC fees from redemptions. With almost no loans left, that income is running out.

Keel implements Mezo's own IVaultStrategy interface. One `setStrategy` call by the multisig that owns the vault moves the idle MUSD into KeelStrategy. At least 80% stays liquid for withdrawals. Up to 20% is lent through KeelMarket against native BTC, timed veBTC or permanent veBTC. Those loans live outside Mezo's TroveManager, so redemptions can't reach them, and veBTC borrowers keep voting and keep their rewards. Interest goes to savers over a week, with 10% kept as a reserve that takes losses first. The rate adds a peg premium when MUSD trades under $0.995, read from a 24 hour average of Mezo's mUSDC/MUSD pool, and new borrowing pauses when that pool's dollar side runs thin. Settings change only after a timelock, and Keel's admin is the vault's owner, read live, so it adds no new party to trust.

MUSD is the asset lent and the yield savers earn; MEZO isn't used.

**Target group:** sMUSD savers who want income that doesn't depend on redemptions; BTC and veBTC holders on Mezo who want MUSD without redemption risk; and Mezo governance, the one party that can plug Keel into the real vault. Crypto native, intermediate to advanced, global, desktop first, with a mobile friendly site.

**Tech stack:** Solidity 0.8.28 and Foundry (unit, fuzz and mainnet fork tests), a Python answer key eval, Next.js 16 and viem 2 on Vercel, Mezo's MUSDSavingsRate, PriceFeed, veBTC VotingEscrow, Voter and pool TWAP oracles.

**Track:** Track 1 (DeFi)

**Chain deployed on:** Mezo (testnet live; mainnet integration proven on a fork)

**Project status:** Entirely new

**Project readiness:** Testnet deployment

**Future milestones:**
1. Wave 2 (by Nov 15): an opt in Keel vault on Mezo mainnet with small caps, so real savers and borrowers use it before any governance call.
2. Wave 2 (by Nov 15): veBTC rewards pay a loan's interest automatically, and the keeper liquidates from its own MUSD float on mainnet.
3. After the buildathon: a professional audit, then a governance proposal to move the savings vault's 7.38M with `setStrategy`.

**Links:**
- Live: https://keel-psi-seven.vercel.app (app: /app)
- Repo: https://github.com/jenzylove/keel
- Deck: https://claude.ai/artifact/HBtwT87sZMRoBzrzT7ahpK (share it from its Share menu first)
- Video: https://youtu.be/iSvGuXuLK7A

**Team:** [name, role, X or LinkedIn]
