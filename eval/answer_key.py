"""Answer key for Keel's eval, written from the PRD's rules rather than from
the Solidity. It reads the numbers the contracts logged
(`forge test --match-path 'test/eval/*' -vv`), recomputes each one, and
writes eval/results.json.

Rules used (PRD section 3):
  rate      = 3% + 4% x utilisation (kink 80%) + peg premium
  premium   moves at most 1 point a week toward a target that is 0 at $0.995
            and 4% at $0.985, linear in between
  interest  simple over each period, compounded when the keeper steps the peg
  savers    get interest less a 10% reserve; interest is paid before principal
  BTC liq.  liquidator gets repay x 1.05 / price in BTC
  veBTC     sold whole at value less the bonus; surplus to the borrower,
            unrecovered principal written off, reserve first
Money is exact fractions here; the contracts use 18-decimal integers, so a
match within 1e-12 MUSD per loan is counted as exact.
"""
import json, os, re, subprocess, sys
from fractions import Fraction as F
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
YEAR = 365 * 86400
WEEK = 7 * 86400

def premium_target(p):
    if p >= F("0.995"): return F(0)
    if p <= F("0.985"): return F("0.04")
    return F("0.04") * (F("0.995") - p) / F("0.01")

def step(cur, tgt, mx=F("0.01")):
    return min(cur + mx, tgt) if tgt > cur else max(cur - mx, tgt)

def rate(u, prem):
    return F("0.03") + F("0.04") * min(u, F("0.8")) + (F("0.75") * (u - F("0.8")) if u > F("0.8") else 0) + prem

def replay(prices, max_prem):
    lent, lendable, principal = F(100_000), F(200_000), F(1_000_000)
    u = lent / lendable
    debt, prem, rows = lent, F(0), []
    for i, p in enumerate(prices):
        debt *= 1 + rate(u, prem) * WEEK / YEAR  # the week just ended, at the old premium
        prem = step(prem, premium_target(F(p)) if max_prem else F(0))
        r = rate(u, prem)
        rows.append({"week": i + 1, "price": p, "premium": prem, "rate": r,
                     "saverRate": r * lent * F("0.9") / principal, "debt": debt})
    interest = debt - lent
    return rows, {"paid": debt, "reserve": interest / 10, "yieldOwed": interest * 9 / 10}

def lifecycle():
    k = {}
    # BTC: 1 BTC at 80k, 40k borrowed, utilisation 40k/200k
    r = rate(F(40_000) / 200_000, 0)
    debt = 40_000 * (1 + r)
    k["btc.year.debt"] = debt
    k["btc.p60k.health"] = F(60_000) * F("0.65") / debt
    k["btc.p55k.health"] = F(55_000) * F("0.65") / debt
    k["btc.liq.seized"] = F(20_000) * F("1.05") / 55_000
    k["btc.liq.debtAfter"] = debt - 20_000
    interest = debt - 40_000
    k["btc.liq.reserve"] = interest / 10
    k["btc.liq.yieldOwed"] = interest * 9 / 10
    k["btc.liq.lent"] = F(40_000) - (20_000 - interest)
    # veBTC permanent, 1 BTC, 30k borrowed, 30 days, sold at 50k less 10%
    r = rate(F(30_000) / 200_000, 0)
    debt = 30_000 * (1 + r * 30 * 86400 / YEAR)
    sale = F(50_000) * F("0.9")
    k["veSurplus.debt"] = debt
    k["veSurplus.liqPaid"] = sale
    k["veSurplus.surplus"] = sale - debt
    k["veSurplus.badDebt"] = F(0)
    k["veSurplus.lent"] = F(0)
    # veBTC sold below its debt, after a BTC loan built a reserve
    r = rate(F(130_000) / 200_000, 0)
    btc_paid = 100_000 * (1 + r)
    reserve = (btc_paid - 100_000) / 10
    ve_debt = 30_000 * (1 + r)
    sale = F(30_000) * F("0.9")
    k["veUnder.btcPaid"] = btc_paid
    k["veUnder.reserveBefore"] = reserve
    k["veUnder.debt"] = ve_debt
    k["veUnder.liqPaid"] = sale
    # The PRD: savers' loss is what the sale didn't recover. Interest on a loan
    # that can't be repaid in full isn't income. So the sale repays principal
    # first, and the shortfall is written off against the reserve.
    shortfall = F(30_000) - sale
    k["veUnder.reserveAfter"] = max(reserve - shortfall, F(0))
    k["veUnder.badDebt"] = max(shortfall - reserve, F(0))
    k["veUnder.yieldOwed"] = (btc_paid - 100_000) * 9 / 10
    k["veUnder.lent"] = F(0)
    return k

def chain_logs():
    # forge picks solc 0.8.28 itself; set SOLC to point it at a local binary.
    cmd = ["forge", "test", "--match-path", "test/eval/*", "-vv"]
    if os.environ.get("SOLC"):
        cmd[2:2] = ["--use", os.environ["SOLC"]]
    out = subprocess.run(cmd, cwd=ROOT / "contracts", capture_output=True, text=True).stdout
    return {m[1]: F(int(m[2]), 10**18) for m in re.finditer(r"^\s+([\w.]+): (\d+)$", out, re.M)}

def main():
    weekly = [p for p in json.loads((ROOT / "eval/data/musd-weekly.json").read_text())["prices"]]
    got = chain_logs()
    tol = F(1, 10**12)
    checks, misses = [], []
    def check(key, want, unit="MUSD"):
        have = got.get(key)
        diff = None if have is None else abs(have - want)
        ok = diff is not None and diff <= tol * max(1, abs(want) / 1000)
        row = {"key": key, "chain": None if have is None else str(float(have)), "key_value": str(float(want)),
               "diff": None if diff is None else float(diff), "ok": ok}
        checks.append(row)
        if not ok: misses.append(row)
    series = {}
    for tag, mx in (("pegOn", F("0.04")), ("pegOff", F(0))):
        rows, end = replay(weekly, mx)
        for r in rows:
            for f in ("premium", "rate", "saverRate", "debt"):
                check(f"{tag}.w{r['week']:02d}.{f}", r[f])
        for f, v in end.items():
            check(f"{tag}.end.{f}", v)
        series[tag] = [{"week": r["week"], "price": float(r["price"]), "premium": float(r["premium"]),
                        "rate": float(r["rate"]), "saverRate": float(r["saverRate"])} for r in rows]
        series[tag + "End"] = {f: float(v) for f, v in end.items()}
    for key, want in lifecycle().items():
        check(key, want)
    res = {"checks": len(checks), "misses": misses, "series": series,
           "lifecycle": [c for c in checks if not c["key"].startswith("peg")]}
    (ROOT / "eval/results.json").write_text(json.dumps(res, indent=2))
    print(f"{len(checks)} checks, {len(misses)} misses")
    for mm in misses: print("  MISS", mm)
    sys.exit(1 if misses else 0)

if __name__ == "__main__":
    main()
