#!/usr/bin/env python3
"""Builds market.json (the "Today in the markets" section of the daily email).

Usage: python3 -I market.py <data.json> <db_folder> <TODAY> <quotes_folder> <headlines.json> <out market.json> [out estimate.json]

[out estimate.json] (optional): TODAY's change of each index in euros, for the app's intraday estimate:
  {"date": TODAY, "idx": {"us": {"name", "chg", "via"}, "em": {...}, "small": {...}, "gold": {...}}}  (chg in %, TODAY's data only)
  estimate.py then merges it into the insights/estimate document in the database.

<quotes_folder> holds what the routine downloads from Alpha Vantage:
  SPY.csv, EEM.csv, IUSN.DEX.csv, 4GLD.DEX.csv  -> GLOBAL_QUOTE CSV text as returned (header + 1 row)
  btc.json -> {"now": <BTC/EUR from CURRENCY_EXCHANGE_RATE>, "prevClose": <previous day's close from DIGITAL_CURRENCY_DAILY>}
<headlines.json> = [{"title", "source", "url"}, ...] (at most 4; may be missing or empty).

  Fallbacks (US-listed, and Alpha Vantage publishes their close before Xetra's):
  VB.csv + VSS.csv -> global small caps if IUSN.DEX is not from TODAY (60% VB US + 40% VSS rest of world, in dollars)
  GLD.csv -> gold (in dollars) if 4GLD.DEX is not from TODAY

Rules: a quote is used only if its latestDay is TODAY; if it is missing, that row is left out.
Dollar ETFs (SPY, EEM) are converted to euros with the USD rate stored in the database (navs/fx-USD).
If nothing is left to show, no file is written (the email goes out without the section).
"""
import json, os, sys

DATA, DB, TODAY, QUOTES, HEADLINES, OUT = sys.argv[1:7]
OUT_EST = sys.argv[7] if len(sys.argv) > 7 else None


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
FUNDS = [(f["id"], f["index"], f["symbol"], f["usd"]) for f in CFG.get("funds", [])]  # (fund, index, symbol, in dollars)
SHORT_NAMES = {f["id"]: f["short"] for f in CFG.get("funds", [])}


def load(p):
    with open(p, encoding="utf-8") as f:
        x = json.load(f)
    return x.get("data", x) if isinstance(x, dict) and "data" in x and len(x) <= 4 else x


def quote(sym):
    p = os.path.join(QUOTES, sym + ".csv")
    if not os.path.exists(p):
        return None
    try:
        lines = [l for l in open(p, encoding="utf-8").read().replace("\\r\\n", "\n").splitlines() if l.strip()]
        h = [x.strip() for x in lines[0].split(",")]
        r = dict(zip(h, [x.strip() for x in lines[1].split(",")]))
        if r.get("latestDay") != TODAY:
            return None
        return float(r["changePercent"].rstrip("%"))
    except Exception:
        return None


d = load(DATA)
val = {p["id"]: p["value"] for p in d.get("positions", [])}
fx_path = os.path.join(DB, "navs", "fx-USD.json")
fxm = load(fx_path).get("m", {}) if os.path.exists(fx_path) else {}
fk = sorted(k for k in fxm if k <= TODAY)
fx = fxm[fk[-1]] / fxm[fk[-2]] if len(fk) >= 2 and fk[-1] == TODAY else None  # euros per dollar today / yesterday


def proxy_small():
    """Global small caps from US ETFs (in dollars) when IUSN.DEX doesn't have today's close yet."""
    a, b = quote("VB"), quote("VSS")
    return None if a is None or b is None else 0.6 * a + 0.4 * b


funds, approx = [], []
for fid, index_name, sym, usd in FUNDS:
    q = quote(sym)
    if q is None and sym == "IUSN.DEX":
        q, usd = proxy_small(), True
        if q is not None:
            approx.append("small caps from VB and VSS")
    if q is None or fid not in val or (usd and fx is None):
        continue
    chg = ((1 + q / 100) * fx - 1) * 100 if usd else q
    funds.append({"index": index_name, "fund": SHORT_NAMES[fid], "chg": round(chg, 2), "impact": round(val[fid] * chg / 100, 2), "_v": val[fid]})

others = []
g = quote("4GLD.DEX")
if g is None and quote("GLD") is not None and fx is not None:
    g = ((1 + quote("GLD") / 100) * fx - 1) * 100  # GLD (dollars) converted to euros
if g is not None:
    others.append({"name": "Gold", "note": "in euros", "chg": round(g, 2)})
try:
    b = json.load(open(os.path.join(QUOTES, "btc.json"), encoding="utf-8"))
    if b.get("now") and b.get("prevClose"):
        others.append({"name": "Bitcoin", "note": "in euros", "chg": round((float(b["now"]) / float(b["prevClose"]) - 1) * 100, 2)})
except Exception:
    pass
if fx is not None:
    others.append({"name": "US dollar", "note": "against the euro", "chg": round((fx - 1) * 100, 2)})

heads = []
try:
    for h in json.load(open(HEADLINES, encoding="utf-8"))[:4]:
        if h.get("title") and h.get("url", "").startswith("https://"):
            heads.append({"title": h["title"].strip(), "source": h.get("source", "source"), "url": h["url"]})
except Exception:
    pass

# Intraday estimate for the app: every index available for TODAY, whether or not you hold those funds
if OUT_EST:
    est = {}
    for key, index_name, sym, usd in (("us", "S&P 500", "SPY", True), ("em", "Emerging markets", "EEM", True), ("small", "Global small caps", "IUSN.DEX", False)):
        q, via = quote(sym), sym
        if q is None and sym == "IUSN.DEX":
            q, usd, via = proxy_small(), True, "VB+VSS"
        if q is None or (usd and fx is None):
            continue
        est[key] = {"name": index_name, "chg": round(((1 + q / 100) * fx - 1) * 100 if usd else q, 3), "via": via}
    if g is not None:
        est["gold"] = {"name": "Gold", "chg": round(g, 3), "via": "4GLD.DEX" if quote("4GLD.DEX") is not None else "GLD"}
    if est:
        json.dump({"date": TODAY, "idx": est}, open(OUT_EST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

m = {}
if funds:
    tot = sum(f["impact"] for f in funds)
    base = sum(f.pop("_v") for f in funds)  # value of the funds included
    m["estimate"] = {"eur": round(tot, 2), "pct": round(tot / base * 100, 2) if base else 0}
    m["funds"] = funds
    if approx:
        m["proxyNote"] = "; ".join(approx)
if others:
    m["others"] = others
if heads:
    m["headlines"] = heads
if m:
    json.dump(m, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(m, ensure_ascii=False))
