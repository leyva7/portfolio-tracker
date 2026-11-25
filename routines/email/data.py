#!/usr/bin/env python3
"""Computes the data for the portfolio emails from the tracker's database.

Usage: python3 -I data.py <db_folder> <TODAY YYYY-MM-DD> <out.json>
<db_folder> is the ArtifactData out_dir with subfolders assets/, navs/, txs/, cash/ and,
if present, jobs/funds.json and settings/main.json (each document in <collection>/<id>.json).

Everything comes from the database; nothing is made up. Each day's "market" effect is exact:
  market_d = invested_d − invested_(d−1) − (buys_d − sells_d)   (at the trade price)
  your_money_d = total change_d − market_d  (deposits, withdrawals, interest, fees)
"""
import json, glob, os, re, sys, datetime as dt

DB, TODAY, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

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
URL = CFG.get("trackerUrl", "")
SHORT_NAMES = {f["id"]: f["short"] for f in CFG.get("funds", [])}
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]


def load(p):
    with open(p, encoding="utf-8") as f:
        x = json.load(f)
    return x.get("data", x) if isinstance(x, dict) and "data" in x and len(x) <= 4 else x


def col(name):
    return {os.path.basename(f)[:-5]: load(f) for f in glob.glob(os.path.join(DB, name, "*.json"))}


def opt(name, doc):
    p = os.path.join(DB, name, doc + ".json")
    return load(p) if os.path.exists(p) else {}


assets, navs, txs, cash = col("assets"), {k: v.get("m", {}) for k, v in col("navs").items()}, list(col("txs").values()), list(col("cash").values())
settings, job = opt("settings", "main"), opt("jobs", "funds")
fx = navs.get("fx-USD", {})
D = lambda s: dt.date.fromisoformat(s)
today = D(TODAY)


def short_name(a):
    if a in SHORT_NAMES:
        return SHORT_NAMES[a]
    n = assets.get(a, {}).get("name", a)
    n = re.sub(r"\b(Index|Fund|UCITS|ETF|ETC|\(IE\)|\(Acc\)|Acc|EUR|S|P-Acc-EUR|I)\b", "", n)
    return re.sub(r"\s+", " ", n).strip()[:24]


def price(a, d):
    m = navs.get(a, {})
    ks = [k for k in m if k <= d]
    if not ks:
        return None
    p = m[max(ks)]
    if assets.get(a, {}).get("currency") == "USD":
        f = [k for k in fx if k <= d]
        p = p * fx[max(f)] if f else None
    return p


def qty(d):
    q = {}
    for t in txs:
        if t["date"] > d or not t.get("assetId"):
            continue
        a, n = t["assetId"], t.get("qty", 0)
        if t["type"] == "buy":
            q[a] = q.get(a, 0) + n
        elif t["type"] == "sell":
            q[a] = q.get(a, 0) - n
        elif t["type"] == "transfer":
            q[a] = q.get(a, 0) - n
            if t.get("toAssetId"):
                q[t["toAssetId"]] = q.get(t["toAssetId"], 0) + t.get("toQty", n)
    return q


def values(d):
    v = {}
    for a, n in qty(d).items():
        p = price(a, d) if n > 1e-9 else None
        if p is not None and n * p >= 0.01:
            v[a] = n * p
    return v


def cash_at(d):
    return sum(m["a"] for c in cash for m in (c.get("mv") or {}).values() if m["d"] <= d)


def flow(d):
    """Money going into investments that day (buys − sells, at the trade price)."""
    f = 0.0
    for t in txs:
        if t["date"] != d or t["type"] not in ("buy", "sell"):
            continue
        amt = t["qty"] * t["price"] * (t.get("fx") or 1)
        f += amt if t["type"] == "buy" else -amt
    return f


def busdays(a, b):
    out, x = [], a
    while x <= b:
        if x.weekday() < 5:
            out.append(x.isoformat())
        x += dt.timedelta(days=1)
    return out


# ---- daily series (business days of the last 30 days, plus the one before as the base) ----
days = busdays(today - dt.timedelta(days=30), today)
prev = (D(days[0]) - dt.timedelta(days=1))
while prev.weekday() >= 5:
    prev -= dt.timedelta(days=1)
days = [prev.isoformat()] + days
series = []
for d in days:
    v = values(d)
    inv, cs = round(sum(v.values()), 2), round(cash_at(d), 2)
    series.append({"date": d, "invested": inv, "cash": cs, "total": round(inv + cs, 2)})
for a, b in zip(series, series[1:]):
    fl = sum(flow(x) for x in busdays(D(a["date"]) + dt.timedelta(days=1), D(b["date"])))
    b["market"] = round(b["invested"] - a["invested"] - fl, 2)
    b["yourMoney"] = round(b["total"] - a["total"] - b["market"], 2)
    b["flow"] = abs(b["yourMoney"]) >= 0.5 or abs(fl) >= 0.5 or abs(b["cash"] - a["cash"]) >= 0.5
    b["pct"] = round(b["market"] / a["total"] * 100, 3) if a["total"] else 0
series = series[1:]  # the first point is now the first day of the period, with its market effect computed
base_total = series[0]["total"] - series[0]["market"] - series[0]["yourMoney"]
t, y = series[-1], series[-2]

# ---- positions ----
month_ref = (today - dt.timedelta(days=30)).isoformat()
positions = []
for a, val in sorted(values(TODAY).items(), key=lambda z: -z[1]):
    m = navs.get(a, {})
    ks = sorted(k for k in m if k <= TODAY)
    if len(ks) < 2:
        continue
    old = [k for k in ks if k <= month_ref]
    positions.append({"id": a, "name": assets.get(a, {}).get("name", a), "short": short_name(a),
                      "class": assets.get(a, {}).get("cls"), "value": round(val, 2),
                      "chgLast": round((m[ks[-1]] / m[ks[-2]] - 1) * 100, 2),
                      "chg1m": round((m[ks[-1]] / m[old[-1]] - 1) * 100, 2) if old else None,
                      "lastPriceDate": ks[-1]})
b = navs.get("bench", {})
bk = sorted(k for k in b if k <= TODAY)
bo = [k for k in bk if k <= month_ref]
index = {"name": settings.get("benchName", "Index").replace(" (EUR)", ""),
         "chgLast": round((b[bk[-1]] / b[bk[-2]] - 1) * 100, 2) if len(bk) > 1 else None,
         "chg1m": round((b[bk[-1]] / b[bo[-1]] - 1) * 100, 2) if bo else None}

# ---- trades and cash movements in a period ----
def ops(start, end):
    out = []
    for x in sorted(txs, key=lambda x: x["date"]):
        if start <= x["date"] <= end and x["type"] in ("buy", "sell", "transfer"):
            out.append({"date": x["date"], "type": x["type"], "asset": short_name(x["assetId"]) if x.get("assetId") else "",
                        "amount": round(x["qty"] * x["price"] * (x.get("fx") or 1), 2)})
    linked = {x["cashMv"]["mv"] for x in txs if isinstance(x.get("cashMv"), dict)}
    for c in cash:
        for k, m in (c.get("mv") or {}).items():
            if start <= m["d"] <= end and m["t"] in ("in", "out", "interest") and k not in linked \
                    and not re.match(r"(?i)^(venta|sale)\b", m.get("n") or ""):
                tp = {"in": "deposit", "out": "withdrawal", "interest": "interest"}[m["t"]]
                out.append({"date": m["d"], "type": tp, "asset": c.get("name", "Cash"),
                            "amount": round(abs(m["a"]), 2), "note": m.get("n") or ""})
    return out


# ---- alerts (real problems only; never price dates) ----
alerts = []
if job:
    if job.get("state") == "error":
        alerts.append("The price task ended with an error: " + str(job.get("error") or "no details") + ".")
    for r in job.get("results") or []:
        if r.get("ok") is False:
            alerts.append(f"Could not update the price of {short_name(r.get('assetId', '?'))}.")
    fin = (job.get("finishedAt") or "")[:10]
    if fin and fin < (today - dt.timedelta(days=1)).isoformat():
        alerts.append(f"The price task has not run since {MONTHS[int(fin[5:7]) - 1]} {int(fin[8:])}.")
for p in positions:
    if len(busdays(D(p["lastPriceDate"]) + dt.timedelta(days=1), today)) > 5:
        alerts.append(f"{p['short']} has had no new price for more than 5 business days.")
# sales vs cash mismatch (same rule as the app)
linked = {x["cashMv"]["mv"] for x in txs if isinstance(x.get("cashMv"), dict)}
allmv = [(k, m) for c in cash for k, m in (c.get("mv") or {}).items()]
sale_mv = [(k, m) for k, m in allmv if m["a"] > 0 and (k in linked or re.match(r"(?i)^(venta|sale)\b", m.get("n") or ""))]
if sale_mv:
    first = min(m["d"] for _, m in sale_mv)
    since = max((D(first) - dt.timedelta(days=5)).isoformat(), (today - dt.timedelta(days=90)).isoformat())
    got = sum(x["qty"] * x["price"] * (x.get("fx") or 1) - (x.get("fees") or 0) for x in txs
              if x["type"] == "sell" and x["date"] >= since and x.get("note") != "Cierre de resto"
              and not (x["qty"] * x["price"] < 5 and not x.get("cashMv")))
    inc = sum(m["a"] for _, m in sale_mv if m["d"] >= since) + sum(m["a"] for _, m in allmv if m["t"] == "adjust" and m["d"] >= since)
    if got and abs(inc - got) >= 1:
        alerts.append(f"Sales and cash are off by €{abs(inc - got):,.2f} since {since}.")

goal = settings.get("goal") or None
month = series
out = {
    "date": TODAY, "dayLabel": f"{DAYS[today.weekday()]}, {MONTHS[today.month - 1]} {today.day}",
    "total": t["total"], "invested": t["invested"], "cash": t["cash"],
    "change": {"eur": round(t["total"] - y["total"], 2), "pct": round((t["total"] / y["total"] - 1) * 100, 2),
               "yourMoney": t["yourMoney"], "market": t["market"]},
    "month": {"from": series[0]["date"], "base": round(base_total, 2), "eur": round(t["total"] - base_total, 2),
              "market": round(sum(s["market"] for s in month), 2), "yourMoney": round(sum(s["yourMoney"] for s in month), 2)},
    "series": series, "positions": positions, "index": index,
    "todayOps": ops(TODAY, TODAY), "savingsGoal": goal, "alerts": alerts, "trackerUrl": URL,
    # share of the invested value that already has TODAY's price. Funds publish their price the next day,
    # so at email time this is usually ~0: today's market effect is not known yet (it is not €0).
    "pricedToday": round(sum(p["value"] for p in positions if p["lastPriceDate"] == TODAY)
                         / (sum(p["value"] for p in positions) or 1), 3),
}
# week (for the weekly summary): last 7 calendar days
w0 = (today - dt.timedelta(days=6)).isoformat()
ws = [s for s in series if s["date"] >= w0]
if ws:
    prevw = [s for s in series if s["date"] < w0]
    wb = prevw[-1]["total"] if prevw else ws[0]["total"] - ws[0]["market"] - ws[0]["yourMoney"]
    out["week"] = {"from": w0, "eur": round(t["total"] - wb, 2), "pct": round((t["total"] / wb - 1) * 100, 2),
                   "market": round(sum(s["market"] for s in ws), 2), "yourMoney": round(sum(s["yourMoney"] for s in ws), 2),
                   "ops": ops(w0, TODAY)}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(json.dumps({k: out[k] for k in ("dayLabel", "total", "change", "month", "alerts")}, ensure_ascii=False))
