#!/usr/bin/env python3
"""Merges TODAY's estimate (estimate.json from market.py) into the tracker's insights/estimate document.

Usage: python3 -I estimate.py <estimate.json> <current document .json or -> <out .json>
The document: {"updated": ISO, "days": {"YYYY-MM-DD": {"us": {"name", "chg", "via"}, ...}}}, keeping the last 10 days.
For each fund, the app adds up the days after its latest NAV (and stops showing them once the NAV arrives).
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
