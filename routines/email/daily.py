#!/usr/bin/env python3
"""Daily email: a compact dashboard. Reads the JSON produced by data.py.

Usage: python3 -I daily.py data.json out.html [market.json]  (also writes out.txt and out.subject)
Tables and inline styles only (Gmail): no <style>, no images, no SVG, no JS.
"""
import json, os, sys, html
import datetime as dt

FONT = "-apple-system,Roboto,Arial,sans-serif"
INK = "#111111"      # main figure
TXT = "#333333"      # sentence text
MUTED = "#6b6b6b"    # secondary text (>= 4.5:1 on white)
UP, DOWN = "#15803d", "#b91c1c"
BAR, BAR_TODAY = "#93b4f5", "#2563eb"
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def num(x, dec=2):
    return f"{abs(x):,.{dec}f}"


def eur(x, dec=2, sign=False):
    pre = ("+" if x > 0 else "−" if x < 0 else "") if sign else ("−" if x < 0 else "")
    return f"{pre}€{num(x, dec)}"


def pct(x, dec=2):
    pre = "+" if x > 0 else "−" if x < 0 else ""
    return f"{pre}{num(x, dec)}%"


def short_date(iso):
    y, m, d = map(int, iso.split("-"))
    return f"{MONTHS[m - 1]} {d}"


def no_close_yet(d):
    """True if almost none of the invested value has today's price (the usual case at email time:
    funds publish their price the next day). Then data.py's "market today" is €0 only because
    the data is missing, not because the market didn't move."""
    return d.get("pricedToday", 1) < 0.5


def estimate(d):
    """Index-based estimate from market.py (or None if there are no quotes from today)."""
    m = d.get("market") or {}
    return m["estimate"] if m.get("estimate") and m.get("funds") else None


def today_approx(d):
    """(euros, % of net worth) for the day when today's price is missing: estimate + your money."""
    e = estimate(d)
    if not e:
        return None
    x = e["eur"] + d["change"]["yourMoney"]
    base = d["total"] - x
    return x, (x / base * 100 if base else 0)


def cap(s):
    return s[0].upper() + s[1:]


def sentence(d):
    """One sentence that explains the day: the market versus your own money."""
    c = d["change"]
    mk, ym, total = c["market"], c["yourMoney"], d["total"]
    threshold = max(5.0, total * 0.0005)            # < 0.05% of net worth = "barely"
    mk_pct = mk / (total - c["eur"]) * 100 if total - c["eur"] else 0
    kinds = {o["type"] for o in d.get("todayOps", [])}
    if kinds == {"buy"}:
        source = "your purchases"
    elif kinds == {"sell"}:
        source = "your sales"
    elif ym > 0:
        source = "the money you put in"
    else:
        source = "the money you took out"

    if no_close_yet(d):
        e = estimate(d)
        if not e:
            p_mk = "there are no closing prices yet to tell how much the market moved your portfolio today"
        elif abs(e["eur"]) < threshold:
            p_mk = f"based on their indices, your funds barely moved today (about {eur(e['eur'], 0, True)})"
        else:
            strong = " sharply" if abs(e["pct"]) >= 1 else ""
            verb = "rose" if e["eur"] > 0 else "fell"
            p_mk = f"based on their indices, your funds {verb}{strong} today by about {eur(abs(e['eur']), 0)} ({pct(e['pct'])})"
        if abs(ym) < 0.005:
            return f"{cap(p_mk)}."
        return f"{cap(p_mk)}. Also, {source}: {eur(ym, sign=True)}."

    if abs(mk) < threshold:
        p_mk = f"the market barely moved your portfolio ({eur(mk, sign=True)})"
    else:
        strong = " sharply" if abs(mk_pct) >= 1 else ""
        verb = "lifted" if mk > 0 else "pulled down"
        p_mk = f"the market {verb} your portfolio{strong} by {eur(abs(mk))} ({pct(mk_pct)})"

    if abs(ym) < 0.005:
        return f"{cap(p_mk)}."
    move = "up" if c["eur"] > 0 else "down"
    if abs(ym) >= abs(mk):
        return f"{cap(p_mk)}; net worth is {move} because of {source} ({eur(ym, sign=True)})."
    return f"{cap(p_mk)}. Also, {source}: {eur(ym, sign=True)}."


def bar_strip(series, height=30):
    tot = [s["total"] for s in series]
    lo, hi = min(tot), max(tot)
    rng = (hi - lo) or 1
    base = lo - rng * 0.25
    cells = []
    for i, v in enumerate(tot):
        h = max(3, min(height, round((v - base) / (hi - base) * height)))
        c = BAR_TODAY if i == len(tot) - 1 else BAR
        cells.append(
            f'<td valign="bottom" height="{height}" style="padding:0 1px;vertical-align:bottom;height:{height}px;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td height="{h}" bgcolor="{c}" style="height:{h}px;background-color:{c};font-size:1px;line-height:1px;">&nbsp;</td>'
            f'</tr></table></td>')
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            + "".join(cells) + "</tr></table>")


# ---------- Compact dashboard layout ----------
GREY = "#6b7280"
TILE = "#f3f4f6"     # tile background (dark mode inverts it to dark grey)
LINE = "#e5e7eb"
GREENS = [("#eef0f3", "#374151"), ("#d1fae5", "#065f46"), ("#6ee7b7", "#064e3b"), ("#047857", "#ffffff")]
REDS = [("#eef0f3", "#374151"), ("#fee2e2", "#991b1b"), ("#fca5a5", "#7f1d1d"), ("#b91c1c", "#ffffff")]
TBL = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'


def col(x):
    return UP if x > 0 else DOWN if x < 0 else MUTED


def shade(p, u=(0.1, 0.4, 0.8)):
    x = abs(p)
    lvl = 0 if x < u[0] else 1 if x < u[1] else 2 if x < u[2] else 3
    return (GREENS if p >= 0 else REDS)[lvl]


def short_eur(x):
    return ("+" if x >= 0 else "−") + num(x, 0)


def section_title(t, extra=""):
    # separator: gap + thin rule + gap (td with height/bgcolor; Gmail strips empty divs)
    sep = (f'<tr><td height="26" style="height:26px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
           f'<tr><td height="1" bgcolor="#d1d5db" style="height:1px;background-color:#d1d5db;font-size:1px;line-height:1px;">&nbsp;</td></tr>')
    return (sep + f'<tr><td style="padding:18px 0 8px 0;font-family:{FONT};font-size:12px;line-height:16px;letter-spacing:1px;'
            f'font-weight:700;color:{MUTED};">{t}{extra}</td></tr>')


def tile(label, figure, sub, figure_color=INK, footer="", big=False):
    size, lh = (26, 30) if big else (22, 28)
    return (f'<td width="50%" valign="top" bgcolor="{TILE}" style="width:50%;background-color:{TILE};padding:10px 12px 10px 12px;font-family:{FONT};">'
            f'<div style="font-size:12px;line-height:16px;color:{MUTED};white-space:nowrap;">{label}</div>'
            f'<div style="font-size:{size}px;line-height:{lh}px;font-weight:{600 if not big else 400};letter-spacing:-0.5px;color:{figure_color};white-space:nowrap;padding:2px 0 0 0;">{figure}</div>'
            f'<div style="font-size:12px;line-height:16px;color:{MUTED};white-space:nowrap;">{sub}</div>{footer}</td>')


def tiles(d):
    c, s = d["change"], d["series"]
    m = d.get("market") or {}
    d_month = d["month"]["eur"] if "month" in d else s[-1]["total"] - s[0]["total"]
    tot = sum(x["market"] for x in s)
    up = sum(1 for x in s if x["market"] > 0.005)
    dn = sum(1 for x in s if x["market"] < -0.005)
    if not no_close_yet(d):
        sub1 = f'<b style="color:{col(c["eur"])};">{eur(c["eur"], sign=True)}</b> · {pct(c["pct"])} today'
    elif today_approx(d):
        x, p = today_approx(d)
        sub1 = f'<b style="color:{col(x)};">≈&nbsp;{eur(x, 0, True)}</b> · {pct(p)} today'
    elif abs(c["yourMoney"]) >= 0.005:
        sub1 = f'<b style="color:{col(c["yourMoney"])};">{eur(c["yourMoney"], sign=True)}</b> of your money today'
    else:
        sub1 = "today: no closing prices yet"
    t1 = tile("Net worth", f'<span style="font-size:16px;color:{MUTED};">€</span>{num(d["total"], 0)}', sub1, big=True)
    t2 = tile("Net worth over a month", eur(d_month, 0, True),
              f'{short_date(s[0]["date"])} → today', col(d_month),
              f'<div style="padding:6px 0 0 0;">{bar_strip(s, height=22)}</div>')
    e = m.get("estimate")
    if e and m.get("funds"):
        t3 = tile("Your funds today (est.)", eur(e["eur"], 0, True), f'{pct(e["pct"])} based on their indices', col(e["eur"]))
    else:
        t3 = '<td width="50%" bgcolor="' + TILE + f'" style="width:50%;background-color:{TILE};font-size:1px;line-height:1px;">&nbsp;</td>'
    gap = '<td width="6" style="width:6px;font-size:1px;line-height:1px;">&nbsp;</td>'
    t4 = tile("Market, last month", eur(tot, 0, True), f'{up} days ▲ · {dn} ▼', col(tot))
    return (f'<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">'
            f'<tr>{t1}{gap}{t2}</tr><tr><td colspan="3" height="6" style="height:6px;font-size:1px;line-height:1px;">&nbsp;</td></tr><tr>{t3}{gap}{t4}</tr></table></td></tr>')


def markets(d):
    m = d.get("market")
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
                     f'<td align="right" width="62" style="width:62px;padding:5px 0 5px 6px;{cell}white-space:nowrap;color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                     f'<td align="right" width="52" style="width:52px;padding:5px 6px 5px 6px;{cell}white-space:nowrap;font-weight:600;color:{col(r["impact"])};">{eur(r["impact"], 0, True)}</td></tr>')
    if m.get("others"):
        rows += sep("OTHER MARKETS")
        for r in m["others"]:
            note = f'<span style="color:{MUTED};font-size:12px;"> · {html.escape(r["note"])}</span>' if r.get("note") else ""
            rows += (f'<tr><td style="padding:5px 0 5px 6px;{cell}color:{TXT};">{html.escape(r["name"])}{note}</td>'
                     f'<td align="right" style="padding:5px 0 5px 6px;{cell}white-space:nowrap;color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                     f'<td style="{cell}">&nbsp;</td></tr>')
    out = [section_title("TODAY IN THE MARKETS")]
    if rows:
        out.append(f'<tr><td><table {TBL} style="border-collapse:collapse;">'
                   f'<tr><td style="{head}">&nbsp;</td><td align="right" style="{head}">Today</td><td align="right" style="{head}padding-right:6px;">For you</td></tr>{rows}</table></td></tr>')
    if m.get("estimate") and m.get("funds"):
        out.append(f'<tr><td style="padding:5px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
                   f'"Today" is already in euros. "For you" is an index-based estimate; the real figure arrives with the fund\'s official price.'
                   + (' Small caps estimated with US ETFs (VB and VSS) because the German exchange has not published its close yet.' if m.get("proxyNote") else "")
                   + '</td></tr>')
    if m.get("headlines"):
        li = "".join(f'<tr><td width="12" valign="top" style="width:12px;font-family:{FONT};font-size:13px;line-height:18px;color:{MUTED};">·</td>'
                     f'<td style="padding:0 0 4px 0;font-family:{FONT};font-size:13px;line-height:18px;color:{TXT};">{html.escape(h["title"])}'
                     + (f' <a href="{html.escape(h["url"])}" style="color:{BAR_TODAY};text-decoration:none;white-space:nowrap;">({html.escape(h.get("source", "source"))})</a>' if h.get("url") else "")
                     + '</td></tr>' for h in m["headlines"])
        out.append(section_title("HEADLINES"))
        out.append(f'<tr><td><table {TBL}>{li}</table></td></tr>')
    return "".join(out)


def calendar(d):
    """Compact calendar: one row per week (labelled by its first day), cells with € and %."""
    s = d["series"]
    by_date = {x["date"]: x for x in s}
    f0, fT = dt.date.fromisoformat(s[0]["date"]), dt.date.fromisoformat(d["date"])
    monday = f0 - dt.timedelta(days=f0.weekday())
    tot = sum(x["market"] for x in s)
    up = sum(1 for x in s if x["market"] > 0.005)
    dn = sum(1 for x in s if x["market"] < -0.005)
    hc = f'font-family:{FONT};font-size:12px;line-height:14px;color:{GREY};'
    out = [section_title("THE MARKET, DAY BY DAY", f'<span style="font-weight:400;letter-spacing:0;"> · last month <b style="color:{col(tot)};">{eur(tot, 0, True)}</b>, {up} ▲ {dn} ▼</span>'),
           f'<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="2" border="0" style="table-layout:fixed;"><tr>'
           f'<td width="38" style="width:38px;{hc}">&nbsp;</td>']
    for lab in ["M", "T", "W", "T", "F"]:
        out.append(f'<td align="center" style="{hc}">{lab}</td>')
    out.append(f'<td width="40" align="right" style="width:40px;{hc}padding:0 1px 0 0;">Week</td></tr>')
    week = monday
    while week <= fT:
        ws, has = 0.0, False
        cells = ""
        for k in range(5):
            day = week + dt.timedelta(days=k)
            iso = day.isoformat()
            if iso == d["date"] and no_close_yet(d):
                # today without fund prices: it is not €0, it is "pending" (the estimate if there is one)
                e = estimate(d)
                top = f"≈{short_eur(e['eur'])}" if e else "—"
                bottom = "est." if e else "pending"
                if by_date.get(iso, {}).get("flow"):
                    top += f'<span style="font-size:8px;line-height:16px;vertical-align:top;">&nbsp;●</span>'
                cells += (f'<td bgcolor="#ffffff" align="center" valign="middle" height="34" style="background-color:#ffffff;color:{GREY};height:34px;padding:1px 0;border:2px solid #2563eb;font-family:{FONT};">'
                          f'<div style="font-size:13px;line-height:16px;font-weight:700;color:{GREY};white-space:nowrap;">{top}</div>'
                          f'<div style="font-size:12px;line-height:14px;color:{GREY};white-space:nowrap;">{bottom}</div></td>')
            elif iso in by_date:
                x = by_date[iso]
                bg, fg = shade(x["pct"])
                ws += x["market"]; has = True
                is_today = iso == d["date"]
                border = "border:2px solid #2563eb;" if is_today else ""
                pad = "1px 0" if is_today else "3px 0"
                mark = "●" if x["flow"] else ""
                cells += (f'<td bgcolor="{bg}" align="center" valign="middle" height="34" style="background-color:{bg};color:{fg};height:34px;padding:{pad};{border}font-family:{FONT};">'
                          f'<div style="font-size:13px;line-height:16px;font-weight:700;color:{fg};white-space:nowrap;">{short_eur(x["market"])}'
                          + (f'<span style="font-size:8px;line-height:16px;vertical-align:top;color:{fg};">&nbsp;{mark}</span>' if mark else "")
                          + f'</div><div style="font-size:12px;line-height:14px;color:{fg};white-space:nowrap;">{pct(x["pct"])}</div></td>')
            else:
                cells += '<td height="34" style="height:34px;font-size:1px;line-height:1px;">&nbsp;</td>'
        # week label: first business day with data (or the Monday)
        days = [week + dt.timedelta(days=k) for k in range(5)]
        first = next((f for f in days if f.isoformat() in by_date), week)
        this_week = any(f.isoformat() == d["date"] for f in days)
        label = f'{MONTHS[first.month - 1]} {first.day}'
        out.append(f'<tr><td valign="middle" style="{hc}white-space:nowrap;{"color:#2563eb;font-weight:700;" if this_week else ""}">{label}</td>{cells}'
                   f'<td align="right" valign="middle" style="padding:0 1px 0 0;font-family:{FONT};font-size:13px;font-weight:700;white-space:nowrap;color:{col(ws)};">{short_eur(ws) if has else "&nbsp;"}</td></tr>')
        week += dt.timedelta(days=7)
    out.append("</table></td></tr>")
    leg = "".join(f'<td width="16" height="10" bgcolor="{bg}" style="width:16px;height:10px;background-color:{bg};font-size:1px;line-height:1px;">&nbsp;</td>'
                  f'<td style="font-family:{FONT};font-size:12px;color:{GREY};white-space:nowrap;padding:0 4px 0 2px;">{t}</td>'
                  for (bg, _), t in [(REDS[3], "≤−0.8%"), (REDS[1], ""), (GREENS[0], "0"), (GREENS[1], ""), (GREENS[3], "≥+0.8%")])
    out.append(f'<tr><td style="padding:5px 0 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>{leg}'
               f'<td style="font-family:{FONT};font-size:12px;color:{GREY};white-space:nowrap;padding:0 0 0 4px;">● money moved</td></tr></table></td></tr>')
    out.append(f'<tr><td style="padding:3px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{GREY};">'
               f'Euros gained or lost from prices alone, excluding your own money. Each row is a week. ● day with buys, sells or cash movements. Blue box: today.</td></tr>')
    return "".join(out)


def alerts_html(alerts):
    if not alerts:
        return ""
    rows = "".join(
        f'<tr><td style="padding:1px 0;font-family:{FONT};font-size:13px;line-height:18px;color:#6b4a00;">⚠ {html.escape(a)}</td></tr>'
        for a in alerts)
    return (f'<tr><td style="padding:0 0 10px 0;"><table {TBL}>'
            f'<tr><td width="3" bgcolor="#d97706" style="width:3px;background-color:#d97706;font-size:1px;line-height:1px;">&nbsp;</td>'
            f'<td bgcolor="#fff6dc" style="background-color:#fff6dc;padding:6px 10px;"><table {TBL}>{rows}</table></td></tr></table></td></tr>')


def build(d):
    y, m, dd = map(int, d["date"].split("-"))
    wd = DAYS[dt.date(y, m, dd).weekday()]
    header = f"{wd[:3]} {MONTHS[m - 1]} {dd}".upper()
    text_sentence = sentence(d)
    preheader = html.escape(text_sentence)
    url = html.escape(d["trackerUrl"])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Portfolio</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;">{preheader}</div>
<table {TBL} bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" style="padding:18px 16px 24px 16px;">
<table {TBL} style="max-width:560px;">
<tr><td style="padding:0 0 8px 0;"><table {TBL}><tr>
<td style="font-family:{FONT};font-size:12px;line-height:16px;letter-spacing:1.5px;color:{MUTED};white-space:nowrap;">{header} · PORTFOLIO</td>
<td align="right" style="font-family:{FONT};font-size:13px;line-height:16px;white-space:nowrap;"><a href="{url}" style="color:{BAR_TODAY};text-decoration:none;">Open the tracker&nbsp;→</a></td>
</tr></table></td></tr>
{alerts_html(d.get("alerts") or [])}
{tiles(d)}
<tr><td style="font-family:{FONT};font-size:15px;line-height:21px;color:{TXT};padding:16px 0 0 0;">{html.escape(text_sentence)}</td></tr>
{markets(d)}
{calendar(d)}
</table>
</td></tr></table>
</body></html>
"""


def subject(d):
    y, m, dd = map(int, d["date"].split("-"))
    wd = DAYS[dt.date(y, m, dd).weekday()][:3]
    base = f"Portfolio · {wd} {MONTHS[m - 1]} {dd} · €{num(d['total'], 0)}"
    if not no_close_yet(d):
        return f"{base} ({pct(d['change']['pct'])})"
    h = today_approx(d)
    return f"{base} (≈ {pct(h[1])})" if h else base


def plain_text(d):
    c = d["change"]
    kinds = {"buy": "buy", "sell": "sale", "transfer": "transfer", "deposit": "deposit", "withdrawal": "withdrawal", "interest": "interest"}
    if not no_close_yet(d):
        today_txt = f" ({eur(c['eur'], sign=True)}, {pct(c['pct'])} today)"
    elif today_approx(d):
        today_txt = f" (≈ {eur(today_approx(d)[0], 0, True)}, {pct(today_approx(d)[1])} today, estimated)"
    else:
        today_txt = ""
    L = [d["dayLabel"], f"Net worth: €{num(d['total'], 0)}{today_txt}", sentence(d),
         f"Last month: {eur(sum(x['market'] for x in d['series']), 0, True)} from prices."]
    L += [f"Today: {kinds.get(o['type'], o['type'])} of {eur(o['amount'])} in {o['asset']}." for o in d.get("todayOps") or []]
    L += ["Alert: " + x for x in d.get("alerts") or []]
    m = d.get("market") or {}
    if m.get("estimate") and m.get("funds"):
        L.append(f"Markets today: your funds should move by about {eur(m['estimate']['eur'], 0, True)} ({pct(m['estimate']['pct'])}).")
        L += [f"  {r['index']} ({r['fund']}): {pct(r['chg'])} -> {eur(r['impact'], 0, True)}" for r in m["funds"]]
        if m.get("proxyNote"):
            L.append("  (Small caps estimated with US ETFs: VB and VSS.)")
    L += [f"  {r['name']}: {pct(r['chg'])}" for r in m.get("others") or []]
    L += [f"- {h['title']} ({h.get('source', '')}) {h.get('url', '')}" for h in m.get("headlines") or []]
    L.append("Open the tracker: " + d["trackerUrl"])
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    extra = [a for a in sys.argv[3:] if not a.startswith("--")]
    if extra and os.path.exists(extra[0]):  # optional market.json; if missing or broken, the email goes out without that section
        try:
            with open(extra[0], encoding="utf-8") as f:
                data["market"] = json.load(f)
        except Exception:
            pass
    if "--demo-alerts" in sys.argv:
        data["alerts"] = ["The price task did not run today."]
    base = dst[:-5] if dst.endswith(".html") else dst
    open(dst, "w", encoding="utf-8").write(build(data))
    open(base + ".txt", "w", encoding="utf-8").write(plain_text(data))
    open(base + ".subject", "w", encoding="utf-8").write(subject(data))
    print(subject(data))
