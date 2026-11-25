#!/usr/bin/env python3
"""Construye mercado-semana.json (sección «La semana en los mercados» del correo semanal).

Uso: python3 -I mercado-semana.py <datos.json> <carpeta_db> <HOY> <carpeta_cot> <titulares.json> <salida.json>

<carpeta_cot> contiene lo que la rutina descarga de Alpha Vantage:
  SPY.csv, EEM.csv, IUSN.DEX.csv, 4GLD.DEX.csv -> TIME_SERIES_DAILY en CSV: cabecera + al menos 7 filas
     (timestamp,open,high,low,close,volume; de la más nueva a la más vieja)
  btc.json -> {"now": <cierre BTC/EUR de HOY>, "weekAgo": <cierre de hace 7 días>} (DIGITAL_CURRENCY_DAILY)
<titulares.json> = [{"title", "source", "url"}, ...] (máx. 5; puede faltar o estar vacío).

La semana de cada cotización va del último cierre de los 7 días anteriores a HOY hasta el último cierre
de la semana anterior (cierre de hace 7 días o el anterior más cercano). Si el último cierre tiene más
de 4 días, esa fila no sale. SPY y EEM se pasan a euros con navs/fx-USD de la base de datos.
Si no queda nada que mostrar, no escribe el fichero (el correo sale sin la sección).
"""
import json, os, sys, datetime as dt

DATOS, DB, HOY, COT, TIT, OUT = sys.argv[1:7]
hoy = dt.date.fromisoformat(HOY)

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
FONDOS = [(f["id"], f["corto"], f["indice"], f["simbolo"], f["usd"]) for f in CFG.get("fondos", [])]  # (fondo, nombre corto, índice, símbolo, en dólares)


def load(p):
    with open(p, encoding="utf-8") as f:
        x = json.load(f)
    return x.get("data", x) if isinstance(x, dict) and "data" in x and len(x) <= 4 else x


def serie(sym):
    p = os.path.join(COT, sym + ".csv")
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


def en_o_antes(m, d):
    ks = [k for k in m if k <= d.isoformat()]
    return max(ks) if ks else None


def semana(m):
    """(fecha fin, fecha inicio, cambio %) o None."""
    fin = en_o_antes(m, hoy)
    if not fin or (hoy - dt.date.fromisoformat(fin)).days > 4:
        return None
    ini = en_o_antes(m, dt.date.fromisoformat(fin) - dt.timedelta(days=7))
    if not ini:
        return None
    return fin, ini, (m[fin] / m[ini] - 1) * 100


d = load(DATOS)
val = {p["id"]: p["value"] for p in d.get("positions", [])}
fxp = os.path.join(DB, "navs", "fx-USD.json")
fxm = load(fxp).get("m", {}) if os.path.exists(fxp) else {}

funds, fechas = [], set()
for fid, fondo, nombre, sym, usd in FONDOS:
    s = semana(serie(sym))
    if s is None or fid not in val:
        continue
    fin, ini, chg = s
    if usd:
        a, b = en_o_antes(fxm, dt.date.fromisoformat(fin)), en_o_antes(fxm, dt.date.fromisoformat(ini))
        if not a or not b or a < ini:
            continue
        chg = ((1 + chg / 100) * fxm[a] / fxm[b] - 1) * 100
    fechas.update([fin, ini])
    funds.append({"index": nombre, "fund": fondo, "chg": round(chg, 2), "impact": round(val[fid] * chg / 100, 2), "base": val[fid]})

others = []
g = semana(serie("4GLD.DEX"))
if g:
    others.append({"name": "Oro", "note": "en euros", "chg": round(g[2], 2)})
try:
    b = json.load(open(os.path.join(COT, "btc.json"), encoding="utf-8"))
    if b.get("now") and b.get("weekAgo"):
        others.append({"name": "Bitcoin", "note": "en euros", "chg": round((float(b["now"]) / float(b["weekAgo"]) - 1) * 100, 2)})
except Exception:
    pass
fin = en_o_antes(fxm, hoy)
if fin and (hoy - dt.date.fromisoformat(fin)).days <= 4:
    ini = en_o_antes(fxm, dt.date.fromisoformat(fin) - dt.timedelta(days=7))
    if ini:
        others.append({"name": "Dólar", "note": "frente al euro", "chg": round((fxm[fin] / fxm[ini] - 1) * 100, 2)})

heads, por_fuente = [], {}
try:
    for h in json.load(open(TIT, encoding="utf-8")):
        src = h.get("source", "fuente")
        if h.get("title") and h.get("url", "").startswith("https://") and por_fuente.get(src, 0) < 2 and len(heads) < 5:
            heads.append({"title": h["title"].strip(), "source": src, "url": h["url"]})
            por_fuente[src] = por_fuente.get(src, 0) + 1
except Exception:
    pass
if len(por_fuente) < 2:  # regla: al menos dos fuentes distintas
    heads = []

m = {}
if funds:
    tot = sum(f["impact"] for f in funds)
    base = sum(f.pop("base") for f in funds)
    m["estimate"] = {"eur": round(tot, 2), "pct": round(tot / base * 100, 2) if base else 0}
    m["funds"] = funds
    m["from"], m["to"] = min(fechas), max(fechas)
if others:
    m["others"] = others
if heads:
    m["headlines"] = heads
if m:
    json.dump(m, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(m, ensure_ascii=False))
