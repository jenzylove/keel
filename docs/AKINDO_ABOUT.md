## What it does

Keel lets you borrow MUSD against your Bitcoin, or a locked veBTC, without ever being redeemed. Savers fund the loans and earn the interest.

It is built as a drop in strategy for Mezo's own MUSD savings vault. One `setStrategy` call by the multisig that owns the vault moves its idle MUSD into Keel. At least 80% stays liquid for withdrawals, and up to 20% is lent in Keel's own market, where redemptions can't reach. veBTC borrowers keep voting and keep their rewards.

Try it at https://keel-psi-seven.vercel.app: the app shows a live quote before you connect anything, and a no wallet demo runs a real loan on Mezo testnet.

## The problem it solves

- **Borrowers get redeemed.** Redeeming 1 MUSD pays $1 of BTC minus a 0.75% fee. MUSD has traded under $0.9925 since July, so anyone can buy it cheap and redeem it against the weakest loan. Mezo's loan book went from 49 loans in June to 1 today.
- **Savers are paid by that same process.** The savings vault holds 7.38M MUSD that is lent to no one. Over the last 30 days, 65% of what savers earned arrived as BTC fees from redemptions. With almost no loans left, that income is running out.
- **Locked Bitcoin is stuck.** 806 BTC sits in veBTC, and none of it can be borrowed against.

Keel fixes all three with one mechanism: savers' idle MUSD is lent to Bitcoin holders in a market redemptions can't touch, and the interest replaces the income redemptions were paying.

## Challenges I ran into

- **Gas estimates on Mezo testnet came back far too low.** One config call was estimated at 27,861 gas, and opening a loan ran out of gas at 2M. Every write now has a gas floor and a 30% margin.
- **A public RPC drops some calls.** A wallet that saved it could not read its own transaction count. The app now fills in the nonce and gas price itself, adds Mezo's own RPC first, and turns wallet errors into one plain sentence.
- **BTC can't be forked.** BTC is a native precompile on Mezo, so the mainnet copy tests cover the MUSD side with the real vault and real balances, and every BTC path is proven with real transactions on testnet.
- **The eval caught a real bug.** When a veBTC loan was sold below its debt, uncollected interest was paid out as yield and booked again as a loss. Fixed: principal is paid first when a loan is written off. A review also found a liquidator could pay more than the collateral covered; that is now capped, with a test.
- **The peg price comes from a thin pool.** The rate reads a 24 hour average and moves at most one point a week, so moving the price briefly gains nothing.

## Technologies I used

- Solidity 0.8.28 and Foundry: unit, fuzz and mainnet copy tests
- Mezo contracts: MUSDSavingsRate (the sMUSD vault and its IVaultStrategy interface), veBTC VotingEscrow and Voter, PriceFeed, and the mUSDC/MUSD pool for the peg price
- Next.js 16 and viem 2 on Vercel, with a daily keeper cron
- Python for an answer key that recomputes every number independently

## How we built it

1. Read the problem straight from Mezo mainnet: the loan book, the savings vault's yield index and where its income came from, and the MUSD price.
2. Wrote KeelStrategy against the vault's real IVaultStrategy interface, and KeelMarket for loans against BTC, timed veBTC and permanent veBTC, with liquidation, a reserve, a peg premium, a borrowing brake and a settings timelock. Keel's admin is whoever owns the vault, read live.
3. Ran the governance call on a copy of Mezo mainnet: the multisig moves the real 7.38M into Keel, borrower interest reaches savers, withdrawals stay open.
4. Deployed to Mezo testnet and played both sides with fresh wallets: two savers and three borrowers, one against a veBTC lock. Each saver put in 60 MUSD and took out 60.0000015. A keeper liquidated an unhealthy loan from its own float.
5. Built the app: a landing page that reads Mezo's numbers live, and one panel for Borrow, Save and Loans with Connect wallet in the top bar.

## What we learned

- The best place to plug in on Mezo is the savings vault it already has. Extending a Mezo product beats asking anyone to trust a new pool.
- Redemptions protect the peg, but on a fork that trades under its line they quietly empty the loan book and fund savers from it. Taking the loan out of their reach is cleaner than fighting them.
- Ship the proof with the product: every claim on the site links to a transaction.

## What's next

1. **Wave 2 (by Nov 15):** an opt in Keel vault on Mezo mainnet with small caps, so real savers and borrowers use it before any governance call.
2. **Wave 2 (by Nov 15):** veBTC rewards pay a loan's interest automatically, and the keeper liquidates from its own float on mainnet.
3. **After the buildathon:** an external audit, then a governance proposal to move the savings vault's idle MUSD into Keel with `setStrategy`.

**Links:** [Live](https://keel-psi-seven.vercel.app) · [Repo](https://github.com/jenzylove/keel) · [Video](https://youtu.be/iSvGuXuLK7A) · [Proof](https://keel-psi-seven.vercel.app/proof)
