#!/usr/bin/env python3
"""Construye mercado.json (sección «Hoy en los mercados» del correo diario).

Uso: python3 -I mercado.py <datos.json> <carpeta_db> <HOY> <carpeta_cot> <titulares.json> <salida mercado.json> [salida estim.json]

[salida estim.json] (opcional, idea 18 del tracker): cambio de HOY de cada índice en euros, para la «Estimación del día» de la app:
  {"date": HOY, "idx": {"us": {"name", "chg", "via"}, "em": {...}, "small": {...}, "oro": {...}}}  (chg en %, solo lo que sea de HOY)
  Luego estimacion.py lo fusiona con el documento insights/estimacion de la base de datos.

<carpeta_cot> contiene lo que la rutina descarga de Alpha Vantage:
  SPY.csv, EEM.csv, IUSN.DEX.csv, 4GLD.DEX.csv  -> texto CSV tal cual de GLOBAL_QUOTE (cabecera + 1 fila)
  btc.json -> {"now": <BTC/EUR de CURRENCY_EXCHANGE_RATE>, "prevClose": <cierre del día anterior de DIGITAL_CURRENCY_DAILY>}
<titulares.json> = [{"title", "source", "url"}, ...] (máx. 4; puede faltar o estar vacío).

  Respaldos (cotizan en EE. UU. y Alpha Vantage publica su cierre antes que el de Xetra):
  VB.csv + VSS.csv -> small caps mundiales si IUSN.DEX no es de HOY (60 % VB EE. UU. + 40 % VSS resto del mundo, en dólares)
  GLD.csv -> oro (en dólares) si 4GLD.DEX no es de HOY

Reglas: solo se usa una cotización si su latestDay es HOY; si falta, esa fila no sale.
Los ETF en dólares (SPY, EEM) se pasan a euros con el cambio del dólar de la base de datos (navs/fx-USD).
Si no queda nada que mostrar, no escribe el fichero (el correo sale sin la sección).
"""
import json, os, sys, glob

DATOS, DB, HOY, COT, TIT, OUT = sys.argv[1:7]
OUT_EST = sys.argv[7] if len(sys.argv) > 7 else None

def _config():
    """Lee config.json (junto a este script; no se versiona) o, si no existe, config.example.json."""
    base = os.path.dirname(os.path.abspath(__file__))
    for n in ("config.json", "config.example.json"):
        p = os.path.join(base, n)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    return {}


CFG = _config()
FONDOS = [(f["id"], f["indice"], f["simbolo"], f["usd"]) for f in CFG.get("fondos", [])]  # (fondo, índice, símbolo, en dólares)
CORTOS = {f["id"]: f["corto"] for f in CFG.get("fondos", [])}


def load(p):
    with open(p, encoding="utf-8") as f:
        x = json.load(f)
    return x.get("data", x) if isinstance(x, dict) and "data" in x and len(x) <= 4 else x


def quote(sym):
    p = os.path.join(COT, sym + ".csv")
    if not os.path.exists(p):
        return None
    try:
        lines = [l for l in open(p, encoding="utf-8").read().replace("\\r\\n", "\n").splitlines() if l.strip()]
        h = [x.strip() for x in lines[0].split(",")]
        r = dict(zip(h, [x.strip() for x in lines[1].split(",")]))
        if r.get("latestDay") != HOY:
            return None
        return float(r["changePercent"].rstrip("%"))
    except Exception:
        return None


d = load(DATOS)
val = {p["id"]: p["value"] for p in d.get("positions", [])}
fxm = load(os.path.join(DB, "navs", "fx-USD.json")).get("m", {}) if os.path.exists(os.path.join(DB, "navs", "fx-USD.json")) else {}
fk = sorted(k for k in fxm if k <= HOY)
fx = fxm[fk[-1]] / fxm[fk[-2]] if len(fk) >= 2 and fk[-1] == HOY else None  # euros por dólar hoy / ayer

def proxy_small():
    """Small caps mundiales con ETF de EE. UU. (en dólares) cuando IUSN.DEX aún no tiene el cierre de hoy."""
    a, b = quote("VB"), quote("VSS")
    return None if a is None or b is None else 0.6 * a + 0.4 * b


funds, aprox = [], []
for fid, nombre, sym, usd in FONDOS:
    q = quote(sym)
    if q is None and sym == "IUSN.DEX":
        q, usd = proxy_small(), True
        if q is not None:
            aprox.append("small caps con VB y VSS")
    if q is None or fid not in val or (usd and fx is None):
        continue
    chg = ((1 + q / 100) * fx - 1) * 100 if usd else q
    fondo = CORTOS[fid]
    funds.append({"index": nombre, "fund": fondo, "chg": round(chg, 2), "impact": round(val[fid] * chg / 100, 2), "_v": val[fid]})

others = []
g = quote("4GLD.DEX")
if g is None and quote("GLD") is not None and fx is not None:
    g = ((1 + quote("GLD") / 100) * fx - 1) * 100  # GLD (dólares) pasado a euros
if g is not None:
    others.append({"name": "Oro", "note": "en euros", "chg": round(g, 2)})
try:
    b = json.load(open(os.path.join(COT, "btc.json"), encoding="utf-8"))
    if b.get("now") and b.get("prevClose"):
        others.append({"name": "Bitcoin", "note": "en euros", "chg": round((float(b["now"]) / float(b["prevClose"]) - 1) * 100, 2)})
except Exception:
    pass
if fx is not None:
    others.append({"name": "Dólar", "note": "frente al euro", "chg": round((fx - 1) * 100, 2)})

heads = []
try:
    for h in json.load(open(TIT, encoding="utf-8"))[:4]:
        if h.get("title") and h.get("url", "").startswith("https://"):
            heads.append({"title": h["title"].strip(), "source": h.get("source", "fuente"), "url": h["url"]})
except Exception:
    pass

# Estimación del día para la app: todos los índices disponibles de HOY, se tengan o no esos fondos
if OUT_EST:
    est = {}
    for key, nombre, sym, usd in (("us", "S&P 500", "SPY", True), ("em", "Emergentes", "EEM", True), ("small", "Small caps mundiales", "IUSN.DEX", False)):
        q, via = quote(sym), sym
        if q is None and sym == "IUSN.DEX":
            q, usd, via = proxy_small(), True, "VB+VSS"
        if q is None or (usd and fx is None):
            continue
        est[key] = {"name": nombre, "chg": round(((1 + q / 100) * fx - 1) * 100 if usd else q, 3), "via": via}
    if g is not None:
        est["oro"] = {"name": "Oro", "chg": round(g, 3), "via": "4GLD.DEX" if quote("4GLD.DEX") is not None else "GLD"}
    if est:
        json.dump({"date": HOY, "idx": est}, open(OUT_EST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

m = {}
if funds:
    tot = sum(f["impact"] for f in funds)
    base = sum(f.pop("_v") for f in funds)  # valor de los fondos incluidos
    m["estimate"] = {"eur": round(tot, 2), "pct": round(tot / base * 100, 2) if base else 0}
    m["funds"] = funds
    if aprox:
        m["proxyNote"] = "; ".join(aprox)
if others:
    m["others"] = others
if heads:
    m["headlines"] = heads
if m:
    json.dump(m, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(m, ensure_ascii=False))
