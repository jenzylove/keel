export const usd = (v: number | null, digits = 0) =>
  v === null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const compact = (v: number | null) =>
  v === null
    ? '—'
    : v >= 1e6
      ? `${(v / 1e6).toFixed(2)}M`
      : v >= 1e3
        ? `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k`
        : v.toFixed(v < 10 ? 2 : 0);

export const pct = (v: number | null, digits = 2) => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`);

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
