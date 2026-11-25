#!/usr/bin/env python3
"""Weekly email: the same dashboard style as the daily one, plus the week in the markets.

Usage: python3 -I weekly.py data.json out.html [extras.json] [market-week.json]
extras.json (optional): {"ideas": [{"n": 7, "title", "what", "why", "effort"}], "backup": "Backup saved: ...", "notes": ["line", ...]}
market-week.json (optional, from market_week.py): if missing, the email goes out without "The week in the markets" or headlines.
Also writes out.txt and out.subject. Reuses building blocks from daily.py (same folder) so both emails look alike.
Tables and inline styles only (Gmail): no <style>, no images, no SVG, no JS.
"""
import json, os, re, sys, html, datetime as dt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import daily as D  # noqa: E402
from daily import FONT, INK, TXT, MUTED, BAR_TODAY, TILE, LINE, TBL, MONTHS, num, eur, pct, col, section_title, tile, bar_strip  # noqa: E402

NW = "white-space:nowrap;"
BLUE_L = "#93b4f5"
TRACK = "#e8ebf1"


def fdate(iso):
    t = dt.date.fromisoformat(iso)
    return f"{MONTHS[t.month - 1]} {t.day}"


def date_range(d):
    a, b = dt.date.fromisoformat(d["week"]["from"]), dt.date.fromisoformat(d["date"])
    return f"{MONTHS[b.month - 1]} {a.day}–{b.day}" if a.month == b.month else f"{fdate(a.isoformat())} – {fdate(b.isoformat())}"


def week_alerts(d):
    """Drops the price-task alert at the weekend when the last missing run is Friday's (there is no task on Saturday or Sunday)."""
    today = dt.date.fromisoformat(d["date"])
    out = []
    for a in d.get("alerts") or []:
        m = re.search(r"has not run since \w+ (\d+)", a)
        if m and today.weekday() >= 5:
            friday = today - dt.timedelta(days=today.weekday() - 4)
            if int(m.group(1)) == friday.day:
                continue
        out.append(a)
    return out


def week_series(d):
    return [x for x in d["series"] if x["date"] >= d["week"]["from"]]


def sentence(d):
    wk = d["week"]
    mk, ym = wk["market"], wk["yourMoney"]
    base = d["total"] - wk["eur"]
    mk_pct = mk / base * 100 if base else 0
    if abs(mk) < max(5.0, d["total"] * 0.0005):
        s = f"This week the market barely moved your portfolio ({eur(mk, sign=True)})"
    else:
        s = f"This week the market {'lifted' if mk > 0 else 'pulled down'} your portfolio by {eur(abs(mk))} ({pct(mk_pct)})"
    if abs(ym) < 0.5:
        return s + "."
    return s + f"; {'your money added' if ym > 0 else 'your money took away'} {eur(abs(ym))}."


def tiles(d, mk):
    wk, mo, s = d["week"], d["month"], d["series"]
    ws = week_series(d)
    up = sum(1 for x in ws if x["market"] > 0.005)
    dn = sum(1 for x in ws if x["market"] < -0.005)
    t1 = tile("Net worth", f'<span style="font-size:16px;color:{MUTED};">€</span>{num(d["total"], 0)}',
              f'<b style="color:{col(wk["eur"])};">{eur(wk["eur"], sign=True)}</b> · {pct(wk["pct"])}', big=True)
    t2 = tile("Market this week", eur(wk["market"], 0, True), f'{up} days ▲ · {dn} ▼', col(wk["market"]))
    t3 = tile("Net worth over a month", eur(mo["eur"], 0, True), f'{fdate(s[0]["date"])} → today', col(mo["eur"]),
              f'<div style="padding:6px 0 0 0;">{bar_strip(s, height=22)}</div>')
    pos = [p for p in d["positions"] if p["value"] >= 0.01 and p.get("chg1m") is not None]
    fs = sum(p["value"] for p in pos)
    w1m = sum(p["value"] * p["chg1m"] for p in pos) / fs if fs else 0
    diff = w1m - (d["index"]["chg1m"] or 0)
    t4 = tile("Your funds vs index", f'{"+" if diff > 0 else "−" if diff < 0 else ""}{num(diff, 2)} pp',
              f'1 month: {pct(w1m)} vs {pct(d["index"]["chg1m"] or 0)}', col(diff))
    gap = '<td width="6" style="width:6px;font-size:1px;line-height:1px;">&nbsp;</td>'
    return (f'<tr><td style="padding:0;"><table {TBL} style="table-layout:fixed;">'
            f'<tr>{t1}{gap}{t2}</tr><tr><td colspan="3" height="6" style="height:6px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
            f'<tr>{t3}{gap}{t4}</tr></table></td></tr>')


def breakdown(d):
    """Week and month: your money, market and total change in a small table."""
    wk, mo = d["week"], d["month"]
    head = f'font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};padding:0 0 3px 0;'
    c = f'border-top:1px solid {LINE};font-family:{FONT};font-size:14px;line-height:18px;padding:5px 0 5px 6px;'
    rows = ""
    for label, a, b, bold in [("Market", wk["market"], mo["market"], False), ("Your money", wk["yourMoney"], mo["yourMoney"], False),
                              ("Total change", wk["eur"], mo["eur"], True)]:
        w = "font-weight:700;" if bold else ""
        rows += (f'<tr><td style="{c}padding-left:0;color:{TXT};{w}">{label}</td>'
                 f'<td align="right" style="{c}{NW}{w}color:{col(a)};">{eur(a, 0, True)}</td>'
                 f'<td align="right" style="{c}{NW}{w}color:{col(b)};">{eur(b, 0, True)}</td></tr>')
    return (section_title("WHERE THE CHANGE COMES FROM")
            + f'<tr><td><table {TBL} style="border-collapse:collapse;"><tr><td style="{head}">&nbsp;</td>'
              f'<td align="right" width="90" style="width:90px;{head}">Week</td><td align="right" width="90" style="width:90px;{head}">Month</td></tr>{rows}</table></td></tr>'
            + f'<tr><td style="padding:5px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
              f'Market = how much your investments changed in price. Your money = what you put in or took out (selling a fund does not count; it only moves money into cash).</td></tr>')


def markets(m):
    if not m:
        return ""
    head = f'font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};padding:0 0 3px 0;'
    cell = f'border-top:1px solid {LINE};font-family:{FONT};font-size:14px;line-height:18px;'
    sep = (lambda t: f'<tr><td colspan="3" bgcolor="{TILE}" style="background-color:{TILE};padding:3px 6px;font-family:{FONT};'
                     f'font-size:12px;line-height:16px;letter-spacing:0.5px;color:{MUTED};">{t}</td></tr>')
    rows = ""
    if m.get("funds"):
        rows += sep("YOUR FUNDS · the index they track")
        for r in m["funds"]:
            rows += (f'<tr><td style="padding:5px 0 5px 6px;{cell}color:{TXT};">{html.escape(r["index"])}'
                     f'<span style="font-size:12px;color:{MUTED};"> · {html.escape(r["fund"])}</span></td>'
                     f'<td align="right" width="62" style="width:62px;padding:5px 0 5px 6px;{cell}{NW}color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                     f'<td align="right" width="56" style="width:56px;padding:5px 6px 5px 6px;{cell}{NW}font-weight:600;color:{col(r["impact"])};">{eur(r["impact"], 0, True)}</td></tr>')
        e = m["estimate"]
        rows += (f'<tr><td style="padding:5px 0 5px 6px;{cell}color:{INK};font-weight:700;">In total</td>'
                 f'<td align="right" style="padding:5px 0 5px 6px;{cell}{NW}font-weight:700;color:{col(e["pct"])};">{pct(e["pct"])}</td>'
                 f'<td align="right" style="padding:5px 6px 5px 6px;{cell}{NW}font-weight:700;color:{col(e["eur"])};">{eur(e["eur"], 0, True)}</td></tr>')
    if m.get("others"):
        rows += sep("OTHER MARKETS")
        for r in m["others"]:
            note = f'<span style="color:{MUTED};font-size:12px;"> · {html.escape(r["note"])}</span>' if r.get("note") else ""
            rows += (f'<tr><td style="padding:5px 0 5px 6px;{cell}color:{TXT};">{html.escape(r["name"])}{note}</td>'
                     f'<td align="right" style="padding:5px 0 5px 6px;{cell}{NW}color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                     f'<td style="{cell}">&nbsp;</td></tr>')
    out = []
    if rows:
        sub = f'<span style="font-weight:400;letter-spacing:0;"> · {fdate(m["from"])} → {fdate(m["to"])}</span>' if m.get("from") else ""
        out.append(section_title("THE WEEK IN THE MARKETS", sub))
        out.append(f'<tr><td><table {TBL} style="border-collapse:collapse;">'
                   f'<tr><td style="{head}">&nbsp;</td><td align="right" style="{head}">Week</td><td align="right" style="{head}padding-right:6px;">For you</td></tr>{rows}</table></td></tr>')
        if m.get("funds"):
            out.append(f'<tr><td style="padding:5px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
                       f'"Week" is already in euros. "For you" = each fund\'s value today × what its index did: it is an estimate; '
                       f'the exact figure for your week is in the tiles above, using the official prices that have arrived.</td></tr>')
    if m.get("headlines"):
        li = "".join(f'<tr><td width="12" valign="top" style="width:12px;font-family:{FONT};font-size:13px;line-height:18px;color:{MUTED};">·</td>'
                     f'<td style="padding:0 0 5px 0;font-family:{FONT};font-size:13px;line-height:18px;color:{TXT};">{html.escape(h["title"])}'
                     f' <a href="{html.escape(h["url"])}" style="color:{BAR_TODAY};text-decoration:none;{NW}">({html.escape(h.get("source", "source"))})</a></td></tr>'
                     for h in m["headlines"])
        out.append(section_title("HEADLINES OF THE WEEK"))
        out.append(f'<tr><td><table {TBL}>{li}</table></td></tr>')
    return "".join(out)


def portfolio(d):
    """Allocation (thin bar) plus each fund's 1-month return against the index, in one list."""
    total = d["total"]
    pos = sorted([p for p in d["positions"] if p["value"] >= 0.01], key=lambda p: -p["value"])
    idx = d["index"]
    rows = ""
    for name, val, color, extra in [(p["short"], p["value"], BAR_TODAY, p) for p in pos] + [("Cash", d["cash"], BLUE_L, None)]:
        w = val / total * 100
        if extra and extra.get("chg1m") is not None and idx.get("chg1m") is not None:
            dif = extra["chg1m"] - idx["chg1m"]
            sub = (f'1 month <span style="color:{col(extra["chg1m"])};">{pct(extra["chg1m"])}</span> · '
                   f'vs index <b style="color:{col(dif)};">{"+" if dif > 0 else "−" if dif < 0 else ""}{num(dif, 2)} pp</b>')
        elif extra:
            sub = "no 1-month price history yet"
        else:
            sub = "cash accounts"
        bar = (f'<table {TBL} style="table-layout:fixed;"><tr>'
               f'<td width="{w:.1f}%" height="5" bgcolor="{color}" style="width:{w:.1f}%;height:5px;background-color:{color};font-size:1px;line-height:1px;">&nbsp;</td>'
               f'<td width="{100 - w:.1f}%" height="5" bgcolor="{TRACK}" style="width:{100 - w:.1f}%;height:5px;background-color:{TRACK};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>')
        rows += (f'<tr><td style="padding:7px 0 0 0;"><table {TBL}><tr>'
                 f'<td style="font-family:{FONT};font-size:14px;line-height:19px;color:{TXT};{NW}">{html.escape(name)}</td>'
                 f'<td align="right" style="font-family:{FONT};font-size:14px;line-height:19px;{NW}color:{INK};">{eur(val, 0)}'
                 f'<span style="color:{MUTED};display:inline-block;width:50px;text-align:right;">{num(w, 1)}%</span></td></tr>'
                 f'<tr><td colspan="2" style="padding:3px 0 2px 0;">{bar}</td></tr>'
                 f'<tr><td colspan="2" style="font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">{sub}</td></tr></table></td></tr>')
    footer = (f'<tr><td style="padding:6px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
              f'Benchmark: {html.escape(idx["name"])}, {pct(idx["chg1m"] or 0)} over a month. "vs index" = the fund\'s 1-month return minus the index\'s, in points.</td></tr>')
    return section_title("YOUR PORTFOLIO", f'<span style="font-weight:400;letter-spacing:0;"> · invested {eur(d["invested"], 0)} · cash {eur(d["cash"], 0)}</span>') + rows + footer


def transactions(d):
    ops = d["week"].get("ops") or []
    if not ops:
        return ""
    verbs = {"buy": "Buy", "sell": "Sale", "transfer": "Transfer", "deposit": "Deposit", "withdrawal": "Withdrawal", "interest": "Interest"}
    li = "".join(f'<tr><td width="52" valign="top" style="width:52px;font-family:{FONT};font-size:13px;line-height:20px;color:{MUTED};{NW}">{fdate(o["date"])}</td>'
                 f'<td style="font-family:{FONT};font-size:14px;line-height:20px;color:{TXT};">{verbs.get(o["type"], o["type"].capitalize())} '
                 f'<b style="{NW}">{eur(o["amount"])}</b> · <span style="{NW}">{html.escape(o["asset"])}</span></td></tr>'
                 for o in sorted(ops, key=lambda o: o["date"]))
    tot = sum(o["amount"] for o in ops if o["type"] == "buy")
    sub = f'<span style="font-weight:400;letter-spacing:0;"> · {len(ops)} · buys {eur(tot)}</span>' if tot else ""
    return section_title("TRANSACTIONS THIS WEEK", sub) + f'<tr><td><table {TBL}>{li}</table></td></tr>'


def ideas(ex):
    if not ex.get("ideas"):
        return ""
    li = "".join(f'<tr><td width="30" valign="top" style="width:30px;padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
                 f'<td align="center" width="24" height="24" bgcolor="{TILE}" style="width:24px;height:24px;background-color:{TILE};font-family:{FONT};font-size:13px;line-height:24px;font-weight:700;color:{BAR_TODAY};">{i["n"]}</td></tr></table></td>'
                 f'<td style="padding:6px 0 6px 6px;font-family:{FONT};font-size:14px;line-height:20px;color:{TXT};">'
                 f'<b style="color:{INK};">{html.escape(i["title"])}</b> <span style="color:{MUTED};font-size:12px;">· effort {html.escape(i.get("effort", ""))}</span><br>'
                 f'{html.escape(i.get("what", ""))}<br><span style="color:{MUTED};font-size:13px;">{html.escape(i.get("why", ""))}</span></td></tr>' for i in ex["ideas"])
    return (section_title("IDEAS FOR THE TRACKER") + f'<tr><td><table {TBL}>{li}</table></td></tr>'
            + f'<tr><td style="padding:4px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
              f'To approve or discard one, reply in your Claude project: "do {ex["ideas"][0]["n"]}" or "discard {ex["ideas"][0]["n"]}". Nothing changes without your yes.</td></tr>')


def footer_notes(ex):
    lines = ([ex["backup"]] if ex.get("backup") else []) + (ex.get("notes") or [])
    if not lines:
        return ""
    li = "".join(f'<tr><td style="padding:2px 0;font-family:{FONT};font-size:12px;line-height:17px;color:{MUTED};">{html.escape(l)}</td></tr>' for l in lines)
    sep = (f'<tr><td height="22" style="height:22px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
           f'<tr><td height="1" bgcolor="#d1d5db" style="height:1px;background-color:#d1d5db;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
           f'<tr><td height="10" style="height:10px;font-size:1px;line-height:1px;">&nbsp;</td></tr>')
    return sep + li


def build(d, ex, m):
    header = f"WEEK {date_range(d)}".upper()
    url = html.escape(d["trackerUrl"])
    txt = sentence(d)
    al = week_alerts(d)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Portfolio · week</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;">{html.escape(txt)}</div>
<table {TBL} bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" style="padding:18px 16px 24px 16px;">
<table {TBL} style="max-width:560px;">
<tr><td style="padding:0 0 8px 0;"><table {TBL}><tr>
<td style="font-family:{FONT};font-size:12px;line-height:16px;letter-spacing:1.5px;color:{MUTED};{NW}">{header} · PORTFOLIO</td>
<td align="right" style="font-family:{FONT};font-size:13px;line-height:16px;{NW}"><a href="{url}" style="color:{BAR_TODAY};text-decoration:none;">Open the tracker&nbsp;→</a></td>
</tr></table></td></tr>
{D.alerts_html(al)}
{tiles(d, m)}
<tr><td style="font-family:{FONT};font-size:15px;line-height:21px;color:{TXT};padding:16px 0 0 0;">{html.escape(txt)}</td></tr>
{breakdown(d)}
{markets(m)}
{D.calendar(d)}
{portfolio(d)}
{transactions(d)}
{ideas(ex)}
{footer_notes(ex)}
</table>
</td></tr></table>
</body></html>
"""


def subject(d):
    return f"Portfolio · week {date_range(d)} · €{num(d['total'], 0)} ({pct(d['week']['pct'])})"


def plain_text(d, ex, m):
    wk, mo = d["week"], d["month"]
    L = [subject(d), f"Net worth: {eur(d['total'], 0)} (invested {eur(d['invested'], 0)}, cash {eur(d['cash'], 0)})", sentence(d),
         f"Week: {eur(wk['eur'], sign=True)} ({pct(wk['pct'])}); market {eur(wk['market'], sign=True)}, your money {eur(wk['yourMoney'], sign=True)}",
         f"Last month: {eur(mo['eur'], 0, True)}; market {eur(mo['market'], 0, True)}, your money {eur(mo['yourMoney'], 0, True)}"]
    L += ["Alert: " + a for a in week_alerts(d)]
    if m.get("funds"):
        L.append(f"The week in the markets: based on their indices, your funds moved by about {eur(m['estimate']['eur'], 0, True)} ({pct(m['estimate']['pct'])}).")
        L += [f"  {r['index']} ({r['fund']}): {pct(r['chg'])} -> {eur(r['impact'], 0, True)}" for r in m["funds"]]
    L += [f"  {r['name']}: {pct(r['chg'])}" for r in m.get("others") or []]
    L += [f"- {h['title']} ({h.get('source', '')}) {h.get('url', '')}" for h in m.get("headlines") or []]
    L += [f"{p['short']}: {eur(p['value'], 0)} · 1 month {pct(p['chg1m'])}" for p in d["positions"] if p["value"] >= 0.01 and p.get("chg1m") is not None]
    if d["index"].get("chg1m") is not None:
        L.append(f"{d['index']['name']}: 1 month {pct(d['index']['chg1m'])}")
    L += [f"{o['date']} {o['type']} {eur(o['amount'])} {o['asset']}" for o in wk.get("ops") or []]
    L += [f"Idea {i['n']}: {i['title']} ({i.get('effort', '')}). {i.get('what', '')} {i.get('why', '')}" for i in ex.get("ideas") or []]
    if ex.get("ideas"):
        L.append('To approve or discard ideas, reply in your Claude project, e.g. "do 2" or "discard 1".')
    L += ([ex["backup"]] if ex.get("backup") else []) + (ex.get("notes") or [])
    L.append("Open the tracker: " + d["trackerUrl"])
    return "\n".join(L) + "\n"


def read_json(p):
    if p and os.path.exists(p):
        try:
            return json.load(open(p, encoding="utf-8"))
        except Exception:
            pass
    return {}


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    data = json.load(open(src, encoding="utf-8"))
    ex = read_json(sys.argv[3] if len(sys.argv) > 3 else None)
    m = read_json(sys.argv[4] if len(sys.argv) > 4 else None)
    base = dst[:-5] if dst.endswith(".html") else dst
    open(dst, "w", encoding="utf-8").write(build(data, ex, m))
    open(base + ".txt", "w", encoding="utf-8").write(plain_text(data, ex, m))
    open(base + ".subject", "w", encoding="utf-8").write(subject(data))
    print(subject(data))
