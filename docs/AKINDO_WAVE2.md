# AKINDO Wave 2 submission, ready to paste

**Team:** JDollar (solo builder: product, contracts, app). X: @dollar782

**Deck:** https://github.com/jenzylove/keel/blob/main/docs/Keel-deck.pdf
**Video:** [new Wave 2 video link]
**Live demo:** https://keel-psi-seven.vercel.app (Testnet | Mainnet switch in the top bar)
**Repo:** https://github.com/jenzylove/keel

## Updates in this Wave

Every item answers a note from the Wave 1 review.

- Live on Mezo mainnet with real money. An opt in Keel vault runs against Mezo's own MUSD, PriceFeed and pool price. Keel's own wallet ran the whole path first: 10 MUSD saved (bought on Mezo's BTC/MUSD pool), then 0.00016 BTC locked and 5 MUSD borrowed, outside the redemption system. Proof: https://keel-psi-seven.vercel.app/proof
- No single key on mainnet. The vault, and so every Keel setting, belongs to a 48 hour TimelockController (0x2f13…778a). A daily keeper with its own key and MUSD float watches the mainnet loans as well as testnet.
- One app for both networks. A Testnet | Mainnet switch moves the wallet to the right chain; testnet stays free for anyone without BTC.
- veBTC rewards pay the loan. A lock keeps voting through Keel on Mezo's voter; the app has Vote, Claim rewards to loan and an auto pay switch, and the keeper claims for loans that opt in. A testnet veBTC loan has voted for the MUSD/BTC pool with auto pay on [add: its rewards paid the loan, tx].
- Withdrawals degrade gracefully. withdrawable() shows exactly what can leave now, the reserve covers a leaving saver, borrowing pauses before liquid savings fall under a 10% buffer, and the app caps withdrawals at that amount.
- Who pays for the keeper and hosting: a timelocked protocol share of interest, 5% on the mainnet vault.
- Verified: Keel's contracts, the mainnet timelock and the vault's idle strategy are verified on Sourcify with an exact match; the vault runs Mezo's own savings vault source, vendored unchanged (Mezo's explorer verifier lists no compilers yet).
- New users: a wallet with no BTC gets a guide to free test BTC, or USDC/ETH to BTC through Mezo's own bridge.
- Materials: a PDF deck in the repo, the video's script and subtitles committed, team and roles named.
- 91 contract tests (85 unit and fuzz, 6 on a copy of Mezo mainnet) and 235 numbers checked against an independent answer key.

## Milestones

**Next:** real savers and borrowers on the opt in mainnet vault, with small caps, before Mezo is asked to trust Keel with the main vault.
**Then:** an external audit and a clean mainnet record.
**After:** a governance proposal for Mezo to move its idle savings into Keel with one setStrategy call.
