import Link from 'next/link';
import { keelState, mainnetSnapshot } from '@/lib/reads';
import { compact, pct, usd } from '@/lib/fmt';

export const revalidate = 60;

export default async function Home() {
  const [keel, snap] = await Promise.all([keelState(), mainnetSnapshot()]);
  return (
    <div className="wrap">
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
            <Link className="btn ghost" href="/demo">
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
        <section className="figures">
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

      <section className="mezo-line">
        <p>
          Built to plug into Mezo&apos;s own savings vault, where{' '}
          <strong className="mono">{snap.idleSavings === null ? 'millions of' : compact(snap.idleSavings)}</strong> MUSD sits lent to
          no one. One governance call moves it in. <Link href="/why">Why Keel</Link> · <Link href="/proof">Proof</Link>
        </p>
      </section>
    </div>
  );
}
