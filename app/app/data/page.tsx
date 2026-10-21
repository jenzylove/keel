import type { Metadata } from 'next';
import { keepLastGoodUnless, mainnetSnapshot, musdPriceHistory, musdWallTwap, troveHistory } from '@/lib/reads';
import { Waterline } from '@/components/Waterline';
import { compact, usd } from '@/lib/fmt';
import { addressUrl, MAINNET } from '@/lib/chains';

export const metadata: Metadata = { title: 'Mezo data — Keel' };
export const revalidate = 300;

export default async function Page() {
  const [snap, hist, prices, twap] = await Promise.all([mainnetSnapshot(), troveHistory(), musdPriceHistory(180), musdWallTwap()]);
  keepLastGoodUnless(Object.values(snap).every((v) => v !== null) && hist !== null, 'Chain reads');
  const supply = snap.musdSupply;
  const parts =
    supply && snap.enclaveDebt !== null && snap.bootstrapDebt !== null && snap.troveDebt !== null
      ? [
          { k: 'Owed by institutional Enclaves (2 positions, 0% interest on 2026-10-20)', v: snap.enclaveDebt, c: 'var(--btc)' },
          { k: 'Owed by the protocol bootstrap loan', v: snap.bootstrapDebt, c: 'var(--sea)' },
          { k: 'Owed by ordinary MUSD loans', v: snap.troveDebt, c: 'var(--danger)' },
        ]
      : null;
  const maxTroves = hist ? Math.max(...hist.map((h) => h.troves)) : 1;

  return (
    <div className="wrap">
      <section className="first">
        <div className="kicker">Read live from Mezo mainnet{snap.block ? ` · block ${snap.block.toLocaleString()}` : ''}</div>
        <h1 style={{ marginTop: 18, maxWidth: '18ch', fontSize: 'clamp(36px, 5vw, 64px)' }}>Where MUSD stands today.</h1>
        <p className="lede" style={{ marginTop: 20 }}>
          The chain figures here are read from Mezo mainnet when the page renders; the price history is CoinGecko&apos;s. The scripts behind them are in{' '}
          <span className="mono">scripts/data/</span> in the repo.
        </p>
      </section>

      <section>
        <div className="split">
          <div>
            <div className="kicker">The loan book</div>
            <h2 style={{ marginTop: 14 }}>MUSD borrowers, over ten months.</h2>
            <p style={{ marginTop: 16 }}>
              Open loans in Mezo&apos;s TroveManager, read from archive state at each point. Borrowers were redeemed out as MUSD fell
              below $0.9925.
            </p>
          </div>
          {hist ? (
            <table className="ledger">
              <thead>
                <tr>
                  <th>When</th>
                  <th className="num">Open loans</th>
                  <th className="num">Debt (MUSD)</th>
                  <th style={{ width: '40%' }} />
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.daysAgo}>
                    <td className="mono">{h.daysAgo === 0 ? 'now' : `${h.daysAgo} days ago`}</td>
                    <td className="num">{h.troves}</td>
                    <td className="num">{compact(h.debt)}</td>
                    <td>
                      <div style={{ height: 10, width: `${(h.troves / maxTroves) * 100}%`, background: h.daysAgo === 0 ? 'var(--danger)' : 'var(--ink-2)', borderRadius: 2 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Archive reads are not answering right now, so nothing is shown.</p>
          )}
        </div>
      </section>

      <section>
        <div className="kicker">The waterline</div>
        <h2 style={{ marginTop: 14 }}>MUSD price, 180 days.</h2>
        <p className="mono muted" style={{ fontSize: 14 }}>
          Now: {twap ? `$${twap.toFixed(4)}` : '—'}, the 24-hour average of the mUSDC/MUSD wall pool. Line: daily price from CoinGecko.
        </p>
        <Waterline history={prices} now={twap} />
      </section>

      <section>
        <div className="split">
          <div>
            <div className="kicker">Who owes the MUSD</div>
            <h2 style={{ marginTop: 14 }}>{compact(supply)} MUSD exists.</h2>
            <p style={{ marginTop: 16 }}>
              Almost all of it is owed by three parties. Ordinary borrowers, the people a stablecoin is for, owe almost none.
            </p>
          </div>
          {parts ? (
            <div>
              <div style={{ display: 'flex', height: 22, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--rule)' }}>
                {parts.map((p) => (
                  <div key={p.k} title={p.k} style={{ width: `${Math.max((p.v / (supply ?? 1)) * 100, 0.4)}%`, background: p.c }} />
                ))}
              </div>
              <table className="ledger" style={{ marginTop: 18 }}>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.k}>
                      <td style={{ width: 18 }}>
                        <span className="dot" style={{ background: p.c }} />
                      </td>
                      <td>{p.k}</td>
                      <td className="num">{usd(p.v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">Not available right now.</p>
          )}
        </div>
      </section>

      <section>
        <div className="kicker">Mezo&apos;s peg defenses</div>
        <div className="readings">
          <div className="reading">
            <div className="v">{compact(snap.idleSavings)}</div>
            <div className="l">MUSD in the savings vault&apos;s strategy, earning nothing</div>
            <div className="s">
              strategy <a href={addressUrl(snap.savingsStrategy ?? MAINNET.smusd, 'mainnet')}>{snap.savingsStrategy?.slice(0, 10)}…</a>
            </div>
          </div>
          <div className="reading">
            <div className="v">${compact(snap.wallStable)}</div>
            <div className="l">dollars left in the mUSDC/MUSD wall, against {compact(snap.wallMusd)} MUSD sold into it</div>
            <div className="s">
              <a href={addressUrl(MAINNET.wallPool, 'mainnet')}>pool</a>
            </div>
          </div>
          <div className="reading">
            <div className="v">{snap.safetyBufferBtc === null ? '—' : snap.safetyBufferBtc.toFixed(3)}</div>
            <div className="l">BTC left in Mezo&apos;s SafetyBuffer, the sink loan meant to absorb redemptions</div>
            <div className="s">
              <a href={addressUrl(MAINNET.safetyBuffer, 'mainnet')}>contract</a>
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 14, marginTop: 24 }}>
          veBTC locked: {snap.veBtcLocked === null ? '—' : `${snap.veBtcLocked.toFixed(1)} BTC`} · BTC price (MUSD PriceFeed):{' '}
          {snap.btcPrice === null ? '—' : `$${usd(snap.btcPrice)}`} · read at {new Date(snap.at).toUTCString()}
        </p>
      </section>
    </div>
  );
}
