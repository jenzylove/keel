/** MUSD's last 180 days as a band of candles under the redemption waterline.
 *  Daily closes only (CoinGecko), so each candle runs from the previous close
 *  to today's: green when it rose, amber when it fell. No made-up wicks. */
export function Candles({
  history,
  now,
  floor = 0.9925,
}: {
  history: { t: number; p: number }[] | null;
  now: number | null;
  floor?: number;
}) {
  const W = 1200;
  const H = 240;
  const top = 1.0095;
  const bottom = 0.982;
  const y = (p: number) => ((top - Math.min(Math.max(p, bottom), top)) / (top - bottom)) * H;
  if (!history || history.length < 2) return null;

  const n = history.length - 1;
  const step = W / n;
  const body = Math.max(2, step * 0.56);
  const candles = history.slice(1).map((d, i) => {
    const open = history[i].p;
    const up = d.p >= open;
    const y1 = y(Math.max(open, d.p));
    const h = Math.max(2, Math.abs(y(open) - y(d.p)));
    return { x: i * step + (step - body) / 2, y: y1, h, up, t: d.t };
  });
  const yFloor = y(floor);
  const last = candles[candles.length - 1];
  const nowY = y(now ?? history[history.length - 1].p);
  let under: string | null = null;
  for (let i = 0; i < history.length - 7; i++) {
    if (history.slice(i, i + 7).every((d) => d.p < floor)) {
      under = new Date(history[i].t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      break;
    }
  }

  return (
    <svg className="candles" viewBox={`-4 -20 ${W + 8} ${H + 56}`} role="img" aria-label={`MUSD's daily price for 180 days against the $${floor} redemption line${under ? `; below it since ${under}` : ''}`}>
      <line className="par" x1="0" x2={W} y1={y(1)} y2={y(1)} />
      <text className="label" x={W} y={y(1) - 8} textAnchor="end">$1.00 peg</text>
      {candles.map((c, i) => (
        <rect
          key={c.t}
          className={`c ${c.up ? 'up' : 'down'}`}
          x={c.x.toFixed(1)}
          y={c.y.toFixed(1)}
          width={body.toFixed(1)}
          height={c.h.toFixed(1)}
          rx="1"
          style={{ animationDelay: `${(i * 8).toFixed(0)}ms` }}
        />
      ))}
      <line className="wl" x1="0" x2={W} y1={yFloor} y2={yFloor} />
      <text className="label hot" x="0" y={H + 30}>
        ${floor} · below this line, redeeming MUSD pays and loans get eaten{under ? ` · under since ${under}` : ''}
      </text>
      {now !== null && (
        <g>
          <circle className="now" cx={last.x + body / 2} cy={nowY} r="6" />
          <text className="label" x={W - 14} y={Math.min(nowY, yFloor) - 12} textAnchor="end">
            now ${now.toFixed(4)}
          </text>
        </g>
      )}
    </svg>
  );
}
