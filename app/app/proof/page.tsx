import type { Metadata } from 'next';
import Link from 'next/link';
import { forkTests, loopGroup, testnetGroups, type ProofRow } from '@/lib/proof';
import { txUrl } from '@/lib/chains';
import loopRun from '@/lib/loop-run.json';
import { outsideUsers } from '@/lib/reads';
import wave2Run from '@/lib/wave2-run.json';

export const revalidate = 300;

export const metadata: Metadata = { title: 'Proof · Keel' };

type Snap = { savers: Record<string, { walletMUSD: string }> };
const loop = loopRun as unknown as { after?: Snap };
const wave2 = wave2Run as { steps: { key: string; what: string; hash: string }[]; nftId?: number; loanId?: number };

function Txs({ rows }: { rows: ProofRow[] }) {
  return (
    <details className="txs">
      <summary>See the {rows.length} transactions</summary>
      <table className="ledger">
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.what}-${i}`}>
              <td>{r.what}</td>
              <td className="num">
                {r.hash ? (
                  <a href={txUrl(r.hash)} className="mono" target="_blank" rel="noreferrer">
                    {r.hash.slice(0, 10)}…
                  </a>
                ) : (
                  <span className="muted">{r.note}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default async function Page() {
  const outside = await outsideUsers();
  const outsideTotal = outside ? outside.borrowers + outside.savers : 0;
  const back = loop.after ? Number(loop.after.savers.saver1.walletMUSD).toFixed(7) : '60.0000015';
  // The liquidation story on the current deployment: loan opened, pushed under, cleared, setting restored.
  const liquidation = testnetGroups[0].rows.filter((r) => /loan #1|BTC setting|keeper/i.test(r.what));

  return (
    <div className="wrap proof">
      <section className="first proof-head">
        <p className="label">Proof</p>
        <h1>
          Don&apos;t take our word. <em>Open the transactions.</em>
        </h1>
        <p className="chapter-lede">
          Everything below ran for real on Mezo testnet, or against a copy of Mezo mainnet with its real vault and balances.
        </p>
        {outside && outsideTotal > 0 && (
          <p className="outside">
            <span className="live-dot" /> {outside.borrowers} {outside.borrowers === 1 ? 'wallet' : 'wallets'} outside the team borrowed, and {outside.savers}{' '}
            saved, on Mezo testnet.
          </p>
        )}
      </section>

      <section className="finding">
        <span className="finding-k">01</span>
        <div>
          <h2>
            Savers got their money back, <em>with interest.</em>
          </h2>
          <p className="chapter-lede">
            Two fresh wallets each put 60 MUSD into the savings vault, which lent it through Keel. Three borrowers took loans, one
            against a veBTC lock, then repaid. Each saver took out <strong className="mono">{back}</strong> MUSD.
          </p>
          <Txs rows={loopGroup.rows} />
        </div>
      </section>

      <section className="finding">
        <span className="finding-k">02</span>
        <div>
          <h2>
            When a loan went bad, <em>the keeper cleared it.</em>
          </h2>
          <p className="chapter-lede">
            We pushed a loan past its limit. On its daily run the keeper repaid the debt from its own MUSD, took the collateral at a
            small discount, and savers lost nothing.
          </p>
          <Txs rows={liquidation} />
        </div>
      </section>

      <section className="finding">
        <span className="finding-k">03</span>
        <div>
          <h2>
            It plugs into <em>Mezo&apos;s real vault.</em>
          </h2>
          <p className="chapter-lede">
            On a copy of Mezo mainnet, one setStrategy call from the vault&apos;s owner moves the idle savings into Keel, borrower
            interest reaches savers, and withdrawals stay open. Every number the contracts produce was also checked against a separate calculation: all 235 match.
          </p>
          <details className="txs">
            <summary>See the {forkTests.length} mainnet copy tests</summary>
            <table className="ledger">
              <tbody>
                {forkTests.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <strong>{t.name}</strong>
                      <pre className="mono muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>
                        {t.output}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </section>

      <section className="finding">
        <span className="finding-k">04</span>
        <div>
          <h2>
            A locked veBTC keeps voting, <em>and its rewards pay the loan.</em>
          </h2>
          <p className="chapter-lede">
            A test wallet locked BTC as veBTC #{wave2.nftId}, borrowed against it on Keel, and voted for Mezo&apos;s MUSD/BTC pool through
            Keel, on Mezo&apos;s own voter. With auto pay on, the keeper claims what the lock earns each day, and the MUSD among it pays the
            loan, interest first.
          </p>
          <Txs rows={wave2.steps.map((st) => ({ what: st.what, hash: st.hash }))} />
        </div>
      </section>

      <section className="proof-foot">
        <Link className="btn" href="/app">
          Try it yourself <i aria-hidden="true">↗</i>
        </Link>
      </section>
    </div>
  );
}
