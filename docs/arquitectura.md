# Arquitectura

## Un único HTML

La app publicada es un solo fichero, `app.html`, sin dependencias locales. Solo carga dos cosas de fuera: Chart.js 4.4.1 desde jsDelivr y la fuente Manrope desde Google Fonts. Ese fichero se **genera**: el código vive en `src/` y `build.js` lo concatena en este orden:

1. `head.html`
2. Un `<style>` con `styles/` (base, header-nav, components, forms, tiles, mobile, polish, mobile-v21, calma, secciones)
3. `body.html`, el marcado fijo: la barra lateral, las pestañas, `#view`, el modal y la navegación móvil
4. `<style id="anim">` con `motion.css`, y `js/motion.js`
5. Chart.js (CDN)
6. `js/engine.js`, el motor de cálculo
7. La app: un `<script>` con los ficheros de `js/app/`
8. `tail.html`

Los ficheros de `js/app/` **no son módulos**: son trozos de una sola función autoejecutada (IIFE) y comparten su ámbito. `core/config.js` la abre y `core/boot.js` la cierra. Por eso importa el orden de la lista `PARTS` de `build.js`. Si añades un fichero nuevo a `src/`, tienes que ponerlo en la lista, o el build falla.

## Capas

```
┌──────────────────────────── app (IIFE) ───────────────────────────┐
│ ui/      cabecera, gráficos, navegación móvil, eventos, tema, a11y │
│ tabs/    una vista por sección y panel                             │
│ modals/  formularios, ficha de activo, hojas móviles, recurrentes  │
│ import/  CSV / DeGiro / JSON y conciliación con MyInvestor         │
│ data/    calidad de datos, papelera, deshacer y copias             │
│ core/    estado, formato, demo, capacidades, precios, patrimonio   │
└───────────────────────────────┬───────────────────────────────────┘
                                │ engineState() → Engine.build()
┌───────────────────────────────▼───────────────────────────────────┐
│ engine.js: funciones puras, sin DOM (FIFO, TWR, TIR, fiscalidad,  │
│ métricas de riesgo, comparación con el índice)                    │
└───────────────────────────────────────────────────────────────────┘
```

### Motor (`src/js/engine.js`)

Son funciones puras que reciben `{assets, txs, history, fx, benchmark, settings}` y devuelven posiciones, series diarias, totales y fiscalidad por año. Funciona igual en el navegador (`window.Engine`) que en Node (`module.exports`), y por eso `tests/engine.test.js` lo extrae del HTML construido y lo prueba aparte.

- **Lotes FIFO** por activo. Los traspasos (`transfer`) mueven los lotes con su coste y su fecha.
- **TWR** (rentabilidad ponderada por tiempo) y **TIR/XIRR** (ponderada por dinero), siempre sobre las inversiones, sin el efectivo.
- **Fiscalidad**: ganancias y pérdidas por año, y pérdidas diferidas si recompras el mismo valor en los dos meses anteriores o posteriores (art. 33.5 LIRPF). Esas pérdidas se liberan cuando vendes los lotes recomprados.
- **Riesgo**: volatilidad, máxima caída, Sharpe, beta y captura en subidas y bajadas frente al índice, además de la volatilidad móvil.

### Estado y capacidades (`core/`)

- `state.js`: el estado `S` refleja las colecciones de la base de datos. `ui` guarda el estado de la interfaz, que se recuerda en `localStorage`. `engineState()` traduce `S` al formato del motor.
- `capabilities.js`: pide al runtime del Artifact (`window.claude.use`) las capacidades `db`, `sample`, `mcp`, `downloads` y `permissions`, y se suscribe a cada colección con `onSnapshot`. Si no hay `window.claude`, la app entra en **modo demostración** con `demo.js`: una cartera simulada con semilla fija, etiquetada como ejemplo y que no se puede editar.
- `prices.js`: lee los precios de `navs/*`, reconstruye anclas a partir de las rentabilidades publicadas de los fondos y lanza la rutina de precios con `fire_trigger` del conector *Claude Code Remote*.
- `patrimony.js`: efectivo, clases de activo y patrimonio total.

## Modelo de datos (base de datos del Artifact)

| Colección / documento | Contenido |
|---|---|
| `assets/{id}` | `name`, `ticker`, `type` (fund, etf, stock, crypto…), `currency`, `isin`, `symbol`, `src` (`nav` para fondos por ISIN, `auto` para cotizaciones, `manual`), `cls`, `target`, `ter`, `inactive` |
| `txs/{id}` | `date`, `type` (buy, sell, transfer, dividend, interest, fee…), `assetId`, `qty`, `price`, `fees`, `fx`, `amount`, `withholding`, `toAssetId`/`toQty` en los traspasos, `cashMv` si mueve una cuenta |
| `cash/{id}` | Cuenta de efectivo: `name`, `entity`, `rate` y `mv` = `{id: {d, a, t, n}}` con t = open, in, out, interest o adjust |
| `navs/{assetId}` | Precios que escribe la rutina: `m` = `{fecha: precio}`, más `kind`, `source`, `checked` y, en los fondos, `ret`/`annual` (rentabilidades publicadas). `navs/fx-USD` guarda los euros por dólar y `navs/bench` el índice |
| `history/{id}`, `fx/{ccy}` | Series antiguas `{points: [[fecha, valor]]}`, que se fusionan con `navs` |
| `bench/main` | Índice de referencia: `name`, `ccy` y `points` |
| `settings/main` | Ajustes: `riskFree`, índice (`benchSymbol`, `benchName`…), `profile` de «Mi analista», `recurring`, `goal`, `navTask`, `nombre` |
| `jobs/funds` | Estado de la última actualización de precios (`queued`, `done` o `error`, con resultados por activo) |
| `insights/claude`, `insights/analista` | Últimos análisis de Claude |
| `insights/mercado` | Contexto de mercado (BCE, Letras, IPC, caída del índice, CAPE), con fecha y fuente |
| `insights/estimacion` | Estimación del día por índice, escrita por la rutina diaria |
| `trash/*`, `backups/*`, `backupData/*` | Papelera de 90 días y copias diarias y mensuales en trozos de 180 KB como máximo |

Toda escritura pasa por `save()`/`remove()`, con un reintento si el error es `unavailable`. Antes de borrar o editar, la versión anterior va a la papelera y aparece un aviso con «Deshacer».

## Secciones (`tabs/secciones.js`)

Las claves internas de las pestañas son de versiones anteriores y se conservan para no romper los enlaces:

| Sección visible | Clave | Qué junta |
|---|---|---|
| Inicio | `resumen` | Resumen, estimación del día, avisos, evolución |
| Cartera | `posiciones` | Posiciones, efectivo, reparto (zonas y mapa), movimientos, rebalanceo |
| Análisis | `analisis` | Índice, mes a mes, caídas, eficiencia, impuestos, análisis de Claude |
| Plan | `proyeccion` | Proyección, aportaciones, metas, «Mi analista» |
| Ajustes | `activos` | Activos, importar/exportar, copias, tema |

`efectivo`, `operaciones` y `fiscal` son vistas de detalle que tienen un enlace para volver.

## Arnés de pruebas (`harness/`)

- `mock.js` sustituye `window.claude` por una base de datos en memoria. La siembra `window.__SEED` (colección → `{id: documento}`) y simula `sample`, `mcp`, `downloads` y `permissions`. Las escrituras quedan en `window.__WRITES`.
- `open.js` abre la app con Playwright en el ancho, tema y semilla que le pidas, y sirve Chart.js en local (`chart.umd.js`). Con `mock: false` no hay `window.claude`, así que abre el modo demostración.
- `tools/demo-seed.js` genera la semilla a partir de la cartera de demostración. Con `--db <carpeta>` crea además una carpeta con el formato de ArtifactData, útil para probar los scripts de `rutinas/correo/`.
