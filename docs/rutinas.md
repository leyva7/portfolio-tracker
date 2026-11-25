# Rutinas de Claude en la nube

La app no busca precios ni envía correos por su cuenta: de eso se encargan tareas programadas de **Claude Code en la nube** (rutinas). Cada rutina es un texto con instrucciones que Claude sigue paso a paso, con estas herramientas:

- **ArtifactData**, para leer y escribir la base de datos del Artifact.
- **WebFetch / WebSearch**, para fichas de fondos, cotizaciones y titulares.
- El conector **Alpha Vantage**, para ETF, índices, bitcoin y el dólar.
- El conector **Gmail**, para enviar los correos.

Las plantillas de las instrucciones están en `rutinas/prompts/`. Antes de crear la rutina, sustituye los marcadores:

| Marcador | Valor |
|---|---|
| `<URL_DEL_ARTIFACT>` | El enlace de tu Artifact (`https://claude.ai/artifact/…`) |
| `<TU_CORREO>` | La dirección a la que quieres que lleguen los correos |
| `<RUTA_DEL_REPO>` | Dónde está este repositorio en el entorno de la rutina |
| `<CARPETA_DEL_PROYECTO>` | Una carpeta persistente para las ideas y las copias de seguridad |

## 1. Actualizar precios (`prompts/actualizar-precios.txt`)

Se ejecuta los días laborables a las 21:40 (Europe/Madrid). La app también puede lanzarla con el botón «Actualizar precios», mediante `fire_trigger` del conector *Claude Code Remote*. Para eso, el id de la rutina tiene que estar en `NAV_TASK` o en `settings/main.navTask`.

| Activo | Fuente principal | Respaldo |
|---|---|---|
| Fondos (por ISIN) | finanzen.net/fonds | quefondos.com (con rentabilidades publicadas), finect, rankia |
| Acciones y cripto | finanzen.net | Alpha Vantage |
| ETF y ETC | Alpha Vantage `GLOBAL_QUOTE` | finanzen.net, solo si muestra la fecha |
| Dólar | finanzen.net (se guarda el inverso: euros por dólar) | Alpha Vantage |
| Índice de referencia | Alpha Vantage | finanzen.net |

Reglas que conviene conservar:

- A toda URL de finanzen.net hay que añadirle `?nocache=<AAAAMMDDHHMM>`. Sin eso, WebFetch devuelve copias de días anteriores.
- Un precio sin fecha explícita no se guarda, y siempre se comprueba que el ISIN coincide.
- Escribe en `navs/{assetId}` con `update`, que fusiona el mapa `m` sin borrar fechas anteriores, y deja el resultado en `jobs/funds`.
- Si algo falla, envía un único correo de aviso. Si todo va bien, no envía nada.

## 2. Resumen diario (`prompts/resumen-diario.txt`)

Se ejecuta los días laborables a las 22:45, cuando ya están publicados los cierres de EE. UU. Si falta algún índice, lo reintenta hasta dos veces, con 15 minutos entre intentos.

```
ArtifactData list/get  →  db/                    (solo lectura)
datos.py      db/ HOY → datos.json               patrimonio, día, mes, calendario, operaciones, avisos
Alpha Vantage            → cot/*.csv, btc.json   SPY, EEM, IUSN.DEX, 4GLD.DEX (+ respaldos VB, VSS, GLD)
WebFetch (≥ 2 fuentes)   → titulares.json        4 titulares, máximo 2 por fuente
mercado.py   → mercado.json (+ estim.json)       «Hoy en los mercados» y estimación por índice
estimacion.py → insights/estimacion              la app lo muestra como «Estimación del día»
diario.py    → correo.html, correo.txt, correo.asunto
Gmail send_message
```

## 3. Resumen semanal (`prompts/resumen-semanal.txt`)

Se ejecuta los domingos por la noche. Es la misma cadena con `mercado-semana.py` y `semanal.py`. Además, propone tres ideas de mejora en un `ideas/backlog.md` y guarda una copia de seguridad de la base de datos con el formato de «Restaurar copia» (conserva las 8 más recientes).

## 4. Datos de mercado (`prompts/datos-mercado.txt`)

Se ejecuta una vez a la semana y rellena `insights/mercado`, que «Mi analista» usa como contexto: tipo de depósito del BCE, Letras a 12 meses, IPC, caída del índice mundial desde su máximo y CAPE. Guarda solo hechos con fecha y fuente. Un dato de más de 45 días se oculta.

## Scripts (`rutinas/correo/`)

Son Python 3 sin dependencias, y se ejecutan con `python3 -I` para que no carguen módulos del directorio de trabajo.

| Script | Uso |
|---|---|
| `datos.py <db> <HOY> <datos.json>` | Lo calcula todo a partir de la base de datos. El «mercado» de cada día es exacto: cambio de lo invertido − compras + ventas, y «tu dinero» es el resto |
| `mercado.py <datos.json> <db> <HOY> <cot> <titulares.json> <mercado.json> [estim.json]` | Pasa a euros el cambio de cada índice y su impacto en tus fondos. Descarta lo que no sea de HOY |
| `mercado-semana.py …` | Lo mismo para la semana (cierre de hoy frente al de hace 7 días) |
| `estimacion.py <estim.json> <doc actual o -> <salida>` | Fusiona la estimación de hoy con los 10 últimos días |
| `diario.py <datos.json> <correo.html> [mercado.json]` | Correo diario: 4 casillas, el mercado del día, titulares y calendario del mes |
| `semanal.py <datos.json> <correo.html> <extras.json> [mercado-semana.json]` | Correo semanal, que reutiliza las piezas de `diario.py` |
| `capturas.js <carpeta>` | Capturas a 390 px en claro y en un oscuro simulado, para revisar el correo |

**Configuración:** copia `config.example.json` a `config.json` (no se versiona) y pon el enlace de tu tracker y qué fondos siguen a qué índice:

```json
{
  "trackerUrl": "https://claude.ai/artifact/<ID>",
  "fondos": [
    {"id": "<id del activo>", "corto": "Fondo S&P 500", "indice": "S&P 500", "simbolo": "SPY", "usd": true}
  ]
}
```

**HTML para Gmail:** solo tablas y estilos en línea, sin `<style>`, imágenes, SVG ni JS. Las barras son celdas `<td>` con `height`/`bgcolor` y `&nbsp;`, porque Gmail borra los `div` vacíos.

### Probar los correos con datos de ejemplo

```bash
node tools/demo-seed.js --today 2026-11-20 --db /tmp/db
cd rutinas/correo
python3 -I datos.py /tmp/db 2026-11-20 /tmp/datos.json
python3 -I diario.py /tmp/datos.json /tmp/correo/correo.html
node capturas.js /tmp/correo
```

## Lecciones aprendidas

- La clave gratuita de Alpha Vantage no publica el cierre del día hasta pasadas las 22:15 de Madrid, y el de Xetra aún más tarde. Por eso el correo diario sale a las 22:45 y usa respaldos de EE. UU. pasados a euros: small caps = 60 % VB + 40 % VSS, y oro = GLD.
- Los fondos publican su valor liquidativo al día siguiente. Mientras no llega, el correo y la app usan la estimación por índices, siempre etiquetada como estimación, y nunca un 0 € inventado.
- Titulares: Investing.com (es), Bloomberg Línea y Bolsamanía responden con noticias del día si añades `?nocache=1`. Muchos medios bloquean la descarga automática.
