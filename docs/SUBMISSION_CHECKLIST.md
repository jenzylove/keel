# Submission checklist

Tick an item only from the live app or a real transaction, never from intent.

## Hard rules
- [x] Uses MUSD (lending asset, savings vault)
- [x] Working deployment on Mezo testnet (contract links)
- [x] Track: DeFi, MUSD as working capital

## Deliverables
- [x] Live link
- [ ] Public GitHub repo
- [x] Deck (Slides artifact; share before submitting)
- [ ] 2-minute pitch video
- [ ] AKINDO form: TL;DR · how it works · target group · stack · track · chain · readiness · next three milestones · team
- [ ] KYB done (CAC registration)

## Product proof
- [x] Mainnet fork: Mezo multisig moves the real 7.38M from IdleStrategy into KeelStrategy
- [x] Testnet: savings vault copy with KeelStrategy plugged in; saver deposits and withdraws with yield
- [x] Testnet: BTC-collateral borrow, repay, liquidation
- [x] Testnet: veBTC deposit, vote passthrough, repay, return
- [ ] Testnet: reward claim forwarded to the borrower (unit-tested; the bribe posted on the old deployment can't be claimed, its owner key isn't here)
- [ ] Testnet: keeper liquidates loan #1 from its float (loan unhealthy since 2026-10-21; cron runs daily 06:17 UTC)
- [ ] Mainnet: opt-in vault (script dry-run passes on a fork; waiting on funding)
- [x] Testnet: permanent veBTC liquidation path
- [x] Rate step from the pool time-weighted price (Pyth dropped), refused when too soon
- [x] Config timelock: propose, refused early, applied after the delay
- [x] Throttle pauses new borrows below the pool floor
- [x] Withdraw of the full liquid buffer succeeds at max lending
- [x] `/demo` runs a real testnet borrow and repay with no sign-up
- [x] `/proof` and `/data` read live
- [x] Eval published with peg term on and off (docs/eval/RESULTS.md, /proof)
- [x] Testnet redeployed with the shortfall fix and the liquidation payment cap (fresh vault copy, 2026-10-21)
- [x] Release readiness audit done; Scope and limits written (docs/AUDIT.md)
- [x] Git history secret scan clean
