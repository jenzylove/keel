'use client';

import { useState } from 'react';
import { txUrl } from '@/lib/chains';

type Ev = { label?: string; hash?: string; state: string; block?: number; error?: string; address?: string; debt?: number; collateralValue?: number; health?: number };

export function DemoRunner() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setEvents([]);
    setError(null);
    try {
      const r = await fetch('/api/demo', { method: 'POST' });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(j.error);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Ev;
          if (ev.state === 'done' || ev.state === 'error') ended = true;
          setEvents((e) => mergeEvent(e, ev));
        }
      }
      if (!ended) throw new Error('The run was cut off before it finished. The steps above link to the explorer, and the next run tidies up any loan left open.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const done = events.some((e) => e.state === 'done');
  const failed = events.find((e) => e.state === 'error');

  return (
    <div style={{ marginTop: 28 }}>
      <button className="btn" onClick={run} disabled={running}>
        {running ? 'Running on testnet…' : done ? 'Run it again' : 'Run a real loan'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {events.length > 0 && (
        <table className="ledger" style={{ marginTop: 28 }}>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td style={{ width: 24 }}>
                  <span className={`dot ${e.state === 'sending' || e.state === 'sent' ? 'warn' : e.state === 'reverted' || e.state === 'error' ? 'bad' : ''}`} />
                </td>
                <td>
                  {e.label ?? (e.state === 'done' ? 'Done: the loan opened, paid interest to savers, and closed.' : e.error)}
                  {e.address && <span className="mono muted"> {e.address}</span>}
                  {e.debt !== undefined && (
                    <span className="mono muted">
                      {' '}
                      debt {e.debt.toFixed(4)} MUSD · collateral worth {e.collateralValue?.toFixed(2)} MUSD · health {e.health?.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="num">
                  {e.hash ? (
                    <a href={txUrl(e.hash)} target="_blank" rel="noreferrer" className="mono">
                      {e.block ? `block ${e.block} ` : ''}
                      {e.hash.slice(0, 10)}…
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {failed && <p style={{ color: 'var(--danger)' }}>Stopped: {failed.error}</p>}
    </div>
  );
}

/** A confirmation replaces the 'sending' line for the same step. */
function mergeEvent(list: Ev[], ev: Ev): Ev[] {
  if (ev.label && ev.state !== 'sending') {
    const i = list.findIndex((e) => e.label === ev.label && e.state === 'sending');
    if (i >= 0) return list.map((e, j) => (j === i ? ev : e));
  }
  return [...list, ev];
}
