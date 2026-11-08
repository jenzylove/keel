import { KeelApp, type Market } from '@/components/KeelApp';
import { LoanTable } from '@/components/LoanTable';
import { OnNet } from '@/components/WalletProvider';
import { keelState, type KeelState } from '@/lib/reads';
import type { NetKey } from '@/lib/networks';
import { pct, usd } from '@/lib/fmt';

export const revalidate = 60;
export const metadata = { title: 'Keel app', description: 'Borrow MUSD against BTC or veBTC outside Mezo’s redemptions, or save MUSD and earn the interest.' };

const marketOf = (keel: KeelState | null): Market | null =>
  keel
    ? { rate: keel.rate, saverRate: keel.saverRate, btcPrice: keel.btcPrice, borrowingOpen: keel.borrowingOpen, minLoan: keel.minLoan, risk: keel.risk }
    : null;

/** Savings, lending and every open loan on one network. */
function Book({ keel, net }: { keel: KeelState | null; net: NetKey }) {
  if (!keel) return <p className="muted">Mezo {net} is not answering right now, so no numbers are shown rather than stale ones.</p>;
  return (
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
            <LoanTable loans={keel.loans} net={net} />
          </div>
        </>
      )}
    </section>
  );
}

export default async function AppPage() {
  const [test, main] = await Promise.all([keelState('testnet'), keelState('mainnet')]);

  return (
    <div className="wrap app-page">
      <div className="app-col">
        <KeelApp markets={{ testnet: marketOf(test), mainnet: marketOf(main) }} />
      </div>

      <OnNet net="testnet">
        <Book keel={test} net="testnet" />
      </OnNet>
      <OnNet net="mainnet">
        <Book keel={main} net="mainnet" />
      </OnNet>
    </div>
  );
}
