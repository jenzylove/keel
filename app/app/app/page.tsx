import { KeelApp, type Market } from '@/components/KeelApp';
import { LoanTable } from '@/components/LoanTable';
import { keelState } from '@/lib/reads';
import { pct, usd } from '@/lib/fmt';

export const revalidate = 60;
export const metadata = { title: 'Keel app', description: 'Borrow MUSD against BTC or veBTC outside Mezo’s redemptions, or save MUSD and earn the interest.' };

export default async function AppPage() {
  const keel = await keelState();
  const market: Market | null = keel
    ? { rate: keel.rate, saverRate: keel.saverRate, btcPrice: keel.btcPrice, borrowingOpen: keel.borrowingOpen, minLoan: keel.minLoan, risk: keel.risk }
    : null;

  return (
    <div className="wrap app-page">
      <div className="app-col">
        <KeelApp market={market} />
      </div>

      {keel ? (
        <section className="book">
          <div className="stats">
            <div>
              <span>Savings in Keel</span>
              <strong>{usd(keel.principal)} MUSD</strong>
            </div>
            <div>
              <span>Lent</span>
              <strong>{usd(keel.lent)} MUSD</strong>
            </div>
            <div>
              <span>Borrow rate</span>
              <strong>{pct(keel.rate)}</strong>
            </div>
            <div>
              <span>Savers earn</span>
              <strong>{pct(keel.saverRate)}</strong>
            </div>
          </div>
          {keel.loans.length > 0 && (
            <>
              <h2 className="book-title">Every open loan</h2>
              <div className="scroll">
                <LoanTable loans={keel.loans} />
              </div>
            </>
          )}
        </section>
      ) : (
        <p className="muted">Mezo testnet is not answering right now, so no numbers are shown rather than stale ones.</p>
      )}
    </div>
  );
}
