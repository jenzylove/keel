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

Keel is two contracts on Mezo. KeelStrategy plugs into the savings vault through the vault's own strategy interface: it holds savers' MUSD, keeps at least 80% liquid and lends the rest. KeelMarket holds the loans: BTC or veBTC goes in, MUSD comes out, and liquidation, the reserve, the peg premium and the settings delay all live there. There is no new admin; Keel answers to whoever owns the vault.

We tested the plug in on a copy of Mezo mainnet with the real vault and its 7.38M, then deployed to testnet and ran both sides with fresh wallets. Savers deposited, borrowers took loans (one against a veBTC lock), everyone was paid back, and a keeper cleared a bad loan from its own float. The app is Next.js on Vercel and reads Mezo's numbers live.

## What we learned

- The best place to plug in on Mezo is the savings vault it already has. Extending a Mezo product beats asking anyone to trust a new pool.
- Redemptions protect the peg, but on a fork that trades under its line they quietly empty the loan book and fund savers from it. Taking the loan out of their reach is cleaner than fighting them.
- Ship the proof with the product: every result on the site links to its evidence.

## What's next

Keel only matters once it runs on real money, so every next step leads there.

- **Real users before any vote.** An opt in Keel vault on Mezo mainnet with small caps, so savers and borrowers use it with real MUSD and BTC before Mezo is asked to trust it with the main vault.
- **Loans that pay themselves.** A veBTC lock's rewards go toward its loan's interest automatically, so borrowing against locked Bitcoin gets cheaper the longer you hold.
- **Earn the vault.** An external audit and a clean record on mainnet, then a governance proposal for Mezo to move its idle savings into Keel with one `setStrategy` call.

**Links:** [Live](https://keel-psi-seven.vercel.app) · [Repo](https://github.com/jenzylove/keel) · [Video](https://youtu.be/iSvGuXuLK7A) · [Deck](https://claude.ai/artifact/HBtwT87sZMRoBzrzT7ahpK) · [Proof](https://keel-psi-seven.vercel.app/proof)
