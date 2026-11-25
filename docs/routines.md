# Claude cloud routines

The app does not fetch prices or send emails by itself. That is the job of scheduled **Claude Code cloud tasks** (routines). Each routine is a set of written instructions that Claude follows step by step, using these tools:

- **ArtifactData**, to read and write the Artifact's database.
- **WebFetch / WebSearch**, for fund pages, quotes and headlines.
- The **Alpha Vantage** connector, for ETFs, indices, bitcoin and the US dollar.
- The **Gmail** connector, to send the emails.

The instruction templates are in `rutinas/prompts/`. They are written in Spanish, because the emails and the app are in Spanish. Before creating a routine, replace the placeholders:

| Placeholder | Value |
|---|---|
| `<URL_DEL_ARTIFACT>` | Your Artifact's link (`https://claude.ai/artifact/…`) |
| `<TU_CORREO>` | The address the emails should go to |
| `<RUTA_DEL_REPO>` | Where this repository lives in the routine's environment |
| `<CARPETA_DEL_PROYECTO>` | A persistent folder for ideas and backups |

## 1. Update prices (`prompts/actualizar-precios.txt`)

Runs on weekdays at 21:40 (Europe/Madrid). The app can also start it from the "Actualizar precios" (update prices) button through `fire_trigger` on the *Claude Code Remote* connector. For that to work, the routine's id must be in `NAV_TASK` or in `settings/main.navTask`.

| Asset | Main source | Fallback |
|---|---|---|
| Funds (by ISIN) | finanzen.net/fonds | quefondos.com (with published returns), finect, rankia |
| Stocks and crypto | finanzen.net | Alpha Vantage |
| ETFs and ETCs | Alpha Vantage `GLOBAL_QUOTE` | finanzen.net, only if it shows a date |
| US dollar | finanzen.net (the inverse is stored: euros per dollar) | Alpha Vantage |
| Benchmark | Alpha Vantage | finanzen.net |

Rules worth keeping:

- Every finanzen.net URL needs `?nocache=<YYYYMMDDHHMM>`. Without it, WebFetch returns cached copies from previous days.
- A price without an explicit date is never saved, and the ISIN must always match.
- Write to `navs/{assetId}` with `update`, which merges the `m` map without deleting earlier dates, and record the outcome in `jobs/funds`.
- If anything fails, send a single alert email. If everything works, send nothing.

## 2. Daily summary (`prompts/resumen-diario.txt`)

Runs on weekdays at 22:45, once US closing prices are available. If an index is still missing, it retries up to twice, 15 minutes apart.

```
ArtifactData list/get  →  db/                    (read-only)
datos.py      db/ TODAY → datos.json             net worth, day, month, calendar, trades, alerts
Alpha Vantage            → cot/*.csv, btc.json   SPY, EEM, IUSN.DEX, 4GLD.DEX (+ fallbacks VB, VSS, GLD)
WebFetch (≥ 2 sources)   → titulares.json        4 headlines, at most 2 per source
mercado.py   → mercado.json (+ estim.json)       "Today in the markets" and per-index estimate
estimacion.py → insights/estimacion              shown in the app as the intraday estimate
diario.py    → correo.html, correo.txt, correo.asunto
Gmail send_message
```

## 3. Weekly summary (`prompts/resumen-semanal.txt`)

Runs on Sunday evenings. It is the same pipeline with `mercado-semana.py` and `semanal.py`. It also proposes three improvement ideas in an `ideas/backlog.md` file and saves a database backup in the app's "Restore backup" format, keeping the 8 most recent.

## 4. Market data (`prompts/datos-mercado.txt`)

Runs once a week and fills `insights/mercado`, which "My analyst" uses as context: the ECB deposit rate, 12-month Spanish T-bills, inflation (CPI), the global index's drawdown from its peak, and the CAPE ratio. It saves only dated, sourced facts. Anything older than 45 days is hidden.

## Scripts (`rutinas/correo/`)

Plain Python 3 with no dependencies. Run them with `python3 -I` so they never import modules from the working directory.

| Script | Purpose |
|---|---|
| `datos.py <db> <TODAY> <datos.json>` | Computes everything from the database. Each day's market effect is exact: change in invested value − buys + sells. Everything else is "your money" |
| `mercado.py <datos.json> <db> <TODAY> <cot> <titulares.json> <mercado.json> [estim.json]` | Converts each index's move to euros and its impact on your funds. Anything not from TODAY is discarded |
| `mercado-semana.py …` | The same for the week (today's close against the close 7 days earlier) |
| `estimacion.py <estim.json> <current doc or -> <out>` | Merges today's estimate into the last 10 days |
| `diario.py <datos.json> <correo.html> [mercado.json]` | Daily email: 4 tiles, the day's market, headlines and the monthly calendar |
| `semanal.py <datos.json> <correo.html> <extras.json> [mercado-semana.json]` | Weekly email, reusing the building blocks of `diario.py` |
| `capturas.js <folder>` | 390 px screenshots in light mode and a simulated dark mode, for reviewing the email |

**Configuration:** copy `config.example.json` to `config.json` (it is git-ignored) and set your tracker's link and which fund tracks which index:

```json
{
  "trackerUrl": "https://claude.ai/artifact/<ID>",
  "fondos": [
    {"id": "<asset id>", "corto": "S&P 500 fund", "indice": "S&P 500", "simbolo": "SPY", "usd": true}
  ]
}
```

**HTML for Gmail:** tables and inline styles only, with no `<style>`, images, SVG or JS. Bars are `<td>` cells with `height`/`bgcolor` and `&nbsp;`, because Gmail strips empty `div`s.

### Try the emails with sample data

```bash
node tools/demo-seed.js --today 2026-11-20 --db /tmp/db
cd rutinas/correo
python3 -I datos.py /tmp/db 2026-11-20 /tmp/datos.json
python3 -I diario.py /tmp/datos.json /tmp/correo/correo.html
node capturas.js /tmp/correo
```

## Lessons learned

- On a free key, Alpha Vantage doesn't publish the day's close until after about 22:15 Madrid time, and Xetra closes arrive even later. That is why the daily email goes out at 22:45 and uses US-listed fallbacks converted to euros: small caps = 60 % VB + 40 % VSS, and gold = GLD.
- Funds publish their NAV the next day. Until it arrives, the email and the app use the index-based estimate, always labelled as an estimate, and never a made-up 0 €.
- Headlines: Investing.com (Spanish edition), Bloomberg Línea and Bolsamanía return same-day news if you add `?nocache=1`. Many outlets block automated fetching.
