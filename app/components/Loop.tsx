/** The four-step loop that emptied MUSD borrowing, with Keel's cut marked. */
export function Loop() {
  const nodes = [
    { x: 300, y: 50, t: ['MUSD under', '$0.9925'] },
    { x: 530, y: 210, t: ['Loans get', 'redeemed'] },
    { x: 300, y: 370, t: ['Savers paid', 'by redemptions'] },
    { x: 70, y: 210, t: ['No reason', 'to hold MUSD'] },
  ];
  const arc = (a: (typeof nodes)[number], b: (typeof nodes)[number]) => {
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18;
    const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.18;
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  };
  return (
    <svg viewBox="0 0 680 430" style={{ width: '100%', height: 'auto' }} role="img" aria-label="The loop: MUSD under the waterline, loans redeemed, savers paid only by those redemptions, no reason to hold MUSD">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)" />
        </marker>
      </defs>
      {nodes.map((a, i) => {
        const b = nodes[(i + 1) % nodes.length];
        const isCut = i === 1;
        return (
          <path
            key={i}
            d={arc(a, b)}
            fill="none"
            stroke={isCut ? 'var(--rule)' : 'var(--ink-2)'}
            strokeWidth="1.6"
            strokeDasharray={isCut ? '5 6' : undefined}
            markerEnd="url(#arr)"
            pathLength={100}
            style={{ strokeDashoffset: 0 }}
          />
        );
      })}
      {nodes.map((n, i) => (
        <g key={i}>
          <rect x={n.x - 72} y={n.y - 30} width="144" height="60" rx="30" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4" />
          {n.t.map((line, j) => (
            <text key={j} x={n.x} y={n.y - 4 + j * 18} textAnchor="middle" style={{ font: '500 14px var(--sans)', fill: 'var(--ink)' }}>
              {line}
            </text>
          ))}
        </g>
      ))}
      <g>
        <circle cx="452" cy="318" r="7" fill="var(--btc)" />
        <text x="466" y="314" style={{ font: '500 13px var(--mono)', fill: 'var(--btc)' }}>
          Keel cuts here:
        </text>
        <text x="466" y="332" style={{ font: '400 13px var(--mono)', fill: 'var(--ink-2)' }}>
          loans outside redemptions,
        </text>
        <text x="466" y="350" style={{ font: '400 13px var(--mono)', fill: 'var(--ink-2)' }}>
          paid from idle savings
        </text>
      </g>
    </svg>
  );
}
