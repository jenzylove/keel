/** MUSD's price over time against the redemption waterline ($0.9925). Below the
 *  line, redeeming MUSD pays, so every MUSD loan is food for redemptions. */
export function Waterline({
  history,
  now,
  floor = 0.9925,
}: {
  history: { t: number; p: number }[] | null;
  now: number | null;
  floor?: number;
}) {
  const W = 1200;
  const H = 340;
  const top = 1.012;
  const bottom = 0.975;
  const y = (p: number) => ((top - Math.min(Math.max(p, bottom), top)) / (top - bottom)) * H;
  const yFloor = y(floor);
  const yPar = y(1);

  let path = '';
  let lastX = W - 90;
  let lastY = now !== null ? y(now) : yFloor;
  let crossLabel: { x: number; date: string } | null = null;
  if (history && history.length > 1) {
    const t0 = history[0].t;
    const t1 = history[history.length - 1].t;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * (W - 90);
    path = history.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join(' ');
    lastX = x(t1);
    lastY = y(now ?? history[history.length - 1].p);
    // First day it closed under the waterline and stayed there for a week.
    for (let i = 0; i < history.length - 7; i++) {
      if (history.slice(i, i + 7).every((d) => d.p < floor)) {
        crossLabel = { x: x(history[i].t), date: new Date(history[i].t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
        break;
      }
    }
  }

  const wave = Array.from({ length: 22 }, (_, i) => `q 30 ${i % 2 ? 6 : -6} 60 0`).join(' ');

  return (
    <svg className="waterline" viewBox={`0 0 ${W} ${H + 40}`} role="img" aria-label={`MUSD price against the $${floor} redemption waterline`}>
      <rect className="water" x="0" y={yFloor} width={W} height={H - yFloor + 40} />
      <g className="wave">
        <path d={`M0,${yFloor} ${wave}`} fill="none" stroke="var(--sea)" strokeWidth="1" opacity="0.5" />
      </g>
      <line x1="0" x2={W} y1={yPar} y2={yPar} stroke="var(--rule)" strokeDasharray="4 6" />
      <text className="label" x="0" y={yPar - 8}>$1.00 peg</text>
      <line className="line" x1="0" x2={W} y1={yFloor} y2={yFloor} />
      <text className="label strong" x="0" y={H + 26}>
        ${floor} waterline · below it, redeeming MUSD pays and loans get eaten
      </text>
      {path && <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />}
      {crossLabel && (
        <g>
          <line x1={crossLabel.x} x2={crossLabel.x} y1={yFloor - 46} y2={yFloor} stroke="var(--btc)" strokeDasharray="2 4" />
          <text className="label" x={crossLabel.x + 6} y={yFloor - 50}>
            under since {crossLabel.date}
          </text>
        </g>
      )}
      {now !== null && (
        <g>
          <circle className="price" cx={lastX} cy={lastY} r="7" />
          <text className="label strong" x={Math.min(lastX + 12, W - 80)} y={lastY + 5}>
            ${now.toFixed(4)}
          </text>
        </g>
      )}
    </svg>
  );
}
