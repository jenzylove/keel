import Link from 'next/link';
import { KeelApp, type Market } from '@/components/KeelApp';
import { LoanTable } from '@/components/LoanTable';
import { keelState, mainnetSnapshot } from '@/lib/reads';
import { compact, pct, usd } from '@/lib/fmt';

export const revalidate = 60;

export default async function Home() {
  const [keel, snap] = await Promise.all([keelState(), mainnetSnapshot()]);
  const market: Market | null = keel
    ? {
        rate: keel.rate,
        saverRate: keel.saverRate,
        btcPrice: keel.btcPrice,
        borrowingOpen: keel.borrowingOpen,
        minLoan: keel.minLoan,
        risk: keel.risk,
      }
    : null;

  return (
    <div className="wrap">
      <section className="first app-hero">
        <div className="app-head">
          <div className="kicker">Live on Mezo testnet</div>
          <h1 className="glow">
            Borrow against your Bitcoin. <em>Never redeemed.</em>
          </h1>
          <p className="lede">
            Lock BTC or a veBTC lock and borrow MUSD. On Mezo today, a loan gets redeemed whenever MUSD trades cheap. A Keel loan
            can&apos;t be. Savers fund it and earn the interest.
          </p>
        </div>
        <KeelApp market={market} />
        <ul className="points">
            <li>Your BTC stays yours. Only a price fall can liquidate it, and any surplus comes back to you.</li>
            <li>veBTC keeps voting and earning while it backs your loan.</li>
            <li>Savers earn from borrowers who stay, not from loans being redeemed away.</li>
        </ul>
      </section>

      {keel ? (
        <section className="strip">
          <div className="readings" style={{ marginTop: 0 }}>
            <div className="reading">
              <div className="v">{usd(keel.principal)}</div>
              <div className="l">MUSD of savings in Keel</div>
              <div className="s">
                {usd(keel.lent)} lent · {usd(keel.liquid)} liquid
              </div>
            </div>
            <div className="reading">
              <div className="v">{pct(keel.rate)}</div>
              <div className="l">borrow rate now, including a {pct(keel.pegPremium, 0)} peg premium</div>
              <div className="s">savers earn {pct(keel.saverRate)} on the whole vault</div>
            </div>
            <div className="reading">
              <div className="v">{keel.loans.length}</div>
              <div className="l">open loans, none of them reachable by redemptions</div>
              <div className="s">live · Mezo testnet</div>
            </div>
          </div>
          {keel.loans.length > 0 && (
            <div className="scroll" style={{ marginTop: 28 }}>
              <LoanTable loans={keel.loans} />
            </div>
          )}
        </section>
      ) : (
        <p className="muted">Mezo testnet is not answering right now, so no numbers are shown rather than stale ones.</p>
      )}

      <section className="mezo-line">
        <p>
          Built to plug into Mezo&apos;s own savings vault, where{' '}
          <strong className="mono">{snap.idleSavings === null ? 'millions of' : compact(snap.idleSavings)}</strong> MUSD sits lent to
          no one. One governance call moves it in.{' '}
          <Link href="/why">Why Keel</Link> · <Link href="/proof">Proof</Link>
        </p>
      </section>
    </div>
  );
}
