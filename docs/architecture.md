# Architecture

## One HTML file

The published app is a single file, `app.html`, with no local dependencies. It loads only two things from outside: Chart.js 4.4.1 from jsDelivr and the Manrope font from Google Fonts. The file is **generated**: the code lives in `src/`, and `build.js` concatenates it in this order:

1. `head.html`
2. One `<style>` block with `styles/` (base, header-nav, components, forms, tiles, mobile, polish, mobile-v21, calm-theme, sections)
3. `body.html`, the static markup: sidebar, tabs, `#view`, modal and mobile navigation
4. `<style id="anim">` with `motion.css`, then `js/motion.js`
5. Chart.js (CDN)
6. `js/engine.js`, the calculation engine
7. The app: one `<script>` with the files in `js/app/`
8. `tail.html`

The files in `js/app/` are **not modules**. They are pieces of a single immediately invoked function (IIFE) and share its scope: `core/config.js` opens it and `core/boot.js` closes it. That is why the order of the `PARTS` list in `build.js` matters. If you add a new file to `src/`, add it to that list or the build fails.

## Layers

```
┌──────────────────────────── app (IIFE) ───────────────────────────┐
│ ui/      header, charts, mobile nav, events, theme, a11y           │
│ tabs/    one view per section and panel                            │
│ modals/  forms, asset detail sheet, mobile sheets, recurring plans │
│ import/  CSV / DeGiro / JSON and MyInvestor reconciliation         │
│ data/    data quality, trash, undo and backups                     │
│ core/    state, formatting, demo, capabilities, prices, net worth  │
└───────────────────────────────┬───────────────────────────────────┘
                                │ engineState() → Engine.build()
┌───────────────────────────────▼───────────────────────────────────┐
│ engine.js: pure functions, no DOM (FIFO, TWR, IRR, taxes,         │
│ risk metrics, benchmark comparison)                               │
└───────────────────────────────────────────────────────────────────┘
```

### Engine (`src/js/engine.js`)

Pure functions that take `{assets, txs, history, fx, benchmark, settings}` and return positions, daily series, totals and taxes per year. The engine runs the same way in the browser (`window.Engine`) and in Node (`module.exports`), which is why `tests/engine.test.js` extracts it from the built HTML and tests it on its own.

- **FIFO lots** per asset. Transfers (`transfer`) move lots with their cost and dates.
- **TWR** (time-weighted) and **IRR/XIRR** (money-weighted) returns, always on investments only, without cash.
- **Taxes**: gains and losses per year, plus losses deferred when you buy the same security back within two months before or after the sale (art. 33.5 LIRPF). Those losses are released when the repurchased lots are sold.
- **Risk**: volatility, maximum drawdown, Sharpe ratio, beta, and upside/downside capture against the benchmark, plus rolling volatility.

### State and capabilities (`core/`)

- `state.js`: the state `S` mirrors the database collections. `ui` holds interface state, which is remembered in `localStorage`. `engineState()` converts `S` into the engine's input format.
- `capabilities.js`: asks the Artifact runtime (`window.claude.use`) for the `db`, `sample`, `mcp`, `downloads` and `permissions` capabilities, and subscribes to each collection with `onSnapshot`. Without `window.claude`, the app enters **demo mode** using `demo.js`: a simulated portfolio with a fixed seed, labelled as a sample and read-only.
- `prices.js`: reads prices from `navs/*`, rebuilds anchor points from funds' published returns, and starts the price routine with `fire_trigger` from the *Claude Code Remote* connector.
- `patrimony.js`: cash, asset classes and total net worth.

## Data model (Artifact database)

| Collection / document | Contents |
|---|---|
| `assets/{id}` | `name`, `ticker`, `type` (fund, etf, stock, crypto…), `currency`, `isin`, `symbol`, `src` (`nav` for funds priced by ISIN, `auto` for quoted assets, `manual`), `cls`, `target`, `ter`, `inactive` |
| `txs/{id}` | `date`, `type` (buy, sell, transfer, dividend, interest, fee, split), `assetId`, `qty`, `price`, `fees`, `fx`, `amount`, `withholding`, `toAssetId`/`toQty` for transfers, `cashMv` when it moves a cash account |
| `cash/{id}` | A cash account: `name`, `entity`, `rate` and `mv` = `{id: {d, a, t, n}}`, where t is open, in, out, interest or adjust |
| `navs/{assetId}` | Prices written by the routine: `m` = `{date: price}`, plus `kind`, `source`, `checked` and, for funds, `ret`/`annual` (published returns). `navs/fx-USD` holds euros per dollar and `navs/bench` the benchmark |
| `history/{id}`, `fx/{ccy}` | Older series `{points: [[date, value]]}`, merged with `navs` |
| `bench/main` | Benchmark: `name`, `ccy` and `points` |
| `settings/main` | Settings: `riskFree`, benchmark (`benchSymbol`, `benchName`…), the "My analyst" `profile`, `recurring`, `goal`, `navTask`, `displayName` |
| `jobs/funds` | Status of the last price update (`queued`, `done` or `error`, with per-asset results) |
| `insights/claude`, `insights/analyst` | Latest analyses by Claude |
| `insights/market` | Market context (ECB, T-bills, inflation, index drawdown, CAPE), each with date and source |
| `insights/estimate` | Intraday estimate per index, written by the daily routine |
| `trash/*`, `backups/*`, `backupData/*` | 90-day trash, and daily and monthly backups split into chunks of at most 180 KB |

Every write goes through `save()`/`remove()`, which retry once on an `unavailable` error. Before anything is deleted or edited, the previous version goes to the trash and an "Undo" toast appears.

## Sections (`tabs/sections.js`)

Each section has a tab key, which is also the URL hash (`app.html#analysis`):

| Visible section | Key | What it groups |
|---|---|---|
| Home | `home` | Summary, intraday estimate, alerts, evolution |
| Portfolio | `portfolio` | Positions, cash, allocation (regions and map), transactions, rebalancing |
| Analysis | `analysis` | Benchmark, month by month, drawdowns, efficiency, taxes, Claude's analysis |
| Plan | `plan` | Projection, contributions, goals, "My analyst" |
| Settings | `settings` | Assets, import/export, backups, theme |

`cash`, `transactions` and `taxes` are detail views with a back link.

## Test harness (`harness/`)

- `mock.js` replaces `window.claude` with an in-memory database. It is seeded from `window.__SEED` (collection → `{id: document}`) and fakes `sample`, `mcp`, `downloads` and `permissions`. Writes are recorded in `window.__WRITES`.
- `open.js` opens the app in Playwright at the width, theme and seed you ask for, and serves Chart.js locally (`chart.umd.js`). With `mock: false` there is no `window.claude`, so the app opens in demo mode.
- `tools/demo-seed.js` builds the seed from the demo portfolio. With `--db <folder>` it also writes a folder in ArtifactData format, which is handy for testing the scripts in `routines/email/`.
