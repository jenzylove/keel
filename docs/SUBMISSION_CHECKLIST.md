# Submission checklist

Tick an item only from the live app or a real transaction, never from intent.

## Hard rules
- [ ] Uses MUSD (lending asset, savings vault)
- [ ] Working deployment on Mezo testnet (contract links)
- [ ] Track: DeFi, MUSD as working capital

## Deliverables
- [ ] Live link
- [ ] Public GitHub repo
- [ ] Deck
- [ ] 2-minute pitch video
- [ ] AKINDO form: TL;DR · how it works · target group · stack · track · chain · readiness · next three milestones · team
- [ ] KYB done (CAC registration)

## Product proof
- [ ] Mainnet fork: Mezo multisig moves the real 7.38M from IdleStrategy into KeelStrategy
- [ ] Testnet: savings vault copy with KeelStrategy plugged in; saver deposits and withdraws with yield
- [ ] Testnet: BTC-collateral borrow, repay, liquidation
- [ ] Testnet: veBTC deposit, vote passthrough, reward claim, repay, return
- [ ] Testnet: permanent veBTC liquidation path
- [ ] Rate step with a fresh Pyth price, and holding when the price is stale
- [ ] Throttle pauses new borrows below the pool floor
- [ ] Withdraw of the full liquid buffer succeeds at max lending
- [ ] `/demo` runs a real testnet borrow and repay with no sign-up
- [ ] `/proof` and `/data` read live
- [ ] Eval published with peg term on and off
- [ ] Release readiness audit done; Scope and limits written
- [ ] Git history secret scan clean
