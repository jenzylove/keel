import Link from 'next/link';
import { Candles } from '@/components/Candles';
import { Reveal } from '@/components/Reveal';
import { Orb } from '@/components/Orb';
import { Spine } from '@/components/Spine';
import { Steps, type Step } from '@/components/Steps';
import { DemoRunner } from './demo/DemoRunner';
import { keelState, mainnetSnapshot, musdPriceHistory, musdWallTwap } from '@/lib/reads';
import { compact, pct, usd } from '@/lib/fmt';
import loopRun from '@/lib/loop-run.json';

export const revalidate = 60;

type Snap = { strategy: { unreleased: string }; savers: Record<string, { walletMUSD: string }> };
const loop = loopRun as unknown as { steps: unknown[]; after?: Snap };

export default async function Home() {
  const [keel, snap, history, twap] = await Promise.all([keelState(), mainnetSnapshot(), musdPriceHistory(180), musdWallTwap()]);
  const back = loop.after ? Number(loop.after.savers.saver1.walletMUSD).toFixed(7) : '60.0000015';

  const steps: Step[] = [
    {
      name: 'Lock',
      title: 'Put up BTC, or a veBTC lock.',
      body: 'A veBTC lock keeps its voting power and rewards while it backs your loan, claimed through Keel’s contract.',
      figure: keel ? `${keel.risk.btc[0] / 100}%` : '50%',
      caption: 'of your BTC’s value you can borrow',
    },
    {
      name: 'Borrow',
      title: 'Take MUSD from savers.',
      body: 'The loan lives in Keel’s own market, not Mezo’s loan book, so no redemption can reach it however cheap MUSD trades.',
      figure: keel ? pct(keel.rate) : '—',
      caption: 'borrow rate right now',
    },
    {
      name: 'Earn',
      title: 'Your interest pays savers.',
      body: 'It is released to the savings vault over a week. A tenth builds a reserve that takes any loss before savers do.',
      figure: keel ? usd(keel.principal) : '—',
      caption: 'MUSD of savings lent through Keel',
    },
    {
      name: 'Repay',
      title: 'Pay back any time.',
      body: 'Your collateral comes straight back. Only a deep fall in BTC can liquidate a loan, and any surplus returns to you.',
      figure: keel ? String(keel.loans.length) : '—',
      caption: 'open loans, none reachable by redemptions',
    },
  ];

  return (
    <>
      <Reveal />
      <Spine />

      {/* ---------- hero: one framed screen ---------- */}
      <section className="front">
        <div className="front-frame">
          <div className="front-copy">
            <span className="front-tag">Live on Mezo testnet</span>
            <h1>
              Borrow against Bitcoin.
              <br />
              <em>Never redeemed.</em>
            </h1>
            <p className="front-sub">
              Lock BTC or veBTC and borrow MUSD where no redemption can take it. Savers earn the interest.
            </p>
            <div className="cta">
              <Link className="btn" href="/app">
                Open the app <i aria-hidden="true">↗</i>
              </Link>
              <Link className="btn ghost" href="#how">
                How it works
              </Link>
            </div>
          </div>
          <div className="front-orb">
            <Orb />
          </div>
          <a className="scroll-cue" href="#problem" aria-label="Scroll to the story">
            <span />
          </a>
        </div>
      </section>

      {/* ---------- body: one red line, every section hangs off it ---------- */}
      <div className="wrap spine-wrap">
        <div className="spine" aria-hidden="true">
          <span className="spine-fill" />
        </div>

        <section id="problem" className="chapter rv">
          <span className="node" />
          <p className="label">The problem</p>
          <h2>
            On Mezo, the cheapest loan <em>keeps getting taken back.</em>
          </h2>
          <p className="chapter-lede">
            Redeeming 1 MUSD pays $1 of BTC minus a 0.75% fee. While MUSD trades below $0.9925, anyone can buy it cheap and redeem it
            against the weakest loan, and that borrower loses their Bitcoin. MUSD has sat under that line since July.
          </p>
          <div className="drop">
            <strong>
              49<b>→</b>
              {snap.troves ?? '1'}
            </strong>
            <span>open MUSD loans in June, and today</span>
          </div>
          <Candles history={history} now={twap} />
        </section>

        <section id="how" className="chapter rv">
          <span className="node" />
          <p className="label">How it works</p>
          <h2>
            A loan that lives <em>outside the redemption system.</em>
          </h2>
          <Steps steps={steps} />
        </section>

        <section id="live" className="chapter rv">
          <span className="node" />
          <p className="label">Running now</p>
          <h2>
            Run a real loan. <em>No wallet needed.</em>
          </h2>
          <p className="chapter-lede">
            Keel’s demo wallet locks BTC, borrows MUSD from savers, repays with interest and gets its BTC back. Every step is a transaction
            you can open.
          </p>
          <div className="console">
            <div className="console-bar">
              <span className="live-dot" /> Mezo testnet · demo wallet
            </div>
            <DemoRunner />
          </div>
        </section>

        <section id="loop" className="chapter rv">
          <span className="node" />
          <p className="label">Both sides, for real</p>
          <p className="verdict">
            Two savers put in <em>60</em> MUSD each.
            <br />
            Each took out <em>{back}</em>.
          </p>
          <p className="chapter-lede">
            Three borrowers took 75 MUSD between them, one against a veBTC lock it made, then repaid with interest and got every bit of
            collateral back. {loop.steps.length} real transactions, start to finish.
          </p>
          <Link className="textlink" href="/proof">
            See every transaction ↗
          </Link>
        </section>

        <section id="safety" className="chapter rv">
          <span className="node" />
          <p className="label">What keeps savers safe</p>
          <h2>
            Built for a <em>weak peg.</em>
          </h2>
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
              <dd>New borrowing pauses when Mezo’s peg pool runs thin. Repaying always stays open.</dd>
            </div>
            <div>
              <dt>Nothing changes overnight</dt>
              <dd>Risk and rate settings wait a fixed delay, and only the vault’s owner can propose them.</dd>
            </div>
            <div>
              <dt>A keeper that acts</dt>
              <dd>A daily keeper claims savers’ yield and liquidates unhealthy loans from its own float.</dd>
            </div>
          </dl>
        </section>

        <section id="mezo" className="chapter rv">
          <span className="node" />
          <p className="label">Built for Mezo</p>
          <div className="idle">
            <strong>{snap.idleSavings === null ? '7.38M' : compact(snap.idleSavings)}</strong>
            <span>MUSD sits in Mezo’s savings vault today, lent to no one.</span>
          </div>
          <p className="chapter-lede">
            Keel implements the vault’s own strategy interface, so the multisig that owns it moves that money in with one call.
          </p>
          <code className="call">vault.setStrategy(keel)</code>
        </section>

        <section id="faq" className="chapter rv">
          <span className="node" />
          <p className="label">Fair questions</p>
          <div className="faq">
            <details>
              <summary>Can my Keel loan be redeemed?</summary>
              <p>No. Redemptions only reach loans in Mezo’s TroveManager. Keel loans live in Keel’s own market.</p>
            </details>
            <details>
              <summary>Then what can go wrong for a borrower?</summary>
              <p>
                If BTC falls far enough that your loan passes its limit, it can be liquidated: the collateral is sold at a discount, the
                loan is paid, and anything left comes back to you.
              </p>
            </details>
            <details>
              <summary>Doesn’t lending MUSD push its price down?</summary>
              <p>
                Borrowed MUSD that is sold adds pressure while a loan is open. A cap, a brake on Mezo’s peg pool and a rate that rises
                below $0.995 keep it small, and every loan is repaid in MUSD.
              </p>
            </details>
            <details>
              <summary>Who carries the risk for savers?</summary>
              <p>
                Savers do, beyond the reserve. That is why only a fifth can be lent, a tenth of interest builds the reserve, and a sale
                below the debt pays principal first.
              </p>
            </details>
            <details>
              <summary>Is this live with real money?</summary>
              <p>
                Not yet. It runs on Mezo testnet, and the mainnet integration is proven on a fork with Mezo’s real vault. Mainnet comes
                next.
              </p>
            </details>
          </div>
        </section>
      </div>

      {/* ---------- closing frame, a bookend to the hero ---------- */}
      <section className="ender rv">
        <div className="ender-frame">
          <h2>
            The money is already there.
            <br />
            <em>It needs a safe place to be lent.</em>
          </h2>
          <div className="cta">
            <Link className="btn" href="/app">
              Open the app <i aria-hidden="true">↗</i>
            </Link>
            <Link className="btn ghost" href="/proof">
              See the proof
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
