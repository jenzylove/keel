import type { KeelLoan } from '@/lib/reads';
import { addressUrl } from '@/lib/chains';
import { short, usd } from '@/lib/fmt';

export function LoanTable({ loans }: { loans: KeelLoan[] }) {
  if (loans.length === 0) return <p className="muted">No open loans right now.</p>;
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th>Loan</th>
          <th>Collateral</th>
          <th className="num">Worth (MUSD)</th>
          <th className="num">Debt (MUSD)</th>
          <th className="num">Limit</th>
          <th className="num">Health</th>
          <th>Borrower</th>
        </tr>
      </thead>
      <tbody>
        {loans.map((l) => {
          const h = l.health;
          const cls = h === null ? '' : h < 1 ? 'bad' : h < 1.2 ? 'warn' : '';
          return (
            <tr key={l.id}>
              <td className="mono">#{l.id}</td>
              <td>
                {l.kind === 'BTC' ? (
                  <>{l.btc.toFixed(5)} BTC</>
                ) : (
                  <>
                    veBTC #{l.nftId} <span className="tag">{l.permanent ? 'permanent' : 'timed'}</span>
                  </>
                )}
              </td>
              <td className="num">{usd(l.collateralValue, 2)}</td>
              <td className="num">{usd(l.debt, 4)}</td>
              <td className="num">{usd(l.borrowLimit, 2)}</td>
              <td className="num">
                <span className={`dot ${cls}`} />
                {h === null ? '∞' : h.toFixed(2)}
              </td>
              <td className="mono">
                <a href={addressUrl(l.owner)}>{short(l.owner)}</a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
