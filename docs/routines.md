# Claude cloud routines

The app does not fetch prices or send emails by itself. That is the job of scheduled **Claude Code cloud tasks** (routines). Each routine is a set of written instructions that Claude follows step by step, using these tools:

- **ArtifactData**, to read and write the Artifact's database.
- **WebFetch / WebSearch**, for fund pages, quotes and headlines.
- The **Alpha Vantage** connector, for ETFs, indices, bitcoin and the US dollar.
- The **Gmail** connector, to send the emails.

The instruction templates are in `routines/prompts/`. Before creating a routine, replace the placeholders:

| Placeholder | Value |
|---|---|
| `<ARTIFACT_URL>` | Your Artifact's link (`https://claude.ai/artifact/…`) |
| `<YOUR_EMAIL>` | The address the emails should go to |
| `<REPO_PATH>` | Where this repository lives in the routine's environment |
| `<PROJECT_FOLDER>` | A persistent folder for ideas and backups |
| `<OPTIONAL PERSONAL CONTEXT>` | Weekly email only: anything the ideas should take into account, such as a savings goal |

## 1. Update prices (`prompts/update-prices.txt`)

Runs on weekdays at 21:40 (Europe/Madrid). The app can also start it from the "Update prices" button through `fire_trigger` on the *Claude Code Remote* connector. For that to work, the routine's id must be in `NAV_TASK` or in `settings/main.navTask`.

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

## 2. Daily summary (`prompts/daily-summary.txt`)

Runs on weekdays at 22:45, once US closing prices are available. If an index is still missing, it retries up to twice, 15 minutes apart.

```
ArtifactData list/get  →  db/                    (read-only)
data.py      db/ TODAY → data.json               net worth, day, month, calendar, trades, alerts
Alpha Vantage            → quotes/*.csv, btc.json   SPY, EEM, IUSN.DEX, 4GLD.DEX (+ fallbacks VB, VSS, GLD)
WebFetch (≥ 2 sources)   → headlines.json        4 headlines, at most 2 per source
market.py    → market.json (+ estimate.json)     "Today in the markets" and per-index estimate
estimate.py  → insights/estimate                 shown in the app as the intraday estimate
daily.py     → email.html, email.txt, email.subject
Gmail send_message
```

## 3. Weekly summary (`prompts/weekly-summary.txt`)

Runs on Sunday evenings. It is the same pipeline with `market_week.py` and `weekly.py`. It also proposes three improvement ideas in an `ideas/backlog.md` file and saves a database backup in the app's "Restore backup" format, keeping the 8 most recent.

## 4. Market data (`prompts/market-data.txt`)

Runs once a week and fills `insights/market`, which "My analyst" uses as context: the ECB deposit rate, 12-month Spanish T-bills, inflation (CPI), the global index's drawdown from its peak, and the CAPE ratio. It saves only dated, sourced facts. Anything older than 45 days is hidden.

## Scripts (`routines/email/`)

Plain Python 3 with no dependencies. Run them with `python3 -I` so they never import modules from the working directory.

| Script | Purpose |
|---|---|
| `data.py <db> <TODAY> <data.json>` | Computes everything from the database. Each day's market effect is exact: change in invested value − buys + sells. Everything else is "your money" |
| `market.py <data.json> <db> <TODAY> <quotes> <headlines.json> <market.json> [estimate.json]` | Converts each index's move to euros and its impact on your funds. Anything not from TODAY is discarded |
| `market_week.py …` | The same for the week (today's close against the close 7 days earlier) |
| `estimate.py <estimate.json> <current doc or -> <out>` | Merges today's estimate into the last 10 days |
| `daily.py <data.json> <email.html> [market.json]` | Daily email: 4 tiles, the day's market, headlines and the monthly calendar |
| `weekly.py <data.json> <email.html> <extras.json> [market-week.json]` | Weekly email, reusing the building blocks of `daily.py` |
| `screenshots.js <folder>` | 390 px screenshots in light mode and a simulated dark mode, for reviewing the email |

**Configuration:** copy `config.example.json` to `config.json` (it is git-ignored) and set your tracker's link and which fund tracks which index:

```json
{
  "trackerUrl": "https://claude.ai/artifact/<ID>",
  "funds": [
    {"id": "<asset id>", "short": "S&P 500 fund", "index": "S&P 500", "symbol": "SPY", "usd": true}
  ]
}
```

**HTML for Gmail:** tables and inline styles only, with no `<style>`, images, SVG or JS. Bars are `<td>` cells with `height`/`bgcolor` and `&nbsp;`, because Gmail strips empty `div`s.

### Try the emails with sample data

```bash
node tools/demo-seed.js --today 2026-11-20 --db /tmp/db
cd routines/email
python3 -I data.py /tmp/db 2026-11-20 /tmp/data.json
mkdir -p /tmp/email && python3 -I daily.py /tmp/data.json /tmp/email/email.html
node screenshots.js /tmp/email
```

## Lessons learned

- On a free key, Alpha Vantage doesn't publish the day's close until after about 22:15 Madrid time, and Xetra closes arrive even later. That is why the daily email goes out at 22:45 and uses US-listed fallbacks converted to euros: small caps = 60 % VB + 40 % VSS, and gold = GLD.
- Funds publish their NAV the next day. Until it arrives, the email and the app use the index-based estimate, always labelled as an estimate, and never a made-up 0 €.
- Headlines: Investing.com (Spanish edition), Bloomberg Línea and Bolsamanía return same-day news if you add `?nocache=1`. Many outlets block automated fetching.
