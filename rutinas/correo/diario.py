#!/usr/bin/env python3
"""Correo diario, opción a (ronda 2): cuadro de mando compacto. Lee el JSON de datos.py.

Uso: python3 -I diario.py datos.json salida.html [mercado.json]  (escribe también salida.txt y salida.asunto)
Solo tablas y estilos en línea (Gmail): sin <style>, sin imágenes, sin SVG, sin JS.
"""
import json, os, sys, html

FONT = "-apple-system,Roboto,Arial,sans-serif"
INK = "#111111"      # cifra principal
TXT = "#333333"      # frase
MUTED = "#6b6b6b"    # secundario (>= 4.5:1 sobre blanco)
UP, DOWN = "#15803d", "#b91c1c"
BAR, BAR_TODAY = "#93b4f5", "#2563eb"
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def num(x, dec=2):
    s = f"{abs(x):,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s


def eur(x, dec=2, sign=False):
    pre = ("+" if x > 0 else "−" if x < 0 else "") if sign else ("−" if x < 0 else "")
    return f"{pre}{num(x, dec)} €"


def pct(x, dec=2):
    pre = "+" if x > 0 else "−" if x < 0 else ""
    return f"{pre}{num(x, dec)} %"


def fecha_corta(iso):
    y, m, d = map(int, iso.split("-"))
    return f"{d} {MESES[m - 1]}"


def sin_cierre(d):
    """True si casi nada de lo invertido tiene precio de hoy (lo normal a la hora del correo:
    los fondos publican su precio al día siguiente). Entonces el «mercado de hoy» de datos.py
    vale 0 € solo porque falta el dato, no porque el mercado no se moviera."""
    return d.get("pricedToday", 1) < 0.5


def estimacion(d):
    """Estimación por índices de mercado.py (o None si no hay cotizaciones de hoy)."""
    m = d.get("mercado") or {}
    return m["estimate"] if m.get("estimate") and m.get("funds") else None


def hoy_aprox(d):
    """(euros, % sobre el patrimonio) del día cuando falta el precio de hoy: estimación + tu dinero."""
    e = estimacion(d)
    if not e:
        return None
    x = e["eur"] + d["change"]["yourMoney"]
    base = d["total"] - x
    return x, (x / base * 100 if base else 0)


def frase(d):
    """Una frase que explica el día: mercado frente a tu dinero."""
    c = d["change"]
    mk, ym, total = c["market"], c["yourMoney"], d["total"]
    umbral = max(5.0, total * 0.0005)            # < 0,05 % del patrimonio = "apenas"
    mk_pct = mk / (total - c["eur"]) * 100 if total - c["eur"] else 0
    tipos = {o["type"] for o in d.get("todayOps", [])}
    if tipos == {"buy"}:
        origen = "tus compras"
    elif tipos == {"sell"}:
        origen = "tus ventas"
    elif ym > 0:
        origen = "el dinero que has metido"
    else:
        origen = "el dinero que has sacado"

    if sin_cierre(d):
        e = estimacion(d)
        if not e:
            p_mk = "aún no hay cierres de hoy para saber cuánto movió el mercado tu cartera"
        elif abs(e["eur"]) < umbral:
            p_mk = f"según sus índices, hoy tus fondos apenas se movieron (unos {eur(e['eur'], 0, True)})"
        else:
            fuerte = " con fuerza" if abs(e["pct"]) >= 1 else ""
            verbo = "subieron" if e["eur"] > 0 else "bajaron"
            p_mk = f"según sus índices, hoy tus fondos {verbo}{fuerte} unos {eur(abs(e['eur']), 0)} ({pct(e['pct'])})"
        if abs(ym) < 0.005:
            return f"{p_mk[0].upper()}{p_mk[1:]}."
        return f"{p_mk[0].upper()}{p_mk[1:]}. Además, {origen}: {eur(ym, sign=True)}."

    if abs(mk) < umbral:
        p_mk = f"el mercado apenas movió tu cartera ({eur(mk, sign=True)})"
    else:
        fuerte = " con fuerza" if abs(mk_pct) >= 1 else ""
        verbo = "subió" if mk > 0 else "bajó"
        p_mk = f"el mercado {verbo}{fuerte} tu cartera {eur(abs(mk))} ({pct(mk_pct)})"

    if abs(ym) < 0.005:
        return f"{p_mk[0].upper()}{p_mk[1:]}."
    mov = "sube" if c["eur"] > 0 else "baja"
    if abs(ym) >= abs(mk):
        return f"{p_mk[0].upper()}{p_mk[1:]}; {mov} por {origen} ({eur(ym, sign=True)})."
    return f"{p_mk[0].upper()}{p_mk[1:]}. Además, {origen}: {eur(ym, sign=True)}."


def avisos_html(alerts):
    if not alerts:
        return ""
    filas = "".join(
        f'<tr><td style="padding:2px 0;font-family:{FONT};font-size:14px;line-height:20px;color:#6b4a00;">{html.escape(a)}</td></tr>'
        for a in alerts)
    return (f'<tr><td style="padding:24px 0 0 0;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            f'<tr><td width="3" bgcolor="#d97706" style="width:3px;background-color:#d97706;font-size:1px;line-height:1px;">&nbsp;</td>'
            f'<td bgcolor="#fff6dc" style="background-color:#fff6dc;padding:10px 14px;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{filas}</table>'
            f'</td></tr></table></td></tr>')


def tira_barras(series, alto=30):
    tot = [s["total"] for s in series]
    lo, hi = min(tot), max(tot)
    rng = (hi - lo) or 1
    base = lo - rng * 0.25
    celdas = []
    for i, v in enumerate(tot):
        h = max(3, min(alto, round((v - base) / (hi - base) * alto)))
        col = BAR_TODAY if i == len(tot) - 1 else BAR
        celdas.append(
            f'<td valign="bottom" height="{alto}" style="padding:0 1px;vertical-align:bottom;height:{alto}px;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td height="{h}" bgcolor="{col}" style="height:{h}px;background-color:{col};font-size:1px;line-height:1px;">&nbsp;</td>'
            f'</tr></table></td>')
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            + "".join(celdas) + "</tr></table>")


def tira_celdas(series, alto=10):
    """Variante: una celda por día, verde si el patrimonio subió, roja si bajó."""
    tot = [s["total"] for s in series]
    celdas = []
    for i in range(1, len(tot)):
        dlt = tot[i] - tot[i - 1]
        col = "#22a05a" if dlt > 0 else "#d9534f" if dlt < 0 else "#c9c9c9"
        if i == len(tot) - 1:
            col = "#15803d" if dlt > 0 else "#b91c1c"
        celdas.append(
            f'<td height="{alto}" bgcolor="{col}" style="height:{alto}px;background-color:{col};'
            f'border-left:2px solid #ffffff;font-size:1px;line-height:1px;">&nbsp;</td>')
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            + "".join(celdas) + "</tr></table>")



# ---------- Opción A (ronda 2): cuadro de mando compacto ----------
GRIS = "#6b7280"
TILE = "#f3f4f6"     # fondo de tile (en oscuro se invierte a gris oscuro)
LINEA = "#e5e7eb"
VERDES = [("#eef0f3", "#374151"), ("#d1fae5", "#065f46"), ("#6ee7b7", "#064e3b"), ("#047857", "#ffffff")]
ROJOS = [("#eef0f3", "#374151"), ("#fee2e2", "#991b1b"), ("#fca5a5", "#7f1d1d"), ("#b91c1c", "#ffffff")]
TBL = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'


def col(x):
    return UP if x > 0 else DOWN if x < 0 else MUTED


def tono(p, u=(0.1, 0.4, 0.8)):
    x = abs(p)
    lvl = 0 if x < u[0] else 1 if x < u[1] else 2 if x < u[2] else 3
    return (VERDES if p >= 0 else ROJOS)[lvl]


def corto_eur(x):
    return ("+" if x >= 0 else "−") + num(x, 0)


def titulo(t, extra=""):
    # separador: hueco + filete fino + hueco (td con height/bgcolor, Gmail borra los div vacíos)
    sep = (f'<tr><td height="26" style="height:26px;font-size:1px;line-height:1px;">&nbsp;</td></tr>'
           f'<tr><td height="1" bgcolor="#d1d5db" style="height:1px;background-color:#d1d5db;font-size:1px;line-height:1px;">&nbsp;</td></tr>')
    return (sep + f'<tr><td style="padding:18px 0 8px 0;font-family:{FONT};font-size:12px;line-height:16px;letter-spacing:1px;'
            f'font-weight:700;color:{MUTED};">{t}{extra}</td></tr>')


def tile(etiqueta, cifra, sub, color_cifra=INK, pie="", grande=False):
    tam, lh = (26, 30) if grande else (22, 28)
    return (f'<td width="50%" valign="top" bgcolor="{TILE}" style="width:50%;background-color:{TILE};padding:10px 12px 10px 12px;font-family:{FONT};">'
            f'<div style="font-size:12px;line-height:16px;color:{MUTED};white-space:nowrap;">{etiqueta}</div>'
            f'<div style="font-size:{tam}px;line-height:{lh}px;font-weight:{600 if not grande else 400};letter-spacing:-0.5px;color:{color_cifra};white-space:nowrap;padding:2px 0 0 0;">{cifra}</div>'
            f'<div style="font-size:12px;line-height:16px;color:{MUTED};white-space:nowrap;">{sub}</div>{pie}</td>')


def cifras(d):
    c, s = d["change"], d["series"]
    m = d.get("mercado") or {}
    d_mes = d["month"]["eur"] if "month" in d else s[-1]["total"] - s[0]["total"]
    tot = sum(x["market"] for x in s)
    up = sum(1 for x in s if x["market"] > 0.005)
    dn = sum(1 for x in s if x["market"] < -0.005)
    if not sin_cierre(d):
        sub1 = f'<b style="color:{col(c["eur"])};">{eur(c["eur"], sign=True)}</b> · {pct(c["pct"])} hoy'
    elif hoy_aprox(d):
        x, p = hoy_aprox(d)
        sub1 = f'<b style="color:{col(x)};">≈&nbsp;{eur(x, 0, True)}</b> · {pct(p)} hoy'
    elif abs(c["yourMoney"]) >= 0.005:
        sub1 = f'<b style="color:{col(c["yourMoney"])};">{eur(c["yourMoney"], sign=True)}</b> de tu dinero hoy'
    else:
        sub1 = "hoy: sin cierres aún"
    t1 = tile("Patrimonio", f'{num(d["total"], 0)}<span style="font-size:16px;color:{MUTED};">&nbsp;€</span>', sub1, grande=True)
    t2 = tile("Patrimonio en un mes", eur(d_mes, 0, True),
              f'{fecha_corta(s[0]["date"])} → hoy', col(d_mes),
              f'<div style="padding:6px 0 0 0;">{tira_barras(s, alto=22)}</div>')
    e = m.get("estimate")
    if e and m.get("funds"):
        t3 = tile("Tus fondos hoy (estim.)", eur(e["eur"], 0, True), f'{pct(e["pct"])} según sus índices', col(e["eur"]))
    else:
        t3 = '<td width="50%" bgcolor="' + TILE + f'" style="width:50%;background-color:{TILE};font-size:1px;line-height:1px;">&nbsp;</td>'
    gap = '<td width="6" style="width:6px;font-size:1px;line-height:1px;">&nbsp;</td>'
    t4 = tile("Mercado, último mes", eur(tot, 0, True), f'{up} días ▲ · {dn} ▼', col(tot))
    return (f'<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">'
            f'<tr>{t1}{gap}{t2}</tr><tr><td colspan="3" height="6" style="height:6px;font-size:1px;line-height:1px;">&nbsp;</td></tr><tr>{t3}{gap}{t4}</tr></table></td></tr>')


def mercado(d):
    m = d.get("mercado")
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
                      f'<td align="right" width="62" style="width:62px;padding:5px 0 5px 6px;{celda}white-space:nowrap;color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                      f'<td align="right" width="52" style="width:52px;padding:5px 6px 5px 6px;{celda}white-space:nowrap;font-weight:600;color:{col(r["impact"])};">{eur(r["impact"], 0, True)}</td></tr>')
    if m.get("others"):
        filas += sep("OTROS MERCADOS")
        for r in m["others"]:
            nota = f'<span style="color:{MUTED};font-size:12px;"> · {html.escape(r["note"])}</span>' if r.get("note") else ""
            filas += (f'<tr><td style="padding:5px 0 5px 6px;{celda}color:{TXT};">{html.escape(r["name"])}{nota}</td>'
                      f'<td align="right" style="padding:5px 0 5px 6px;{celda}white-space:nowrap;color:{col(r["chg"])};">{pct(r["chg"])}</td>'
                      f'<td style="{celda}">&nbsp;</td></tr>')
    out = [titulo("HOY EN LOS MERCADOS")]
    if filas:
        out.append(f'<tr><td><table {TBL} style="border-collapse:collapse;">'
                   f'<tr><td style="{cab}">&nbsp;</td><td align="right" style="{cab}">Hoy</td><td align="right" style="{cab}padding-right:6px;">Para ti</td></tr>{filas}</table></td></tr>')
    if m.get("estimate") and m.get("funds"):
        out.append(f'<tr><td style="padding:5px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{MUTED};">'
                   f'«Hoy» ya está en euros. «Para ti» es una estimación por índices; la cifra real llega con el precio oficial del fondo.'
                   + (' Small caps estimadas con ETF de EE. UU. (VB y VSS) porque la bolsa alemana aún no ha publicado su cierre.' if m.get("proxyNote") else "")
                   + '</td></tr>')
    if m.get("headlines"):
        li = "".join(f'<tr><td width="12" valign="top" style="width:12px;font-family:{FONT};font-size:13px;line-height:18px;color:{MUTED};">·</td>'
                     f'<td style="padding:0 0 4px 0;font-family:{FONT};font-size:13px;line-height:18px;color:{TXT};">{html.escape(h["title"])}'
                     + (f' <a href="{html.escape(h["url"])}" style="color:{BAR_TODAY};text-decoration:none;white-space:nowrap;">({html.escape(h.get("source", "fuente"))})</a>' if h.get("url") else "")
                     + '</td></tr>' for h in m["headlines"])
        out.append(titulo("TITULARES"))
        out.append(f'<tr><td><table {TBL}>{li}</table></td></tr>')
    return "".join(out)


def calendario(d):
    """Calendario compacto: una fila por semana (etiqueta = lunes), celdas con € y %."""
    import datetime as dt
    s = d["series"]
    por = {x["date"]: x for x in s}
    f0, fH = dt.date.fromisoformat(s[0]["date"]), dt.date.fromisoformat(d["date"])
    lunes = f0 - dt.timedelta(days=f0.weekday())
    tot = sum(x["market"] for x in s)
    up = sum(1 for x in s if x["market"] > 0.005)
    dn = sum(1 for x in s if x["market"] < -0.005)
    hc = f'font-family:{FONT};font-size:12px;line-height:14px;color:{GRIS};'
    out = [titulo("EL MERCADO, DÍA A DÍA", f'<span style="font-weight:400;letter-spacing:0;"> · último mes <b style="color:{col(tot)};">{eur(tot, 0, True)}</b>, {up} ▲ {dn} ▼</span>'),
           f'<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="2" border="0" style="table-layout:fixed;"><tr>'
           f'<td width="38" style="width:38px;{hc}">&nbsp;</td>']
    for lab in "LMXJV":
        out.append(f'<td align="center" style="{hc}">{lab}</td>')
    out.append(f'<td width="40" align="right" style="width:40px;{hc}padding:0 1px 0 0;">Sem.</td></tr>')
    sem = lunes
    while sem <= fH:
        ts, hay = 0.0, False
        celdas = ""
        for k in range(5):
            f = sem + dt.timedelta(days=k)
            iso = f.isoformat()
            if iso == d["date"] and sin_cierre(d):
                # hoy sin precio de los fondos: no es 0 €, es «pendiente» (estimación si la hay)
                e = estimacion(d)
                arriba = f"≈{corto_eur(e['eur'])}" if e else "—"
                abajo = "estim." if e else "pendiente"
                if por.get(iso, {}).get("flow"):
                    arriba += f'<span style="font-size:8px;line-height:16px;vertical-align:top;">&nbsp;●</span>'
                celdas += (f'<td bgcolor="#ffffff" align="center" valign="middle" height="34" style="background-color:#ffffff;color:{GRIS};height:34px;padding:1px 0;border:2px solid #2563eb;font-family:{FONT};">'
                           f'<div style="font-size:13px;line-height:16px;font-weight:700;color:{GRIS};white-space:nowrap;">{arriba}</div>'
                           f'<div style="font-size:12px;line-height:14px;color:{GRIS};white-space:nowrap;">{abajo}</div></td>')
            elif iso in por:
                x = por[iso]
                bg, fg = tono(x["pct"])
                ts += x["market"]; hay = True
                hoyc = iso == d["date"]
                borde = "border:2px solid #2563eb;" if hoyc else ""
                pad = "1px 0" if hoyc else "3px 0"
                marca = "●" if x["flow"] else ""
                celdas += (f'<td bgcolor="{bg}" align="center" valign="middle" height="34" style="background-color:{bg};color:{fg};height:34px;padding:{pad};{borde}font-family:{FONT};">'
                           f'<div style="font-size:13px;line-height:16px;font-weight:700;color:{fg};white-space:nowrap;">{corto_eur(x["market"])}'
                           + (f'<span style="font-size:8px;line-height:16px;vertical-align:top;color:{fg};">&nbsp;{marca}</span>' if marca else "")
                           + f'</div><div style="font-size:12px;line-height:14px;color:{fg};white-space:nowrap;">{pct(x["pct"])}</div></td>')
            else:
                celdas += '<td height="34" style="height:34px;font-size:1px;line-height:1px;">&nbsp;</td>'
        # etiqueta de la semana: primer día laborable con dato (o el lunes)
        dias = [sem + dt.timedelta(days=k) for k in range(5)]
        prim = next((f for f in dias if f.isoformat() in por), sem)
        es_hoy = any(f.isoformat() == d["date"] for f in dias)
        et = f'{prim.day} {MESES[prim.month - 1]}'
        out.append(f'<tr><td valign="middle" style="{hc}white-space:nowrap;{"color:#2563eb;font-weight:700;" if es_hoy else ""}">{et}</td>{celdas}'
                   f'<td align="right" valign="middle" style="padding:0 1px 0 0;font-family:{FONT};font-size:13px;font-weight:700;white-space:nowrap;color:{col(ts)};">{corto_eur(ts) if hay else "&nbsp;"}</td></tr>')
        sem += dt.timedelta(days=7)
    out.append("</table></td></tr>")
    leg = "".join(f'<td width="16" height="10" bgcolor="{bg}" style="width:16px;height:10px;background-color:{bg};font-size:1px;line-height:1px;">&nbsp;</td>'
                  f'<td style="font-family:{FONT};font-size:12px;color:{GRIS};white-space:nowrap;padding:0 4px 0 2px;">{t}</td>'
                  for (bg, _), t in [(ROJOS[3], "≤−0,8 %"), (ROJOS[1], ""), (VERDES[0], "0"), (VERDES[1], ""), (VERDES[3], "≥+0,8 %")])
    out.append(f'<tr><td style="padding:5px 0 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>{leg}'
               f'<td style="font-family:{FONT};font-size:12px;color:{GRIS};white-space:nowrap;padding:0 0 0 4px;">● dinero movido</td></tr></table></td></tr>')
    out.append(f'<tr><td style="padding:3px 0 0 0;font-family:{FONT};font-size:12px;line-height:16px;color:{GRIS};">'
               f'Euros ganados o perdidos solo por precios, sin tu dinero. Cada fila es una semana. ● día con compras, ventas o movimientos de efectivo. Recuadro azul: hoy.</td></tr>')
    return "".join(out)


def avisos_html(alerts):
    if not alerts:
        return ""
    filas = "".join(
        f'<tr><td style="padding:1px 0;font-family:{FONT};font-size:13px;line-height:18px;color:#6b4a00;">⚠ {html.escape(a)}</td></tr>'
        for a in alerts)
    return (f'<tr><td style="padding:0 0 10px 0;"><table {TBL}>'
            f'<tr><td width="3" bgcolor="#d97706" style="width:3px;background-color:#d97706;font-size:1px;line-height:1px;">&nbsp;</td>'
            f'<td bgcolor="#fff6dc" style="background-color:#fff6dc;padding:6px 10px;"><table {TBL}>{filas}</table></td></tr></table></td></tr>')


def construir(d, variante="barras"):
    y, m, dd = map(int, d["date"].split("-"))
    import datetime
    wd = DIAS[datetime.date(y, m, dd).weekday()]
    cabecera = f"{wd[:3]} {dd} {MESES[m - 1]}".upper()
    txt_frase = frase(d)
    preheader = html.escape(txt_frase)
    url = html.escape(d["trackerUrl"])
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Cartera</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;">{preheader}</div>
<table {TBL} bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" style="padding:18px 16px 24px 16px;">
<table {TBL} style="max-width:560px;">
<tr><td style="padding:0 0 8px 0;"><table {TBL}><tr>
<td style="font-family:{FONT};font-size:12px;line-height:16px;letter-spacing:1.5px;color:{MUTED};white-space:nowrap;">{cabecera} · CARTERA</td>
<td align="right" style="font-family:{FONT};font-size:13px;line-height:16px;white-space:nowrap;"><a href="{url}" style="color:{BAR_TODAY};text-decoration:none;">Abrir el tracker&nbsp;→</a></td>
</tr></table></td></tr>
{avisos_html(d.get("alerts") or [])}
{cifras(d)}
<tr><td style="font-family:{FONT};font-size:15px;line-height:21px;color:{TXT};padding:16px 0 0 0;">{html.escape(txt_frase)}</td></tr>
{mercado(d)}
{calendario(d)}
</table>
</td></tr></table>
</body></html>
"""


def asunto(d):
    import datetime
    y, m, dd = map(int, d["date"].split("-"))
    wd = DIAS[datetime.date(y, m, dd).weekday()][:3]
    base = f"Cartera · {wd} {dd} {MESES[m - 1]} · {num(d['total'], 0)} €"
    if not sin_cierre(d):
        return f"{base} ({pct(d['change']['pct'])})"
    h = hoy_aprox(d)
    return f"{base} (≈ {pct(h[1])})" if h else base


def texto(d):
    c = d["change"]
    tipos = {"buy": "compra", "sell": "venta", "transfer": "traspaso", "deposit": "ingreso", "withdrawal": "retirada", "interest": "intereses"}
    if not sin_cierre(d):
        hoy_txt = f" ({eur(c['eur'], sign=True)}, {pct(c['pct'])} hoy)"
    elif hoy_aprox(d):
        hoy_txt = f" (≈ {eur(hoy_aprox(d)[0], 0, True)}, {pct(hoy_aprox(d)[1])} hoy, estimado)"
    else:
        hoy_txt = ""
    L = [d["dayLabel"], f"Patrimonio: {num(d['total'], 0)} €{hoy_txt}", frase(d),
         f"Último mes: {eur(sum(x['market'] for x in d['series']), 0, True)} por precios."]
    L += [f"Hoy: {tipos.get(o['type'], o['type'])} de {eur(o['amount'])} en {o['asset']}." for o in d.get("todayOps") or []]
    L += ["Aviso: " + x for x in d.get("alerts") or []]
    m = d.get("mercado") or {}
    if m.get("estimate") and m.get("funds"):
        L.append(f"Mercados hoy: tus fondos deberían moverse unos {eur(m['estimate']['eur'], 0, True)} ({pct(m['estimate']['pct'])}).")
        L += [f"  {r['index']} ({r['fund']}): {pct(r['chg'])} -> {eur(r['impact'], 0, True)}" for r in m["funds"]]
        if m.get("proxyNote"):
            L.append("  (Small caps estimadas con ETF de EE. UU.: VB y VSS.)")
    L += [f"  {r['name']}: {pct(r['chg'])}" for r in m.get("others") or []]
    L += [f"- {h['title']} ({h.get('source', '')}) {h.get('url', '')}" for h in m.get("headlines") or []]
    L.append("Abrir el tracker: " + d["trackerUrl"])
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        datos = json.load(f)
    extra = [a for a in sys.argv[3:] if not a.startswith("--")]
    if extra and os.path.exists(extra[0]):  # mercado.json opcional; si falta o falla, el correo sale sin la sección
        try:
            with open(extra[0], encoding="utf-8") as f:
                datos["mercado"] = json.load(f)
        except Exception:
            pass
    if "--demo-avisos" in sys.argv:
        datos["alerts"] = ["La tarea de precios no se ejecutó hoy."]
    base = dst[:-5] if dst.endswith(".html") else dst
    open(dst, "w", encoding="utf-8").write(construir(datos))
    open(base + ".txt", "w", encoding="utf-8").write(texto(datos))
    open(base + ".asunto", "w", encoding="utf-8").write(asunto(datos))
    print(asunto(datos))
