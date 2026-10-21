import Link from 'next/link';
import { Candles } from '@/components/Candles';
import { DemoRunner } from './demo/DemoRunner';
import { Loop } from '@/components/Loop';
import { LoanTable } from '@/components/LoanTable';
import { keelState, keepLastGoodUnless, mainnetSnapshot, musdPriceHistory, musdWallTwap } from '@/lib/reads';
import { compact, pct, usd } from '@/lib/fmt';
import { addressUrl, deployed, MAINNET } from '@/lib/chains';

export const revalidate = 60;

export default async function Home() {
  const [snap, history, twap, keel] = await Promise.all([mainnetSnapshot(), musdPriceHistory(180), musdWallTwap(), keelState()]);
  keepLastGoodUnless(Object.values(snap).every((v) => v !== null) && keel !== null, 'Chain reads');

  return (
    <>
      <div className="wrap">
        <section className="first hero">
          <div className="kicker">A strategy for Mezo&apos;s MUSD Savings Vault</div>
          <h1 className="glow">
            Savers get paid when borrowers get <em>redeemed away.</em>
          </h1>
          <p className="lede">
            Most of what Mezo&apos;s savings vault pays comes from fees on redemptions, the same redemptions that emptied the loan
            book. {snap.troves === null ? 'Almost none are left.' : snap.troves === 1 ? 'One loan is left.' : `${snap.troves} loans are left.`} Keel lends the vault&apos;s idle MUSD to people holding BTC or veBTC, outside the redemption
            system, so savers earn from borrowers who stay. Borrowers can&apos;t be redeemed, only liquidated if their collateral
            falls too far.
          </p>

          <div className="actions">
            <Link className="btn" href="/use">
              Borrow on testnet
            </Link>
            <Link className="btn ghost" href="#live">
              Run a real loan, no wallet
            </Link>
            <Link className="btn ghost" href="/proof">
              See the proof
            </Link>
          </div>

          <Candles history={history} now={twap} />

          <div className="readings">
            <div className="reading">
              <div className="v">{compact(snap.idleSavings)}</div>
              <div className="l">MUSD of savers&apos; money in the vault&apos;s idle strategy, lent to no one</div>
              <div className="s">
                savers earned {snap.saverRate30d === null ? '—' : pct(snap.saverRate30d)} a year over the last 30 days · live
                · mainnet{snap.block ? ` block ${snap.block.toLocaleString()}` : ''}
              </div>
            </div>
            <div className="reading">
              <div className="v">{snap.troves ?? '—'}</div>
              <div className="l">open MUSD loans left on Mezo (there were 49 in June, from archive reads)</div>
              <div className="s">live · TroveManager</div>
            </div>
            <div className="reading">
              <div className="v">${compact(snap.wallStable)}</div>
              <div className="l">left on the dollar side of the mUSDC/MUSD wall that holds the peg</div>
              <div className="s">live · against {compact(snap.wallMusd)} MUSD</div>
            </div>
          </div>

        </section>

        <section>
          <div className="split">
            <div>
              <div className="kicker">Why it&apos;s happening</div>
              <h2 style={{ marginTop: 14 }}>MUSD has been under the line since July.</h2>
            </div>
            <div>
              <p style={{ marginTop: 0 }}>
                Redeeming 1 MUSD pays $1 of BTC minus a 0.75% fee: $0.9925. Whenever MUSD trades below that, anyone can buy it
                cheap and redeem it against the least-collateralised loan. Borrowers lose their BTC. That&apos;s what emptied the
                loan book.
              </p>
              <p className="mono muted" style={{ fontSize: 13 }}>
                Today: {twap ? `$${twap.toFixed(4)}` : '—'}, the 24-hour average of Mezo&apos;s own mUSDC/MUSD pool, which is the price
                Keel&apos;s mainnet oracle reads. Candles above: CoinGecko daily closes, last 180 days.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="split">
            <div>
              <div className="kicker">The loop</div>
              <h2 style={{ marginTop: 14 }}>Each problem feeds the next.</h2>
              <p style={{ marginTop: 18 }}>
                The vault&apos;s principal is lent to no one, so savers are paid from protocol fees. Two thirds of the last 30
                days came from BTC fees, which redemptions pay as they empty borrowers&apos; loans. That income eats its own source:
                with MUSD cheap, any new loan gets redeemed, and with no loans left there is little to pay savers. Mezo&apos;s own sink
                loan (the SafetyBuffer) has already been drained absorbing it:{' '}
                <span className="mono">{snap.safetyBufferBtc === null ? '—' : snap.safetyBufferBtc.toFixed(3)} BTC</span> left.
              </p>
              <p>
                Keel breaks the loop at its cheapest point: the money is already there. It just needs a safe place to be lent.
              </p>
            </div>
            <Loop />
          </div>
        </section>

        <section>
          <div className="kicker">How it works</div>
          <h2 style={{ marginTop: 14, maxWidth: '22ch' }}>One governance call plugs it in.</h2>
          <ol className="steps">
            <li>
              <strong>
                Mezo&apos;s multisig calls <span className="mono">setStrategy(Keel)</span>
              </strong>
              <p>
                The savings vault already supports swappable strategies. Its idle MUSD (7.38M on 2026-10-20) moves out of{' '}
                <span className="mono">IdleStrategy</span> into KeelStrategy. Proven on a mainnet fork with the real balance.
              </p>
            </li>
            <li>
              <strong>At least 80% stays liquid</strong>
              <p>
                The vault pulls from the strategy inside every withdrawal, so most of it never leaves. Savers can withdraw while that
                liquid share lasts; if withdrawals use it up while loans are out, the rest waits for repayments.
              </p>
            </li>
            <li>
              <strong>Up to 20% is lent against BTC or veBTC</strong>
              <p>
                Loans live in KeelMarket, not Mezo&apos;s TroveManager, so redemptions can&apos;t reach them. veBTC holders keep voting
                and keep their rewards. Mezo&apos;s FAQ says locked BTC can&apos;t be used as collateral. Here it can.
              </p>
            </li>
            <li>
              <strong>Interest goes to savers, 10% to a reserve</strong>
              <p>
                It&apos;s released over a week, so nobody can jump in just before a repayment. The reserve absorbs bad debt first.
                Liquidation sells collateral at a discount and returns any surplus to the borrower.
              </p>
            </li>
            <li>
              <strong>The rate leans against the peg</strong>
              <p>
                When MUSD trades under $0.995 the borrow rate steps up, 1% a week at most. Repaying becomes worth it and holding MUSD
                pays more. New borrowing pauses when the wall&apos;s dollar side runs thin, so Keel doesn&apos;t add to the drain on
                Mezo&apos;s defense.
              </p>
            </li>
          </ol>
        </section>

        <section id="live">
          <div className="kicker">Running now · Mezo testnet</div>
          <h2 className="glow" style={{ marginTop: 14, maxWidth: '18ch' }}>
            Run a real loan. <em>No wallet.</em>
          </h2>
          <p className="lede" style={{ marginTop: 18 }}>
            Keel&apos;s demo wallet locks BTC, borrows MUSD from the vault&apos;s idle savings, repays with interest that goes to savers,
            and gets its BTC back. Every step is a real transaction you can open.
          </p>
          <div className="terminal">
            <DemoRunner />
          </div>
          {keel ? (
            <>
              <div className="readings">
                <div className="reading">
                  <div className="v">{usd(keel.principal)}</div>
                  <div className="l">MUSD of savings in KeelStrategy</div>
                  <div className="s">{usd(keel.lent)} lent · {usd(keel.liquid)} liquid</div>
                </div>
                <div className="reading">
                  <div className="v">{pct(keel.rate)}</div>
                  <div className="l">borrow rate now, including a {pct(keel.pegPremium, 0)} peg premium</div>
                  <div className="s">savers earn {pct(keel.saverRate)} on the whole vault</div>
                </div>
                <div className="reading">
                  <div className="v">{keel.loans.length}</div>
                  <div className="l">open loans, none of them reachable by redemptions</div>
                  <div className="s">
                    {keel.borrowingOpen ? (
                      <>
                        <span className="dot" />
                        borrowing open
                      </>
                    ) : (
                      <>
                        <span className="dot warn" />
                        borrowing paused by the throttle
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="scroll" style={{ marginTop: 36 }}>
                <LoanTable loans={keel.loans} />
              </div>
              <p className="muted" style={{ fontSize: 14, marginTop: 18 }}>
                Contracts:{' '}
                <a href={addressUrl(deployed.contracts.keelStrategy)}>KeelStrategy</a> ·{' '}
                <a href={addressUrl(deployed.contracts.keelMarket)}>KeelMarket</a> ·{' '}
                <a href={addressUrl(deployed.contracts.vault)}>savings vault (our copy of Mezo&apos;s verified contract)</a>
              </p>
            </>
          ) : (
            <p className="muted">Testnet is not answering right now, so nothing is shown rather than a stale number.</p>
          )}
        </section>

        <section>
          <div className="kicker">What it doesn&apos;t do</div>
          <div className="split" style={{ marginTop: 14 }}>
            <h2>Honest limits.</h2>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
              <li>It doesn&apos;t mint MUSD or fix the peg on its own. At today&apos;s price its effect on the peg is roughly neutral.</li>
              <li>
                It doesn&apos;t move Mezo&apos;s real vault. Only Mezo&apos;s multisig (<a href={addressUrl(MAINNET.multisig, 'mainnet')}>0x98D8…7C7a</a>)
                can.
              </li>
              <li>Borrower demand on Mezo is small: about 60 free BTC, plus a handful of mid-sized veBTC locks (as of 2026-10-20).</li>
              <li>Savers carry bad-debt risk beyond the reserve. That&apos;s why lending is capped at 20%.</li>
              <li>The peg price comes from a thin pool. Day-long averaging and small weekly steps limit what moving it could gain.</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
