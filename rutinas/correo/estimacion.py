#!/usr/bin/env python3
"""Fusiona la estimación de HOY (estim.json de mercado.py) con el documento insights/estimacion del tracker.

Uso: python3 -I estimacion.py <estim.json> <documento actual .json o -> <salida .json>
El documento: {"updated": ISO, "days": {"AAAA-MM-DD": {"us": {"name", "chg", "via"}, ...}}}, con los 10 últimos días.
La app suma, para cada fondo, los días posteriores a su último valor liquidativo (y deja de mostrarlos cuando llega el dato).
"""
import json, sys, datetime

EST, CUR, OUT = sys.argv[1:4]
e = json.load(open(EST, encoding="utf-8"))
doc = {}
if CUR != "-":
    try:
        x = json.load(open(CUR, encoding="utf-8"))
        doc = x.get("data", x) if isinstance(x, dict) and "data" in x and len(x) <= 4 else x
    except Exception:
        doc = {}
days = dict(doc.get("days") or {})
days[e["date"]] = e["idx"]
keep = sorted(days)[-10:]
out = {"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "days": {d: days[d] for d in keep}}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False))
