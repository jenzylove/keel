import Link from 'next/link';
import { Candles } from '@/components/Candles';
import { Reveal } from '@/components/Reveal';
import { DemoRunner } from './demo/DemoRunner';
import { keelState, mainnetSnapshot, musdPriceHistory, musdWallTwap } from '@/lib/reads';
import { compact, pct, usd } from '@/lib/fmt';
import loopRun from '@/lib/loop-run.json';

export const revalidate = 60;

type Snap = { strategy: { unreleased: string }; savers: Record<string, { walletMUSD: string }> };
const loop = loopRun as unknown as { steps: unknown[]; after?: Snap };

export default async function Home() {
  const [keel, snap, history, twap] = await Promise.all([keelState(), mainnetSnapshot(), musdPriceHistory(180), musdWallTwap()]);
  const back = loop.after ? Number(loop.after.savers.saver1.walletMUSD).toFixed(7) : null;

  return (
    <>
      <Reveal />
      <div className="wrap">
        {/* ---------- hero ---------- */}
        <section className="landing">
          <div className="eyebrow">Live on Mezo testnet</div>
          <h1>
            Borrow against your Bitcoin.
            <br />
            <span className="accent">Never redeemed.</span>
          </h1>
          <div className="landing-row">
            <div>
              <p className="sub">
                On Mezo today, a loan gets redeemed whenever MUSD trades cheap. A Keel loan can&apos;t be. Lock BTC or a veBTC lock,
                borrow MUSD, and savers earn the interest.
              </p>
              <div className="cta">
                <Link className="btn" href="/app">
                  Open the app
                </Link>
                <Link className="btn ghost" href="#live">
                  Watch a real loan
                </Link>
              </div>
            </div>
            <ol className="rail">
              <li>
                <div>
                  <strong>Lock BTC or veBTC</strong>
                  <span>A veBTC lock keeps its voting power and rewards.</span>
                </div>
                <span className="arrow">↗</span>
              </li>
              <li>
                <div>
                  <strong>Borrow MUSD</strong>
                  <span>In Keel&apos;s own market. Redemptions can&apos;t reach it.</span>
                </div>
                <span className="arrow">→</span>
              </li>
              <li>
                <div>
                  <strong>Repay any time</strong>
                  <span>Interest goes to savers. Your collateral comes back.</span>
                </div>
                <span className="arrow">↘</span>
              </li>
            </ol>
          </div>
        </section>

        {keel && (
          <section className="figures rv">
            <div>
              <strong>{usd(keel.principal)}</strong>
              <span className="live">MUSD of savings in Keel</span>
            </div>
            <div>
              <strong>{pct(keel.rate)}</strong>
              <span>borrow rate now</span>
            </div>
            <div>
              <strong>{keel.loans.length}</strong>
              <span>open loans, none reachable by redemptions</span>
            </div>
          </section>
        )}

        {/* ---------- the problem ---------- */}
        <section id="problem" className="rv">
          <div className="sec-head">
            <span className="num">01</span>
            <div>
              <div className="eyebrow">The problem</div>
              <h2>Mezo&apos;s cheapest loan keeps getting taken back.</h2>
            </div>
          </div>
          <p className="sec-lede">
            Redeeming 1 MUSD pays $1 of BTC minus a 0.75% fee. While MUSD trades below $0.9925, anyone can buy it cheap and redeem
            it against the weakest loan, and that borrower loses their Bitcoin. MUSD has sat under that line since July.
          </p>
          <Candles history={history} now={twap} />
          <div className="facts">
            <div>
              <strong>{twap ? `$${twap.toFixed(4)}` : '—'}</strong>
              <span>MUSD today, the 24 hour average of Mezo&apos;s own pool</span>
            </div>
            <div>
              <strong>49 → {snap.troves ?? '—'}</strong>
              <span>open MUSD loans in June, and now</span>
            </div>
            <div>
              <strong>{snap.saverRate30d === null ? '—' : pct(snap.saverRate30d)}</strong>
              <span>what savers earned last month, mostly from those redemptions</span>
            </div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section id="how" className="rv">
          <div className="sec-head">
            <span className="num">02</span>
            <div>
              <div className="eyebrow">How it works</div>
              <h2>A loan that lives outside the redemption system.</h2>
            </div>
          </div>
          <ol className="flow">
            <li>
              <em>Lock</em>
              <p>Deposit BTC, or a veBTC lock. A veBTC lock keeps its voting power and rewards, claimed through Keel&apos;s contract.</p>
            </li>
            <li>
              <em>Borrow</em>
              <p>
                Take MUSD from savers, up to 50% of your BTC (45% or 40% for veBTC). The loan sits in Keel&apos;s own market, so no
                redemption can reach it.
              </p>
            </li>
            <li>
              <em>Earn</em>
              <p>Your interest goes to savers, released over a week. A tenth builds a reserve that takes any loss first.</p>
            </li>
            <li>
              <em>Repay</em>
              <p>Any time, and your collateral comes back. Only a deep price fall can liquidate a loan, and any surplus is returned.</p>
            </li>
          </ol>
        </section>

        {/* ---------- a real loan, here ---------- */}
        <section id="live" className="rv">
          <div className="sec-head">
            <span className="num">03</span>
            <div>
              <div className="eyebrow">Running now · Mezo testnet</div>
              <h2>Run a real loan. No wallet.</h2>
            </div>
          </div>
          <p className="sec-lede">
            Keel&apos;s demo wallet locks BTC, borrows MUSD from savers, repays with interest and gets its BTC back. Every step is a
            transaction you can open.
          </p>
          <div className="terminal">
            <DemoRunner />
          </div>
        </section>

        {/* ---------- both sides ---------- */}
        <section id="loop" className="rv">
          <div className="sec-head">
            <span className="num">04</span>
            <div>
              <div className="eyebrow">Both sides, for real</div>
              <h2>Savers in. Borrowers out. Everyone paid back.</h2>
            </div>
          </div>
          <div className="duo">
            <div>
              <h3>Savers</h3>
              <p>Two fresh wallets deposited 120 MUSD into the savings vault, which put it straight into Keel.</p>
              {back && (
                <p className="big-line">
                  Each withdrew <strong>{back}</strong> MUSD for their 60.
                </p>
              )}
            </div>
            <div>
              <h3>Borrowers</h3>
              <p>
                Three wallets borrowed 75 MUSD, one against a veBTC lock it created. They repaid with interest and got all their
                collateral back.
              </p>
              <p className="big-line">
                <strong>{loop.steps.length}</strong> real transactions.
              </p>
            </div>
          </div>
          <p className="sec-foot">
            <Link href="/proof">See every step on /proof →</Link>
          </p>
        </section>

        {/* ---------- safety ---------- */}
        <section id="safety" className="rv">
          <div className="sec-head">
            <span className="num">05</span>
            <div>
              <div className="eyebrow">What keeps savers safe</div>
              <h2>Built for a weak peg.</h2>
            </div>
          </div>
          <dl className="guards">
            <div>
              <dt>80% stays liquid</dt>
              <dd>At most a fifth of savings is ever lent. Withdrawals draw on the rest.</dd>
            </div>
            <div>
              <dt>The rate leans against the peg</dt>
              <dd>Below $0.995 the borrow rate steps up, a point a week at most, so repaying while MUSD is cheap pays.</dd>
            </div>
            <div>
              <dt>A brake on the wall</dt>
              <dd>New borrowing pauses when Mezo&apos;s peg pool runs thin. Repaying always stays open.</dd>
            </div>
            <div>
              <dt>Nothing changes overnight</dt>
              <dd>Risk and rate settings wait a fixed delay, and only the vault&apos;s owner can propose them.</dd>
            </div>
            <div>
              <dt>A keeper that acts</dt>
              <dd>A daily keeper claims savers&apos; yield and liquidates unhealthy loans from its own float.</dd>
            </div>
          </dl>
        </section>

        {/* ---------- built for mezo ---------- */}
        <section id="mezo" className="rv">
          <div className="sec-head">
            <span className="num">06</span>
            <div>
              <div className="eyebrow">Built for Mezo</div>
              <h2>One call plugs it into Mezo&apos;s vault.</h2>
            </div>
          </div>
          <div className="duo">
            <div>
              <p className="sec-lede" style={{ marginTop: 0 }}>
                Mezo&apos;s savings vault holds{' '}
                <strong className="mono">{snap.idleSavings === null ? 'millions of' : compact(snap.idleSavings)}</strong> MUSD that is lent
                to no one. Keel implements the vault&apos;s own strategy interface, so the multisig that owns it moves that money in
                with one <span className="mono">setStrategy</span> call.
              </p>
            </div>
            <ul className="checks">
              <li>Run on a copy of mainnet with Mezo&apos;s real vault and balance</li>
              <li>67 unit and fuzz tests, 6 mainnet fork tests</li>
              <li>235 numbers checked against an independent answer key</li>
              <li>No new admin: Keel is governed by the vault&apos;s owner</li>
            </ul>
          </div>
        </section>

        {/* ---------- faq ---------- */}
        <section id="faq" className="rv">
          <div className="sec-head">
            <span className="num">07</span>
            <div>
              <div className="eyebrow">Fair questions</div>
              <h2>Things worth asking.</h2>
            </div>
          </div>
          <div className="faq">
            <details>
              <summary>Can my Keel loan be redeemed?</summary>
              <p>No. Redemptions only reach loans in Mezo&apos;s TroveManager. Keel loans live in Keel&apos;s own market.</p>
            </details>
            <details>
              <summary>Then what can go wrong for a borrower?</summary>
              <p>
                If BTC falls far enough that your loan passes its limit, it can be liquidated: the collateral is sold at a discount,
                the loan is paid, and anything left comes back to you.
              </p>
            </details>
            <details>
              <summary>Doesn&apos;t lending MUSD push its price down?</summary>
              <p>
                Borrowed MUSD that is sold adds pressure while a loan is open. A cap, a brake on Mezo&apos;s peg pool and a rate that
                rises below $0.995 keep it small, and every loan is repaid in MUSD.
              </p>
            </details>
            <details>
              <summary>Who carries the risk for savers?</summary>
              <p>
                Savers do, beyond the reserve. That is why only a fifth can be lent, a tenth of interest builds the reserve, and a
                sale below the debt pays principal first.
              </p>
            </details>
            <details>
              <summary>Is this live with real money?</summary>
              <p>
                Not yet. It runs on Mezo testnet, and the mainnet integration is proven on a fork with Mezo&apos;s real vault. Mainnet
                comes next.
              </p>
            </details>
          </div>
        </section>

        {/* ---------- final call ---------- */}
        <section className="closer rv">
          <h2>
            The money is already there.
            <br />
            <span className="accent">It needs a safe place to be lent.</span>
          </h2>
          <div className="cta">
            <Link className="btn" href="/app">
              Open the app
            </Link>
            <Link className="btn ghost" href="/why">
              Why Keel
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
