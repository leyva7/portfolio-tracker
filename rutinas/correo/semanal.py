#!/usr/bin/env python3
"""Correo semanal, ronda 2: cuadro de mando como el diario + la semana en los mercados.

Uso: python3 -I semanal.py datos.json salida.html [extras.json] [mercado-semana.json]
extras.json (opcional): {"ideas": [{"n": 7, "title", "what", "why", "effort"}], "backup": "Copia guardada: ...", "notes": ["línea", ...]}
mercado-semana.json (opcional, de mercado-semana.py): si falta, el correo sale sin «La semana en los mercados» ni titulares.
Escribe también salida.txt y salida.asunto. Reutiliza piezas de diario.py (misma carpeta) para que los dos correos se parezcan.
Solo tablas y estilos en línea (Gmail): sin <style>, sin imágenes, sin SVG, sin JS.
"""
import json, os, re, sys, html, datetime as dt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import diario as D  # noqa: E402
from diario import FONT, INK, TXT, MUTED, BAR_TODAY, TILE, LINEA, TBL, MESES, num, eur, pct, col, titulo, tile, tira_barras  # noqa: E402

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
NW = "white-space:nowrap;"
BLUE_L = "#93b4f5"
TRACK = "#e8ebf1"


def fdate(iso):
    t = dt.date.fromisoformat(iso)
    return f"{t.day} {MESES[t.month - 1]}"


def rango(d):
    a, b = dt.date.fromisoformat(d["week"]["from"]), dt.date.fromisoformat(d["date"])
    return f"{a.day}–{b.day} {MESES[b.month - 1]}" if a.month == b.month else f"{fdate(a.isoformat())} – {fdate(b.isoformat())}"


def avisos(d):
    """Quita el aviso de la tarea de precios en fin de semana si lo último que falta es el viernes (no hay tarea sábado ni domingo)."""
    hoy = dt.date.fromisoformat(d["date"])
    out = []
    for a in d.get("alerts") or []:
        m = re.search(r"no se ejecuta desde el (\d+) de", a)
        if m and hoy.weekday() >= 5:
            vie = hoy - dt.timedelta(days=hoy.weekday() - 4)
            if int(m.group(1)) == vie.day:
                continue
        out.append(a)
    return out


def semana_series(d):
    return [x for x in d["series"] if x["date"] >= d["week"]["from"]]


def frase(d):
    wk = d["week"]
    mk, ym = wk["market"], wk["yourMoney"]
    base = d["total"] - wk["eur"]
    mk_pct = mk / base * 100 if base else 0
    if abs(mk) < max(5.0, d["total"] * 0.0005):
        s = f"Esta semana el mercado apenas movió tu cartera ({eur(mk, sign=True)})"
    else:
        s = f"Esta semana el mercado {'subió' if mk > 0 else 'bajó'} tu cartera {eur(abs(mk))} ({pct(mk_pct)})"
    if abs(ym) < 0.5:
        return s + "."
    return s + f"; {'tu dinero sumó' if ym > 0 else 'tu dinero restó'} {eur(abs(ym))}."


def cifras(d, mk):
    wk, mo, s = d["week"], d["month"], d["series"]
    ws = semana_series(d)
    up = sum(1 for x in ws if x["market"] > 0.005)
    dn = sum(1 for x in ws if x["market"] < -0.005)
    t1 = tile("Patrimonio", f'{num(d["total"], 0)}<span style="font-size:16px;color:{MUTED};">&nbsp;€</span>',
              f'<b style="color:{col(wk["eur"])};">{eur(wk["eur"], sign=True)}</b> · {pct(wk["pct"])}', grande=True)
    t2 = tile("Mercado esta semana", eur(wk["market"], 0, True), f'{up} días ▲ · {dn} ▼', col(wk["market"]))
    t3 = tile("Patrimonio en un mes", eur(mo["eur"], 0, True), f'{fdate(s[0]["date"])} → hoy', col(mo["eur"]),
              f'<div style="padding:6px 0 0 0;">{tira_barras(s, alto=22)}</div>')
    pos = [p for p in d["positions"] if p["value"] >= 0.01]
    fs = sum(p["value"] for p in pos)
    w1m = sum(p["value"] * p["chg1m"] for p in pos) / fs if fs else 0
    diff = w1m - d["index"]["chg1m"]
    t4 = tile("Tus fondos vs índice", f'{"+" if diff > 0 else "−" if diff < 0 else ""}{num(diff, 2)} pp',
              f'1 mes: {pct(w1m)} vs {pct(d["index"]["chg1m"])}', col(diff))
    gap = '<td width="6" style="width:6px;font-size:1px;line-height:1px;">&nbsp;</td>'
    return (f'<tr><td style="padding:0;"><table {TBL} style="table-layout:fixed;">'
            f'<tr>{t1}{gap}{t2}</tr><tr><td colspan="3" height="6" style="height:6px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
            f'<tr>{t3}{gap}{t4}</tr></table></td></tr>')


def desglose(d):
    """Semana y mes: tu dinero, mercado y total en una tabla pequeña."""
    wk, mo = d["week"], d["month"]
    cab = f'font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};padding:0 0 3px 0;'
    c = f'border-top:1px solid {LINEA};font-family:{FONT};font-size:14px;line-height:18px;padding:5px 0 5px 6px;'
    filas = ""
    for et, a, b, bold in [("Mercado", wk["market"], mo["market"], False), ("Tu dinero", wk["yourMoney"], mo["yourMoney"], False),
                           ("Cambio total", wk["eur"], mo["eur"], True)]:
        w = "font-weight:700;" if bold else ""
        filas += (f'<tr><td style="{c}padding-left:0;color:{TXT};{w}">{et}</td>'
                  f'<td align="right" style="{c}{NW}{w}color:{col(a)};">{eur(a, 0, True)}</td>'
                  f'<td align="right" style="{c}{NW}{w}color:{col(b)};">{eur(b, 0, True)}</td></tr>')
    return (titulo("DE DÓNDE VIENE EL CAMBIO")
            + f'<tr><td><table {TBL} style="border-collapse:collapse;"><tr><td style="{cab}">&nbsp;</td>'
              f'<td align="right" width="90" style="width:90px;{cab}">Semana</td><td align="right" width="90" style="width:90px;{cab}">Mes</td></tr>{filas}</table></td></tr>'
            + f'<tr><td style="padding:5px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
              f'Mercado = lo que cambiaron de precio tus inversiones. Tu dinero = lo que aportaste o retiraste (vender un fondo no cuenta, solo pasa dinero a efectivo).</td></tr>')


def mercados(m):
    if not m:
        return ""
    cab = f'font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};padding:0 0 3px 0;'
    celda = f'border-top:1px solid {LINEA};font-family:{FONT};font-size:14px;line-height:18px;'
    sep = (lambda t: f'<tr><td colspan="3" bgcolor="{TILE}" style="background-color:{TILE};padding:3px 6px;font-family:{FONT};'
                     f'font-size:12px;line-height:16px;letter-spacing:0.5px;color:{MUTED};">{t}</td></tr>')
    filas = ""
    if m.get("funds"):
        filas += sep("TUS FONDOS · índice que siguen")
        for r in m["funds"]:
            filas += (f'<tr><td style="padding:5px 0 5px 6px;{celda}color:{TXT};">{html.escape(r["index"])}'
                      f'<span style="font-size:12px;color:{MUTED};"> · {html.escape(r["fund"])}</span></td>'
                      f'<td align="right" width="62" style="width:62px;padding:5px 0 5px 6px;{celda}{NW}color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                      f'<td align="right" width="56" style="width:56px;padding:5px 6px 5px 6px;{celda}{NW}font-weight:600;color:{col(r["impact"])};">{eur(r["impact"], 0, True)}</td></tr>')
        e = m["estimate"]
        filas += (f'<tr><td style="padding:5px 0 5px 6px;{celda}color:{INK};font-weight:700;">En total</td>'
                  f'<td align="right" style="padding:5px 0 5px 6px;{celda}{NW}font-weight:700;color:{col(e["pct"])};">{pct(e["pct"])}</td>'
                  f'<td align="right" style="padding:5px 6px 5px 6px;{celda}{NW}font-weight:700;color:{col(e["eur"])};">{eur(e["eur"], 0, True)}</td></tr>')
    if m.get("others"):
        filas += sep("OTROS MERCADOS")
        for r in m["others"]:
            nota = f'<span style="color:{MUTED};font-size:12px;"> · {html.escape(r["note"])}</span>' if r.get("note") else ""
            filas += (f'<tr><td style="padding:5px 0 5px 6px;{celda}color:{TXT};">{html.escape(r["name"])}{nota}</td>'
                      f'<td align="right" style="padding:5px 0 5px 6px;{celda}{NW}color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                      f'<td style="{celda}">&nbsp;</td></tr>')
    out = []
    if filas:
        sub = f'<span style="font-weight:400;letter-spacing:0;"> · {fdate(m["from"])} → {fdate(m["to"])}</span>' if m.get("from") else ""
        out.append(titulo("LA SEMANA EN LOS MERCADOS", sub))
        out.append(f'<tr><td><table {TBL} style="border-collapse:collapse;">'
                   f'<tr><td style="{cab}">&nbsp;</td><td align="right" style="{cab}">Semana</td><td align="right" style="{cab}padding-right:6px;">Para ti</td></tr>{filas}</table></td></tr>')
        if m.get("funds"):
            out.append(f'<tr><td style="padding:5px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
                       f'«Semana» ya está en euros. «Para ti» = valor de cada fondo hoy × lo que hizo su índice: es una estimación; '
                       f'la cifra exacta de tu semana está en las casillas de arriba, con los precios oficiales que ya han llegado.</td></tr>')
    if m.get("headlines"):
        li = "".join(f'<tr><td width="12" valign="top" style="width:12px;font-family:{FONT};font-size:13px;line-height:18px;color:{MUTED};">·</td>'
                     f'<td style="padding:0 0 5px 0;font-family:{FONT};font-size:13px;line-height:18px;color:{TXT};">{html.escape(h["title"])}'
                     f' <a href="{html.escape(h["url"])}" style="color:{BAR_TODAY};text-decoration:none;{NW}">({html.escape(h.get("source", "fuente"))})</a></td></tr>'
                     for h in m["headlines"])
        out.append(titulo("TITULARES DE LA SEMANA"))
        out.append(f'<tr><td><table {TBL}>{li}</table></td></tr>')
    return "".join(out)


def cartera(d):
    """Reparto (barra fina) + 1 mes de cada fondo frente al índice, en una sola lista."""
    total = d["total"]
    pos = sorted([p for p in d["positions"] if p["value"] >= 0.01], key=lambda p: -p["value"])
    idx = d["index"]
    filas = ""
    for name, val, color, extra in [(p["short"], p["value"], BAR_TODAY, p) for p in pos] + [("Efectivo", d["cash"], BLUE_L, None)]:
        w = val / total * 100
        if extra:
            dif = extra["chg1m"] - idx["chg1m"]
            sub = (f'1 mes <span style="color:{col(extra["chg1m"])};">{pct(extra["chg1m"])}</span> · '
                   f'vs índice <b style="color:{col(dif)};">{"+" if dif > 0 else "−" if dif < 0 else ""}{num(dif, 2)} pp</b>')
        else:
            sub = "ahorro para el piso"
        barra = (f'<table {TBL} style="table-layout:fixed;"><tr>'
                 f'<td width="{w:.1f}%" height="5" bgcolor="{color}" style="width:{w:.1f}%;height:5px;background-color:{color};font-size:1px;line-height:1px;">&nbsp;</td>'
                 f'<td width="{100 - w:.1f}%" height="5" bgcolor="{TRACK}" style="width:{100 - w:.1f}%;height:5px;background-color:{TRACK};font-size:1px;line-height:1px;">&nbsp;</td></tr></table>')
        filas += (f'<tr><td style="padding:7px 0 0 0;"><table {TBL}><tr>'
                  f'<td style="font-family:{FONT};font-size:14px;line-height:19px;color:{TXT};{NW}">{html.escape(name)}</td>'
                  f'<td align="right" style="font-family:{FONT};font-size:14px;line-height:19px;{NW}color:{INK};">{eur(val, 0)}'
                  f'<span style="color:{MUTED};display:inline-block;width:50px;text-align:right;">{num(w, 1)} %</span></td></tr>'
                  f'<tr><td colspan="2" style="padding:3px 0 2px 0;">{barra}</td></tr>'
                  f'<tr><td colspan="2" style="font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">{sub}</td></tr></table></td></tr>')
    pie = (f'<tr><td style="padding:6px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
           f'Índice de referencia: {html.escape(idx["name"])}, {pct(idx["chg1m"])} en un mes. «vs índice» = 1 mes del fondo menos 1 mes del índice, en puntos.</td></tr>')
    return titulo("TU CARTERA", f'<span style="font-weight:400;letter-spacing:0;"> · invertido {eur(d["invested"], 0)} · efectivo {eur(d["cash"], 0)}</span>') + filas + pie


def operaciones(d):
    ops = d["week"].get("ops") or []
    if not ops:
        return ""
    verbos = {"buy": "Compra", "sell": "Venta", "transfer": "Traspaso", "deposit": "Ingreso", "withdrawal": "Retirada", "interest": "Intereses"}
    li = "".join(f'<tr><td width="52" valign="top" style="width:52px;font-family:{FONT};font-size:13px;line-height:20px;color:{MUTED};{NW}">{fdate(o["date"])}</td>'
                 f'<td style="font-family:{FONT};font-size:14px;line-height:20px;color:{TXT};">{verbos.get(o["type"], o["type"].capitalize())} '
                 f'<b style="{NW}">{eur(o["amount"])}</b> · <span style="{NW}">{html.escape(o["asset"])}</span></td></tr>'
                 for o in sorted(ops, key=lambda o: o["date"]))
    tot = sum(o["amount"] for o in ops if o["type"] == "buy")
    sub = f'<span style="font-weight:400;letter-spacing:0;"> · {len(ops)} · compras {eur(tot)}</span>' if tot else ""
    return titulo("OPERACIONES DE LA SEMANA", sub) + f'<tr><td><table {TBL}>{li}</table></td></tr>'


def ideas(ex):
    if not ex.get("ideas"):
        return ""
    li = "".join(f'<tr><td width="30" valign="top" style="width:30px;padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
                 f'<td align="center" width="24" height="24" bgcolor="{TILE}" style="width:24px;height:24px;background-color:{TILE};font-family:{FONT};font-size:13px;line-height:24px;font-weight:700;color:{BAR_TODAY};">{i["n"]}</td></tr></table></td>'
                 f'<td style="padding:6px 0 6px 6px;font-family:{FONT};font-size:14px;line-height:20px;color:{TXT};">'
                 f'<b style="color:{INK};">{html.escape(i["title"])}</b> <span style="color:{MUTED};font-size:12px;">· esfuerzo {html.escape(i.get("effort", ""))}</span><br>'
                 f'{html.escape(i.get("what", ""))}<br><span style="color:{MUTED};font-size:13px;">{html.escape(i.get("why", ""))}</span></td></tr>' for i in ex["ideas"])
    return (titulo("IDEAS PARA EL TRACKER") + f'<tr><td><table {TBL}>{li}</table></td></tr>'
            + f'<tr><td style="padding:4px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
              f'Para aprobar o descartar, responde en el proyecto Portfolio Tracker: «haz la {ex["ideas"][0]["n"]}» o «descarta la {ex["ideas"][0]["n"]}». Nada se cambia sin tu sí.</td></tr>')


def pie(ex):
    lineas = ([ex["backup"]] if ex.get("backup") else []) + (ex.get("notes") or [])
    if not lineas:
        return ""
    li = "".join(f'<tr><td style="padding:2px 0;font-family:{FONT};font-size:12px;line-height:17px;color:{MUTED};">{html.escape(l)}</td></tr>' for l in lineas)
    sep = (f'<tr><td height="22" style="height:22px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
           f'<tr><td height="1" bgcolor="#d1d5db" style="height:1px;background-color:#d1d5db;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
           f'<tr><td height="10" style="height:10px;font-size:1px;line-height:1px;">&nbsp;</td></tr>')
    return sep + li


def construir(d, ex, m):
    cab = f"SEMANA {rango(d)}".upper()
    url = html.escape(d["trackerUrl"])
    txt = frase(d)
    al = avisos(d)
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Cartera · semana</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;">{html.escape(txt)}</div>
<table {TBL} bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" style="padding:18px 16px 24px 16px;">
<table {TBL} style="max-width:560px;">
<tr><td style="padding:0 0 8px 0;"><table {TBL}><tr>
<td style="font-family:{FONT};font-size:12px;line-height:16px;letter-spacing:1.5px;color:{MUTED};{NW}">{cab} · CARTERA</td>
<td align="right" style="font-family:{FONT};font-size:13px;line-height:16px;{NW}"><a href="{url}" style="color:{BAR_TODAY};text-decoration:none;">Abrir el tracker&nbsp;→</a></td>
</tr></table></td></tr>
{D.avisos_html(al)}
{cifras(d, m)}
<tr><td style="font-family:{FONT};font-size:15px;line-height:21px;color:{TXT};padding:16px 0 0 0;">{html.escape(txt)}</td></tr>
{desglose(d)}
{mercados(m)}
{D.calendario(d)}
{cartera(d)}
{operaciones(d)}
{ideas(ex)}
{pie(ex)}
</table>
</td></tr></table>
</body></html>
"""


def asunto(d):
    return f"Cartera · semana {rango(d)} · {num(d['total'], 0)} € ({pct(d['week']['pct'])})"


def texto(d, ex, m):
    wk, mo = d["week"], d["month"]
    L = [asunto(d), f"Patrimonio: {eur(d['total'], 0)} (invertido {eur(d['invested'], 0)}, efectivo {eur(d['cash'], 0)})", frase(d),
         f"Semana: {eur(wk['eur'], sign=True)} ({pct(wk['pct'])}); mercado {eur(wk['market'], sign=True)}, tu dinero {eur(wk['yourMoney'], sign=True)}",
         f"Último mes: {eur(mo['eur'], 0, True)}; mercado {eur(mo['market'], 0, True)}, tu dinero {eur(mo['yourMoney'], 0, True)}"]
    L += ["Aviso: " + a for a in avisos(d)]
    if m.get("funds"):
        L.append(f"La semana en los mercados: tus fondos, según sus índices, unos {eur(m['estimate']['eur'], 0, True)} ({pct(m['estimate']['pct'])}).")
        L += [f"  {r['index']} ({r['fund']}): {pct(r['chg'])} -> {eur(r['impact'], 0, True)}" for r in m["funds"]]
    L += [f"  {r['name']}: {pct(r['chg'])}" for r in m.get("others") or []]
    L += [f"- {h['title']} ({h.get('source', '')}) {h.get('url', '')}" for h in m.get("headlines") or []]
    L += [f"{p['short']}: {eur(p['value'], 0)} · 1 mes {pct(p['chg1m'])}" for p in d["positions"] if p["value"] >= 0.01]
    L.append(f"{d['index']['name']}: 1 mes {pct(d['index']['chg1m'])}")
    L += [f"{o['date']} {o['type']} {eur(o['amount'])} {o['asset']}" for o in wk.get("ops") or []]
    L += [f"Idea {i['n']}: {i['title']} ({i.get('effort', '')}). {i.get('what', '')} {i.get('why', '')}" for i in ex.get("ideas") or []]
    if ex.get("ideas"):
        L.append("Para aprobar o descartar ideas, responde en el proyecto Portfolio Tracker, p. ej. «haz la 2» o «descarta la 1».")
    L += ([ex["backup"]] if ex.get("backup") else []) + (ex.get("notes") or [])
    L.append("Abrir el tracker: " + d["trackerUrl"])
    return "\n".join(L) + "\n"


def leer(p):
    if p and os.path.exists(p):
        try:
            return json.load(open(p, encoding="utf-8"))
        except Exception:
            pass
    return {}


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    datos = json.load(open(src, encoding="utf-8"))
    ex = leer(sys.argv[3] if len(sys.argv) > 3 else None)
    m = leer(sys.argv[4] if len(sys.argv) > 4 else None)
    base = dst[:-5] if dst.endswith(".html") else dst
    open(dst, "w", encoding="utf-8").write(construir(datos, ex, m))
    open(base + ".txt", "w", encoding="utf-8").write(texto(datos, ex, m))
    open(base + ".asunto", "w", encoding="utf-8").write(asunto(datos))
    print(asunto(datos))
