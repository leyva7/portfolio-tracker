#!/usr/bin/env python3
"""Builds market-week.json (the "The week in the markets" section of the weekly email).

Usage: python3 -I market_week.py <data.json> <db_folder> <TODAY> <quotes_folder> <headlines.json> <out.json>

<quotes_folder> holds what the routine downloads from Alpha Vantage:
  SPY.csv, EEM.csv, IUSN.DEX.csv, 4GLD.DEX.csv -> TIME_SERIES_DAILY as CSV: header + at least 7 rows
     (timestamp,open,high,low,close,volume; newest first)
  btc.json -> {"now": <TODAY's BTC/EUR close>, "weekAgo": <close 7 days ago>} (DIGITAL_CURRENCY_DAILY)
<headlines.json> = [{"title", "source", "url"}, ...] (at most 5; may be missing or empty).

Each quote's week runs from the last close within the 7 days before TODAY back to the previous week's
last close (the close 7 days earlier, or the nearest one before it). If the last close is more than
4 days old, that row is left out. SPY and EEM are converted to euros with navs/fx-USD from the database.
If nothing is left to show, no file is written (the email goes out without the section).
"""
import json, os, sys, datetime as dt

DATA, DB, TODAY, QUOTES, HEADLINES, OUT = sys.argv[1:7]
today = dt.date.fromisoformat(TODAY)


def _config():
    """Reads config.json (next to this script; not versioned) or, if missing, config.example.json."""
    base = os.path.dirname(os.path.abspath(__file__))
    for n in ("config.json", "config.example.json"):
        p = os.path.join(base, n)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    return {}


CFG = _config()
FUNDS = [(f["id"], f["short"], f["index"], f["symbol"], f["usd"]) for f in CFG.get("funds", [])]  # (fund, short name, index, symbol, in dollars)


def load(p):
    with open(p, encoding="utf-8") as f:
        x = json.load(f)
    return x.get("data", x) if isinstance(x, dict) and "data" in x and len(x) <= 4 else x


def series(sym):
    p = os.path.join(QUOTES, sym + ".csv")
    if not os.path.exists(p):
        return {}
    out = {}
    try:
        lines = [l for l in open(p, encoding="utf-8").read().replace("\\r\\n", "\n").splitlines() if l.strip()]
        h = [x.strip() for x in lines[0].split(",")]
        for l in lines[1:]:
            r = dict(zip(h, [x.strip() for x in l.split(",")]))
            out[r["timestamp"]] = float(r["close"])
    except Exception:
        return {}
    return out


def on_or_before(m, d):
    ks = [k for k in m if k <= d.isoformat()]
    return max(ks) if ks else None


def week(m):
    """(end date, start date, % change) or None."""
    end = on_or_before(m, today)
    if not end or (today - dt.date.fromisoformat(end)).days > 4:
        return None
    start = on_or_before(m, dt.date.fromisoformat(end) - dt.timedelta(days=7))
    if not start:
        return None
    return end, start, (m[end] / m[start] - 1) * 100


d = load(DATA)
val = {p["id"]: p["value"] for p in d.get("positions", [])}
fx_path = os.path.join(DB, "navs", "fx-USD.json")
fxm = load(fx_path).get("m", {}) if os.path.exists(fx_path) else {}

funds, dates = [], set()
for fid, fund_name, index_name, sym, usd in FUNDS:
    s = week(series(sym))
    if s is None or fid not in val:
        continue
    end, start, chg = s
    if usd:
        a, b = on_or_before(fxm, dt.date.fromisoformat(end)), on_or_before(fxm, dt.date.fromisoformat(start))
        if not a or not b or a < start:
            continue
        chg = ((1 + chg / 100) * fxm[a] / fxm[b] - 1) * 100
    dates.update([end, start])
    funds.append({"index": index_name, "fund": fund_name, "chg": round(chg, 2), "impact": round(val[fid] * chg / 100, 2), "base": val[fid]})

others = []
g = week(series("4GLD.DEX"))
if g:
    others.append({"name": "Gold", "note": "in euros", "chg": round(g[2], 2)})
try:
    b = json.load(open(os.path.join(QUOTES, "btc.json"), encoding="utf-8"))
    if b.get("now") and b.get("weekAgo"):
        others.append({"name": "Bitcoin", "note": "in euros", "chg": round((float(b["now"]) / float(b["weekAgo"]) - 1) * 100, 2)})
except Exception:
    pass
end = on_or_before(fxm, today)
if end and (today - dt.date.fromisoformat(end)).days <= 4:
    start = on_or_before(fxm, dt.date.fromisoformat(end) - dt.timedelta(days=7))
    if start:
        others.append({"name": "US dollar", "note": "against the euro", "chg": round((fxm[end] / fxm[start] - 1) * 100, 2)})

heads, per_source = [], {}
try:
    for h in json.load(open(HEADLINES, encoding="utf-8")):
        src = h.get("source", "source")
        if h.get("title") and h.get("url", "").startswith("https://") and per_source.get(src, 0) < 2 and len(heads) < 5:
            heads.append({"title": h["title"].strip(), "source": src, "url": h["url"]})
            per_source[src] = per_source.get(src, 0) + 1
except Exception:
    pass
if len(per_source) < 2:  # rule: at least two different sources
    heads = []

m = {}
if funds:
    tot = sum(f["impact"] for f in funds)
    base = sum(f.pop("base") for f in funds)
    m["estimate"] = {"eur": round(tot, 2), "pct": round(tot / base * 100, 2) if base else 0}
    m["funds"] = funds
    m["from"], m["to"] = min(dates), max(dates)
if others:
    m["others"] = others
if heads:
    m["headlines"] = heads
if m:
    json.dump(m, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(m, ensure_ascii=False))
