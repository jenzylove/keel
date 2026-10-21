import type { Metadata } from 'next';
import { evalRun, forkTests, notYet, testnetGroups } from '@/lib/proof';
import { addressUrl, deployed, txUrl } from '@/lib/chains';

export const metadata: Metadata = { title: 'Proof — Keel' };

export default function Page() {
  return (
    <div className="wrap">
      <section className="first">
        <div className="kicker">Every claim, with its evidence</div>
        <h1 style={{ marginTop: 18, maxWidth: '16ch', fontSize: 'clamp(36px, 5vw, 64px)' }}>What&apos;s real, and how you can check.</h1>
        <p className="lede" style={{ marginTop: 20 }}>
          Two kinds of proof. Mainnet-fork tests run Keel against Mezo&apos;s real contracts and balances. Testnet transactions run the
          whole product live.
        </p>
      </section>

      <section>
        <div className="split">
          <div>
            <div className="kicker">Mainnet fork · real state</div>
            <h2 style={{ marginTop: 14 }}>Mezo&apos;s real vault, plugged into Keel.</h2>
            <p style={{ marginTop: 16 }}>
              Only MUSD moves in these tests, so they run on a fork of Mezo mainnet. BTC calls can&apos;t be forked because BTC is a
              native precompile on Mezo, so BTC paths are proven on testnet below. Rerun with{' '}
              <span className="mono">forge test --match-path &apos;test/fork/*&apos;</span>.
            </p>
          </div>
          <table className="ledger">
            <tbody>
              {forkTests.map((t) => (
                <tr key={t.name}>
                  <td style={{ width: 24 }}>
                    <span className="dot" />
                  </td>
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
        </div>
      </section>

      <section>
        <div className="split">
          <div>
            <div className="kicker">Eval · answer key</div>
            <h2 style={{ marginTop: 14 }}>The numbers, checked independently.</h2>
            <p style={{ marginTop: 16 }}>{evalRun.headline}</p>
          </div>
          <table className="ledger">
            <tbody>
              {evalRun.rows.map((r) => (
                <tr key={r.what}>
                  <td>{r.what}</td>
                  <td className="num">{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {testnetGroups.map((g) => (
        <section key={g.title}>
          <div className="split">
            <div>
              <div className="kicker">Mezo testnet · live</div>
              <h2 style={{ marginTop: 14 }}>{g.title}</h2>
              <p style={{ marginTop: 16 }}>{g.how}</p>
            </div>
            <div className="scroll">
              <table className="ledger">
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.what}>
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
            </div>
          </div>
        </section>
      ))}

      <section>
        <div className="split">
          <div>
            <div className="kicker">Not proven live yet</div>
            <h2 style={{ marginTop: 14 }}>Said plainly.</h2>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
            {notYet.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>
              Contracts:{' '}
              {Object.entries(deployed.contracts).map(([k, v], i) => (
                <span key={k}>
                  {i ? ' · ' : ''}
                  <a href={addressUrl(v)}>{k}</a>
                </span>
              ))}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
