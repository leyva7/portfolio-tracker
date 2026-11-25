/* ---------- «Mi analista» (Resumen › Análisis de Claude) ----------
 * Hybrid adviser: an investor profile (settings.profile, a short questionnaire) gives a risk level 1–5; fixed rules compare the
 * portfolio with the band of that level and check goal money, cash, diversification, crypto and complexity. Claude then gives
 * a verdict (keep / adjust / review) from that diagnosis plus the portfolio digest. Rules decide the numbers; Claude explains.
 * The verdict is stored in insights/analista. It is not regulated advice and never names products.
 */
const PF_Q = [
  ['horizon', 'Sin contar el dinero de tu objetivo (por ejemplo el piso), ¿cuándo crees que necesitarás lo que tienes invertido?', [['lt3', 'En menos de 3 años'], ['3to5', 'En 3 a 5 años'], ['5to10', 'En 5 a 10 años'], ['gt10', 'En más de 10 años']]],
  ['drop', 'Si tus inversiones cayeran un 25 % en pocos meses, ¿qué harías?', [['sell_all', 'Vendería todo para no perder más'], ['sell_some', 'Vendería una parte'], ['hold', 'No haría nada'], ['buy', 'Aprovecharía para comprar más']]],
  ['maxDD', '¿Qué caída de tus inversiones podrías ver sin perder el sueño? (en 2008–09 la bolsa mundial llegó a caer ≈ 50 %)', [['10', 'Hasta un 10 %'], ['20', 'Hasta un 20 %'], ['30', 'Hasta un 30 %'], ['40', 'Hasta un 40 %'], ['50', 'Un 50 % o más']]],
  ['aim', '¿Qué buscas sobre todo con tus inversiones?', [['preserve', 'Conservar lo que tengo'], ['balance', 'Crecer con prudencia'], ['grow', 'Crecer lo máximo a largo plazo']]],
  ['income', '¿Cómo son tus ingresos?', [['stable', 'Estables (nómina fija o similar)'], ['variable', 'Variables'], ['uncertain', 'Inciertos ahora mismo']]],
  ['experience', '¿Cuánta experiencia tienes invirtiendo?', [['low', 'Poca (menos de 2 años)'], ['mid', 'Media (2 a 5 años)'], ['high', 'Mucha (más de 5 años o varias crisis)']]],
  ['crypto', '¿Aceptarías cripto (por ejemplo bitcoin) en tu cartera?', [['no', 'No'], ['small', 'Solo un poco'], ['yes', 'Sí, sin problema']]],
  ['active', '¿Y fondos de gestión activa?', [['index', 'Prefiero solo indexados'], ['open', 'Estoy abierto si tienen sentido']]],
  ['simple', '¿Cuántos productos quieres gestionar?', [['few', 'Los menos posibles'], ['any', 'Me da igual si hay motivo']]],
];
const PF_LEVELS = [null, ['Conservador', 0.1, 0.3], ['Moderado', 0.3, 0.5], ['Equilibrado', 0.5, 0.7], ['Dinámico', 0.7, 0.9], ['Agresivo', 0.85, 1]];
const PF_CRYPTO = { no: [0, 0, 0, 0, 0], small: [0, 0, 0.02, 0.03, 0.05], yes: [0, 0, 0.03, 0.05, 0.1] };
// Share of each equity sub-class that is US companies (MSCI ACWI IMI ≈ 62 %)
const US_SHARE = { world: 0.62, us: 1, dev: 0, em: 0, small: 0.6, sector: 0.6, single: 0.7 };
const AN_VERDICT = { mantener: ['Para tu perfil, no la tocaría', 'good'], ajustar: ['Algún ajuste menor', 'info'], revisar: ['Conviene revisarla', 'warn'] };
// Stylised crisis like 2008–09 for an EUR investor: loss of each class (equities ≈ −50 %, crypto ≈ −75 %…). With these, a
// band's upper equity share × 0.5 is its crisis drop, so maxDD 10/20/30/40/50 % lines up with levels 1–5.
const AN_CRISIS = { rv: 0.5, cripto: 0.75, oro: 0.1, rf: 0.05, otro: 0.3 };
const PF_VER = 2; // v2: horizon excludes the goal money, maxDD has 5 steps (calibrated to the bands)
const AN_RANK = { mantener: 0, ajustar: 1, revisar: 2 };
const AN_ACT = { mantener: 'Mantener', añadir: 'Añadir', reducir: 'Reducir', vigilar: 'Vigilar' };

function profile() { const p = S.settings && S.settings.profile; return p && p.horizon ? p : null; }
/** Weekly market facts (insights/mercado) if they are less than 3 weeks old; facts only, never forecasts. */
function market() { const m = S.mercado; if (!m || !m.date || DEMO) return null; const age = (Date.parse(todayStr()) - Date.parse(m.date)) / 864e5; return age <= 21 ? Object.assign({ age }, m) : null; }
function marketHtml(M) {
  if (!M) return '';
  const n = (v, d = 2) => (Number.isFinite(+v) && v !== null ? pct(+v / 100, d) : '—');
  const b = M.bolsa || {}, r = [];
  if (M.bce && M.bce.depositoPct != null) r.push(['Tipo del BCE (depósito)', n(M.bce.depositoPct)]);
  if (M.rfCorta && M.rfCorta.pct != null) r.push(['Letras del Tesoro a 12 meses', n(M.rfCorta.pct, 2)]);
  r.push(['Tu efectivo (TAE media)', pct(cashRate(), 2)]);
  if (M.inflacion && M.inflacion.pct != null) r.push([`Inflación en España${M.inflacion.mes ? ` (${esc(M.inflacion.mes)})` : ''}`, n(M.inflacion.pct, 1)]);
  if (b.caidaDesdeMaxPct != null) r.push(['Bolsa mundial frente a su máximo', b.caidaDesdeMaxPct > -0.5 ? 'en máximos' : n(b.caidaDesdeMaxPct, 1)]);
  if (b.cambio12mPct != null) r.push(['Bolsa mundial, últimos 12 meses', `${b.cambio12mPct > 0 ? '+' : ''}${n(b.cambio12mPct, 1)}`]);
  if (M.cape && M.cape.valor != null) r.push([`Valoración de EE. UU. (CAPE)<small>media histórica ${numf(+M.cape.media || 17, 0)}</small>`, numf(+M.cape.valor, 1)]);
  return `<details class="an-mkt"><summary>Contexto de mercado <span class="small muted">· datos del ${fdate(M.date)}</span></summary><div class="stats">${r.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div><p class="note" style="margin:6px 0 0">Datos, no previsiones: sirven para comparar dónde rinde más tu dinero seguro y para poner las caídas en contexto. Ni el diagnóstico ni Claude cambian tu nivel de riesgo por ellos, y nadie puede predecir la bolsa.</p></details>`;
}
/** Risk level 1–5: the lower of tolerance (reaction, drawdown, aim) and capacity (horizon, income); little experience caps it at 4.
 * The drawdown answer also caps tolerance (ddS), so «I can take 30 %» never lands on a band whose crisis drop is 45 %. */
function profileLevel(p) {
  if (!p) return null;
  const dS = { sell_all: 1, sell_some: 2, hold: 4, buy: 5 }[p.drop] || 3, ddS = { 10: 1, 20: 2, 30: 3, 40: 4, 50: 5 }[p.maxDD] || 3;
  const tol = Math.min((dS + ddS + ({ preserve: 1, balance: 3, grow: 5 }[p.aim] || 3)) / 3, ddS);
  const cap = ({ lt3: 1, '3to5': 2, '5to10': 4, gt10: 5 }[p.horizon] || 3) - (p.income === 'uncertain' ? 1 : p.income === 'variable' ? 0.5 : 0);
  const lv = Math.max(1, Math.min(p.experience === 'low' ? 4 : 5, Math.round(Math.min(tol, cap))));
  const by = tol + 0.75 < cap ? 'tolerancia' : cap + 0.75 < tol ? 'capacidad' : null;
  // contradictory answers: reaction to a 25 % fall vs the drawdown you say you can bear
  const incoherent = Math.abs(dS - ddS) >= 3 ? (dS > ddS ? 'Dices que ante una caída del 25 % no venderías, pero también que solo aguantas una caída pequeña.' : 'Dices que aguantas caídas grandes, pero que ante una del 25 % venderías.') : null;
  return { lv, name: PF_LEVELS[lv][0], lo: PF_LEVELS[lv][1], hi: PF_LEVELS[lv][2], tol, cap, by, cryptoCap: PF_CRYPTO[p.crypto || 'no'][lv - 1], maxDD: (+p.maxDD || 30) / 100, incoherent };
}
/** Rules: the diagnosis that Claude has to respect. */
function analystRules() {
  const p = profile(); const L = profileLevel(p); if (!L || !res || !res.positions.length) return null;
  const open = res.positions.filter((z) => z.open && z.value > 0); const inv = open.reduce((s, z) => s + z.value, 0); if (!(inv > 0)) return null;
  const val = (f) => open.filter(f).reduce((s, z) => s + z.value, 0);
  const byCls = {}; for (const z of open) { const k = clsOf(z.asset); byCls[k] = (byCls[k] || 0) + z.value; }
  const crypto = byCls.cripto || 0, rfV = byCls.rf || 0, oroV = byCls.oro || 0, def = rfV + oroV, risk = inv - def;
  const earmark = Math.min(inv, Math.max(0, +p.goalInvested || 0));
  // goal money is covered by fixed income first, then gold, then risky assets; only fixed income counts as safe for it
  const inGold = Math.min(oroV, Math.max(0, earmark - rfV)), atRisk = Math.max(0, earmark - rfV);
  const inRisk = Math.max(0, earmark - def);
  const ltRisk = risk - inRisk, ltDef = Math.max(0, def - earmark), lt = ltRisk + ltDef;
  const riskW = lt > 0 ? ltRisk / lt : 0, cryptoW = lt > 0 ? crypto / lt : 0;
  const eq = open.filter((z) => clsOf(z.asset) === 'rv'); const eqV = eq.reduce((s, z) => s + z.value, 0);
  const sub = {}; for (const z of eq) { const k = subOf(z.asset); sub[k] = (sub[k] || 0) + z.value / (eqV || 1); }
  const usW = Object.entries(sub).reduce((s, [k, w]) => s + w * (US_SHARE[k] ?? 0.5), 0);
  const P = patrimony(); const cu = cushionInfo(); const g = goalInfo();
  const goalCash = g ? Math.min(g.amount, g.cu ? g.cash : P.cash) : 0;
  const idle = cu ? Math.max(0, P.cash - goalCash - cu.amount) : 0; // cash with no job (needs a cushion to tell)
  const riskWAll = lt + idle > 0 ? ltRisk / (lt + idle) : 0;
  // crisis drop of the long-term money (goal money excluded), with the AN_CRISIS losses by class
  const ltByCls = Object.assign({}, byCls); let take = earmark; for (const k of ['rf', 'oro', 'rv', 'cripto', 'otro']) { const t = Math.min(ltByCls[k] || 0, take); ltByCls[k] = (ltByCls[k] || 0) - t; take -= t; }
  const crisis = lt > 0 ? Object.entries(ltByCls).reduce((s, [k, v]) => s + v * (AN_CRISIS[k] ?? 0.3), 0) / lt : 0;
  const yrs = g && g.date ? (Date.parse(g.date) - Date.parse(todayStr())) / (365.25 * 864e5) : null;
  const out = []; const add = (r) => out.push(r);
  const band = `${pct(L.lo, 0)}–${pct(L.hi, 0)}`;
  // 0. coherence of the answers
  if (L.incoherent) add({ id: 'perfil', sev: 0, tone: 'info', act: 'vigilar', title: 'Respuestas que no cuadran', text: `${L.incoherent} He tomado la opción más prudente; si no te representa, revisa el cuestionario.` });
  // 1. risk level of the long-term money
  const cashNote = idle > 0 ? ` Contando los ${eur(idle, 0)} de efectivo sin destino, tu riesgo a largo plazo sería el ${pct(riskWAll, 0)}.` : !cu && P.cash > 0.25 * P.total ? ` No cuento tus ${eur(P.cash, 0)} de efectivo: si fijas tu colchón en Efectivo, sabré qué parte está ociosa.` : '';
  if (riskW > L.hi + 0.005) {
    if (idle > 0 && riskWAll <= L.hi + 0.005) add({ id: 'nivel', sev: 1, tone: 'info', act: 'añadir', title: 'Bolsa alta, pero con efectivo ocioso', text: `El ${pct(riskW, 0)} de lo invertido a largo plazo está en activos de riesgo (perfil ${L.name.toLowerCase()}: ${band}).${cashNote} No hace falta vender ni frenar la bolsa: si ese efectivo es para el largo plazo, lo coherente es llevar una parte a renta fija.` });
    else add({ id: 'nivel', sev: riskW - L.hi > 0.15 ? 2 : 1, tone: 'warn', act: 'reducir', title: 'Más riesgo del que encaja contigo', text: `El ${pct(riskW, 0)} de tu dinero a largo plazo está en bolsa${crypto ? ' y cripto' : ''}; para un perfil ${L.name.toLowerCase()} lo razonable es ${band}.${cashNote} La forma suave de corregirlo es dirigir las próximas aportaciones (o un traspaso entre fondos, sin tributar) a renta fija.` });
  } else if (riskW < L.lo - 0.005) add({ id: 'nivel', sev: L.lo - riskW > 0.15 ? 2 : 1, tone: 'info', act: 'añadir', title: 'Menos riesgo del que podrías asumir', text: `Solo el ${pct(riskW, 0)} de tu dinero a largo plazo está en activos de riesgo; tu perfil ${L.name.toLowerCase()} admite ${band}. A largo plazo, eso suele significar menos rentabilidad esperada.` });
  else add({ id: 'nivel', sev: 0, tone: 'good', act: 'mantener', title: 'Riesgo acorde a tu perfil', text: `El ${pct(riskW, 0)} de tu dinero a largo plazo está en activos de riesgo, dentro de la horquilla de un perfil ${L.name.toLowerCase()} (${band}).${cashNote}` });
  // 1b. crisis test against the drop you said you can bear
  if (lt > 0) {
    const t = `En una crisis como la de 2008–09 (bolsa ≈ −50 %, cripto ≈ −75 %) tu dinero a largo plazo caería en torno a un <b>${pct(crisis, 0)}</b>, unos ${eur(crisis * lt, 0)}.`;
    if (crisis > L.maxDD + 0.05) add({ id: 'caida', sev: 1, tone: 'warn', act: 'reducir', title: 'Caería más de lo que aguantas', text: `${t} Dijiste que podrías ver hasta un ${pct(L.maxDD, 0)} sin perder el sueño. Quien vende en mitad de la caída convierte una pérdida temporal en definitiva: mejor ajustar el reparto ahora, con calma.` });
    else add({ id: 'caida', sev: 0, tone: 'good', act: 'mantener', title: 'Caídas dentro de lo que aguantas', text: `${t} Es compatible con el ${pct(L.maxDD, 0)} que dijiste que aguantarías.` });
  }
  // 2. money for the goal (only fixed income is safe for it; the sooner the goal, the more serious)
  if (atRisk > 1) {
    const when = yrs == null ? 'Sin fecha fijada, lo trato como un gasto cercano.' : yrs < 3 ? `Tu objetivo es dentro de ${yrs < 1 ? 'menos de un año' : `unos ${Math.round(yrs)} años`}.` : `Tu objetivo es dentro de unos ${Math.round(yrs)} años.`;
    const sev = yrs == null || yrs < 3 ? 2 : yrs < 5 ? 1 : 0;
    add({ id: 'objetivo', sev, tone: sev ? 'warn' : 'info', act: sev ? 'reducir' : 'vigilar', title: sev ? 'Dinero del objetivo en bolsa' : 'Objetivo lejano, aún en bolsa', text: `Dices que ${eur(earmark, 0)} de tus inversiones son para tu objetivo, pero solo ${eur(rfV, 0)} están en renta fija: unos <b>${eur(atRisk, 0)}</b> dependen de la bolsa${inGold ? ` o del oro (${eur(inGold, 0)}; el oro ha llegado a caer un 40 %)` : ''}. ${when} ${sev ? `Una caída del 25 % se llevaría ${eur(atRisk * 0.25, 0)} justo cuando los necesites.` : 'Hay margen, pero conviene irlo pasando a renta fija corta según se acerque (a 3 años, ya fuera de la bolsa).'}` });
  } else if (earmark > 0) add({ id: 'objetivo', sev: 0, tone: 'good', act: 'mantener', title: 'El dinero del objetivo está a salvo', text: `Los ${eur(earmark, 0)} que reservas para tu objetivo caben en tu renta fija (${eur(rfV, 0)}).` });
  // 3. cash
  if (P.cash > 0) {
    if (!cu) add({ id: 'colchon', sev: 0, tone: 'info', act: 'vigilar', title: 'Sin colchón definido', text: 'No has fijado un colchón de emergencia (en Efectivo). Sin él no puedo distinguir el efectivo que necesitas del que está ocioso.' });
    else if (cu.cash < cu.amount) add({ id: 'colchon', sev: 1, tone: 'warn', act: 'añadir', title: 'Colchón incompleto', text: `Te faltan ${eur(cu.amount - cu.cash, 0)} para el colchón de ${eur(cu.amount, 0)}. Completarlo va antes que invertir más.` });
    if (cu && idle > Math.max(3000, 0.1 * P.total)) add({ id: 'efectivo', sev: 1, tone: 'info', act: 'vigilar', title: 'Efectivo sin destino', text: `Descontando ${g ? 'tu objetivo y ' : ''}el colchón, quedan ${eur(idle, 0)} en efectivo a una TAE del ${pct(cashRate(), 1)}. Si son para algo concreto (el piso, un coche…), apúntalo en Plan › Objetivo de ahorro y dejaré de contarlos. Si no tienen uso previsto, podrían ir a la parte a largo plazo según tu perfil (de una vez o en varias aportaciones). ${cu.spend ? `El colchón cuenta ${eur(cu.spend, 0)} de gasto al mes: cámbialo en Plan › Colchón si no es tu cifra.` : ''}` });
    else if (g) add({ id: 'efectivo', sev: 0, tone: 'good', act: 'mantener', title: 'Efectivo con propósito', text: `Tus ${eur(P.cash, 0)} de efectivo están reservados para ${cu ? 'el colchón y ' : ''}tu objetivo «${esc(g.name)}»${g.left > 0 ? ` (llevas el ${pct(g.share, 0)}; faltan ${eur(g.left, 0)})` : ''}, así que no los cuento como dinero ocioso. Para un gasto cercano, el efectivo es lo prudente aunque rente poco.` });
  }
  // 4. diversification of the equity part
  if (eqV > 0) {
    if (usW > 0.8) add({ id: 'eeuu', sev: 1, tone: 'warn', act: 'vigilar', title: 'Mucho peso en EE. UU.', text: `Aproximadamente el ${pct(usW, 0)} de tu bolsa son empresas de EE. UU.; en un índice mundial son ≈ 62 %. Es una apuesta por un solo país y una sola divisa (el dólar).` });
    const em = sub.em || 0; if (em > 0.2) add({ id: 'emergentes', sev: 0, tone: 'info', act: 'vigilar', title: 'Emergentes por encima del mundo', text: `Emergentes pesan el ${pct(em, 0)} de tu bolsa, frente a ≈ 11 % en un índice mundial. No es un error, pero sí una apuesta: más volatilidad a cambio de una posible prima.` });
    const conc = (sub.single || 0) + (sub.sector || 0); if (conc > 0.15) add({ id: 'concentrado', sev: 1, tone: 'warn', act: 'reducir', title: 'Acciones sueltas y sectores', text: `Acciones individuales y fondos sectoriales suman el ${pct(conc, 0)} de tu bolsa. Lo habitual en una cartera indexada es que no pasen del 10–15 %.` });
    if (usW <= 0.8 && em <= 0.2 && conc <= 0.15) add({ id: 'diversif', sev: 0, tone: 'good', act: 'mantener', title: 'Bolsa bien repartida', text: `EE. UU. pesa ≈ ${pct(usW, 0)} de tu bolsa (≈ 62 % en el mundo) y no dependes de acciones sueltas ni sectores.` });
  }
  // 5. costs (TER from the asset settings; only when known for most of the money)
  const withTer = open.filter((z) => z.asset.ter != null && z.asset.ter !== '' && Number.isFinite(+z.asset.ter) && z.asset.type !== 'crypto' && z.asset.type !== 'stock');
  const terV = withTer.reduce((s, z) => s + z.value, 0), fundV = val((z) => z.asset.type !== 'crypto' && z.asset.type !== 'stock');
  const ter = terV > 0 ? withTer.reduce((s, z) => s + z.value * +z.asset.ter, 0) / terV / 100 : null;
  if (ter != null && terV >= 0.6 * fundV) {
    const dear = withTer.filter((z) => +z.asset.ter > 0.6).map((z) => z.asset.ticker || z.asset.name);
    if (ter > 0.004 || dear.length) add({ id: 'costes', sev: ter > 0.006 ? 1 : 0, tone: 'warn', act: 'vigilar', title: 'Costes mejorables', text: `Tus fondos cuestan de media un ${pct(ter, 2)} al año${dear.length ? `; los más caros: ${esc(dear.slice(0, 3).join(', '))}` : ''}. Un indexado global cuesta 0,1–0,3 %: la diferencia, a 20 años, se come una parte apreciable del resultado.` });
    else add({ id: 'costes', sev: 0, tone: 'good', act: 'mantener', title: 'Costes bajos', text: `Tus fondos cuestan de media un ${pct(ter, 2)} al año, en línea con la gestión indexada.` });
  }
  // 6. crypto
  if (cryptoW > L.cryptoCap + 0.005) add({ id: 'cripto', sev: L.cryptoCap === 0 ? 2 : 1, tone: 'warn', act: 'reducir', title: L.cryptoCap === 0 ? 'Cripto fuera de tu perfil' : 'Demasiada cripto', text: `Cripto pesa el ${pct(cryptoW, 1)} de tu dinero a largo plazo; para tu perfil${p.crypto === 'no' ? ' (dijiste que no la quieres)' : ''} el tope sería ${pct(L.cryptoCap, 0)}.` });
  else if (!crypto && L.cryptoCap > 0) add({ id: 'cripto', sev: 0, tone: 'info', act: 'vigilar', title: 'Cripto: opcional', text: `No tienes cripto. Tu perfil admitiría hasta un ${pct(L.cryptoCap, 0)}, pero no es necesaria: añade volatilidad y no tiene rentabilidad esperada demostrable.` });
  // 7. market facts (insights/mercado, written weekly by the «Cartera · datos de mercado» task): never change the level, only context
  const M = market();
  if (M) {
    const lt12 = M.rfCorta && +M.rfCorta.pct, tae = cashRate() * 100;
    if (lt12 > 0 && P.cash > 0 && (g || idle > 0) && lt12 - tae >= 0.5) add({ id: 'tipos', sev: 0, tone: 'info', act: 'vigilar', title: 'Tu efectivo podría rentar algo más', text: `Tu efectivo rinde un ${pct(tae / 100, 2)} TAE y las Letras del Tesoro a 12 meses dan un ${pct(lt12 / 100, 2)} (subasta del ${fdate(M.rfCorta.fecha || M.date)}). Para dinero que no necesitas en el próximo año (${g && (yrs == null || yrs > 1) ? 'por ejemplo, parte del objetivo' : 'el efectivo sin destino'}), la deuda pública a corto o un fondo monetario rinden más sin pasar por la bolsa.` });
    const dd = M.bolsa && +M.bolsa.caidaDesdeMaxPct;
    if (dd <= -10) add({ id: 'caida-mercado', sev: 0, tone: 'info', act: 'mantener', title: 'La bolsa está en caída', text: `La bolsa mundial está un ${pct(-dd / 100, 0)} por debajo de su máximo (${esc(M.bolsa.fechaMaximo || '')}). ${-dd / 100 <= L.maxDD ? `Entra en lo que dijiste que aguantas (${pct(L.maxDD, 0)}): es el momento de seguir tu plan, no de cambiarlo.` : `Ya supera lo que dijiste que aguantas (${pct(L.maxDD, 0)}). Vender ahora fijaría la pérdida; si te quita el sueño, revisa tu perfil con calma y ajusta con las aportaciones, no con ventas.`}` });
  }
  // 8. complexity
  const small = open.filter((z) => z.value / inv < 0.03).length;
  if (open.length > (p.simple === 'few' ? 4 : 7) || small >= 2) add({ id: 'complejidad', sev: p.simple === 'few' ? 1 : 0, tone: 'info', act: 'vigilar', title: 'Muchos productos', text: `Tienes ${open.length} posiciones${small ? `, ${small} por debajo del 3 %` : ''}. ${p.simple === 'few' ? 'Prefieres pocos productos: ' : ''}con 2–4 fondos se cubre una cartera global completa.` });
  const sev = out.reduce((m, r) => Math.max(m, r.sev), 0);
  return { M, p, L, inv, def, rfV, risk, crypto, earmark, atRisk, lt, riskW, riskWAll, idle, crisis, yrs, ter, cryptoW, usW, sub, rules: out, verdict: sev >= 2 ? 'revisar' : sev === 1 ? 'ajustar' : 'mantener' };
}

/* ----- view ----- */
function aiModeSeg() {
  const m = ui.aiMode || 'obs';
  return `<div class="seg" role="group" aria-label="Qué ver">${[['obs', 'Observaciones'], ['analista', 'Mi analista']].map(([k, l]) => `<button type="button" data-aimode="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>`;
}
function bandBar(label, w, lo, hi, sub) {
  const x = (v) => (Math.max(0, Math.min(1, v)) * 100).toFixed(1); const inBand = w >= lo - 0.005 && w <= hi + 0.005;
  return `<div class="an-bar"><div class="an-bl"><span>${label}</span><span class="num ${inBand ? '' : 'loss noarr'}">${pct(w, 0)} <small class="muted">· perfil ${pct(lo, 0)}–${pct(hi, 0)}</small></span></div>
    <div class="an-track" role="img" aria-label="${esc(label)}: ${pct(w, 0)}; horquilla de tu perfil ${pct(lo, 0)} a ${pct(hi, 0)}"><span class="an-band" style="left:${x(lo)}%;width:${(x(hi) - x(lo)).toFixed(1)}%"></span><span class="an-fill${inBand ? '' : ' out'}" style="width:${x(w)}%"></span></div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
}
function analystView() {
  if (DEMO) return '<p class="muted">Disponible con tu cartera, no con la de ejemplo.</p>';
  const p = profile();
  if (!p) return `<div class="an-cta"><div><h3>Primero, tu perfil</h3><p class="small muted">Nueve preguntas rápidas (horizonte, cómo llevas las caídas, ingresos, preferencias). Con ellas comparo tu cartera con lo que encaja contigo y Claude te da su veredicto: mantener, ajustar o revisar.</p></div><button class="btn primary" type="button" data-act="profile-edit">Hacer el cuestionario</button></div>`;
  const A = analystRules(); if (!A) return '<p class="muted">Añade tus inversiones primero.</p>';
  const L = A.L; const ai = S.analista; const v = AN_VERDICT[A.verdict];
  const stale = ai && ai.date && (ai.profileDate !== p.date || Math.abs((ai.riskW ?? A.riskW) - A.riskW) > 0.03);
  const limit = L.by === 'capacidad' ? ' Lo limita tu horizonte o tus ingresos, no tu tolerancia.' : L.by === 'tolerancia' ? ' Lo limita cómo llevas las caídas, no tu plazo.' : '';
  const old = (p.v || 1) < PF_VER ? 'El cuestionario ha cambiado (plazo y caída máxima): revisa tu perfil.' : todayStr() > E.addMonths(p.date, 12) ? 'Tu perfil tiene más de un año: revísalo por si ha cambiado tu situación.' : '';
  return `<div class="an-head"><div><span class="chip">${L.name} · ${L.lv} de 5</span> <span class="small muted">perfil del ${fdate(p.date)}.${limit}</span></div><button class="btn ghost small" type="button" data-act="profile-edit">Editar perfil</button></div>
  ${old ? `<p class="small warn-t" style="margin:0 0 10px">${old}</p>` : ''}
  <div class="an-verdict ${v[1]}"><span class="k">Diagnóstico por reglas</span><b>${v[0]}${(() => { const top = A.verdict !== 'mantener' && A.rules.filter((x) => x.sev > 0).sort((x, y) => y.sev - x.sev)[0]; return top ? `: ${esc(top.title.charAt(0).toLowerCase() + top.title.slice(1))}` : ''; })()}</b></div>
  <div class="an-bars"><div class="an-legend"><span><i style="background:color-mix(in srgb,var(--ink) 45%,transparent)"></i>tu cartera</span><span><i style="border:2px solid var(--gain);box-sizing:border-box"></i>horquilla de tu perfil</span></div>${bandBar('Activos de riesgo (bolsa, cripto…)', A.riskW, L.lo, L.hi, A.earmark ? `sobre tu dinero a largo plazo: ${eur(A.lt, 0)}, sin los ${eur(A.earmark, 0)} reservados para tu objetivo` : `sobre tus inversiones: ${eur(A.lt, 0)}; el efectivo va aparte`)}${A.crypto || L.cryptoCap ? bandBar('Cripto', A.cryptoW, 0, L.cryptoCap) : ''}</div>
  ${marketHtml(A.M)}
  <div class="ins-grid">${A.rules.slice().sort((a, b) => b.sev - a.sev).map((r) => insightCard({ tone: r.tone, title: `${esc(r.title)} <span class="chip an-act">${AN_ACT[r.act]}</span>`, text: r.text })).join('')}</div>
  <div class="an-ai"><div class="panel-h"><h3>La opinión de Claude</h3><div class="toolbar">${ai && ai.date ? `<span class="small muted">${new Date(ai.date).toLocaleString(L_, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}<button class="btn primary" type="button" data-act="ai-analyst" ${sampleFn ? '' : 'disabled title="No disponible en esta vista"'}>${ai && ai.items ? 'Volver a pedir' : 'Pedir veredicto a Claude'}</button></div></div>
    <div id="anBox">${ai && ai.items ? analystAiHtml(ai, stale, A.verdict) : '<p class="muted small">Claude lee tu perfil, este diagnóstico y tus datos, y te dice qué haría: mantener, añadir o reducir algo, y qué no haría.</p>'}</div></div>
  <p class="note">Orientación generada por reglas y por IA a partir de tus datos. No es asesoramiento financiero personalizado ni regulado (en España eso requiere autorización de la CNMV), usa los datos de mercado solo como contexto, sin predicciones, y nunca recomienda productos concretos. Las decisiones son tuyas.</p>`;
}
const L_ = 'es-ES';
function analystAiHtml(ai, stale, rulesVerdict) {
  const v = AN_VERDICT[ai.verdict] || AN_VERDICT.ajustar;
  const rv = stale ? null : ai.rulesVerdict || rulesVerdict; const d = rv ? (AN_RANK[ai.verdict] ?? 1) - (AN_RANK[rv] ?? 1) : 0;
  const diff = d < 0 ? 'Claude es más optimista que el diagnóstico por reglas; su motivo está en el resumen.' : d > 0 ? 'Claude es más exigente que el diagnóstico por reglas.' : '';
  return `${stale ? '<p class="small warn-t">Tu perfil o tu cartera han cambiado desde este veredicto; pídelo de nuevo.</p>' : ''}${diff ? `<p class="small muted" style="margin:0 0 6px">${diff}</p>` : ''}
  <div class="an-verdict ${v[1]}"><span class="k">Veredicto de Claude</span><b>${v[0]}</b><p>${esc(ai.summary || '')}</p></div>
  <div class="ins-grid">${ai.items.map((i) => insightCard({ tone: i.action === 'reducir' ? 'warn' : i.action === 'mantener' ? 'good' : 'info', title: `${esc(i.title)} <span class="chip an-act">${AN_ACT[i.action] || 'Vigilar'}</span>`, text: esc(i.text) })).join('')}</div>
  ${ai.notDo && ai.notDo.length ? `<details class="an-not" open><summary>Lo que no haría</summary><ul>${ai.notDo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}`;
}

/* ----- questionnaire ----- */
function openProfileForm() {
  if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
  const p = profile() || {}; const inv = res ? res.totals.value : 0;
  openModal(`<div class="panel-h"><h2>Tu perfil de inversor</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form pf-form" id="pfForm" novalidate>
    ${PF_Q.map(([k, q, opts]) => `<fieldset class="full pf-q"><legend>${q}</legend>${opts.map(([v, l]) => `<label class="pf-opt"><input type="radio" name="pf_${k}" value="${v}" ${String(p[k]) === v ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>`).join('')}
    <label class="f full">De lo que tienes invertido, ¿cuánto piensas usar para tu objetivo (por ejemplo el piso)? <span class="hint">en euros; 0 si no tocarás las inversiones${inv ? ` · hoy tienes ${eur(inv, 0)} invertidos` : ''}</span><input type="text" inputmode="decimal" id="pfGoal" value="${p.goalInvested != null ? esc(String(p.goalInvested).replace('.', ',')) : '0'}"></label>
    <p class="note full">Se guarda en tus ajustes y solo sirve para orientar el análisis. Puedes cambiarlo cuando quieras.</p>
    <div class="err full" id="pfErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar perfil</button></div>
  </form>`, () => {
    $('#pfForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const np = { v: PF_VER, date: todayStr() }; const miss = [];
      for (const [k, q] of PF_Q) { const el = document.querySelector(`input[name="pf_${k}"]:checked`); if (el) np[k] = el.value; else miss.push(q); }
      if (miss.length) return ($('#pfErr').textContent = `Falta${miss.length > 1 ? 'n' : ''} ${miss.length} pregunta${miss.length > 1 ? 's' : ''}: «${miss[0]}»`);
      const gi = $('#pfGoal').value.trim() ? parseNum($('#pfGoal').value) : 0;
      if (!Number.isFinite(gi) || gi < 0) return ($('#pfErr').textContent = 'Indica un importe de 0 o más.');
      np.goalInvested = +gi.toFixed(2);
      try { await saveSettings({ profile: np }); closeModal(); ui.aiMode = 'analista'; toast(`Perfil guardado: ${profileLevel(np).name.toLowerCase()}.`); render(); }
      catch (e) { $('#pfErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); }
    });
  });
}

/* ----- Claude ----- */
async function runAiAnalyst() {
  if (!sampleFn) return toast('Claude no está disponible en esta vista.');
  const A = analystRules(); if (!A) return toast('Haz primero el cuestionario de perfil.');
  const box = $('#anBox'); const btn = $('[data-act="ai-analyst"]'); if (btn) { btn.disabled = true; btn.textContent = 'Pensando…'; }
  if (box) box.innerHTML = `<div class="m-skel" aria-busy="true"><p class="muted small" style="margin:0 0 6px">Claude está estudiando tu cartera con tu perfil…</p><div class="ins sk"><span class="m-sk" style="width:55%;height:13px"></span><span class="m-sk"></span><span class="m-sk" style="width:70%"></span></div></div>`;
  const qa = Object.fromEntries(PF_Q.map(([k, q, opts]) => [q, (opts.find((o) => o[0] === String(A.p[k])) || [])[1] || null]));
  const r2 = (v) => Math.round(v * 1000) / 10;
  const diag = { nivel: `${A.L.lv} de 5 (${A.L.name})`, limitadoPor: A.L.by, horquillaRiesgoPct: [r2(A.L.lo), r2(A.L.hi)], topeCriptoPct: r2(A.L.cryptoCap),
    riesgoActualPct: r2(A.riskW), criptoActualPct: r2(A.cryptoW), inversionesReservadasObjetivo: Math.round(A.earmark), objetivoFueraDeRentaFija: Math.round(A.atRisk), añosHastaObjetivo: A.yrs == null ? null : Math.round(A.yrs * 10) / 10, dineroLargoPlazo: Math.round(A.lt),
    efectivoSinDestino: Math.round(A.idle), riesgoContandoEfectivoSinDestinoPct: A.idle > 0 ? r2(A.riskWAll) : undefined,
    caidaEnCrisisEstimadaPct: r2(A.crisis), caidaMaxQueAguantaPct: r2(A.L.maxDD), supuestosCrisis: 'como 2008-09: bolsa -50 %, cripto -75 %, oro -10 %, renta fija -5 %',
    terMedioFondosPct: A.ter == null ? undefined : Math.round(A.ter * 10000) / 100, respuestasIncoherentes: A.L.incoherent || undefined,
    eeuuEnBolsaPct: r2(A.usW), bolsaPorTipoPct: Object.fromEntries(Object.entries(A.sub).map(([k, w]) => [SUBS[k] ? SUBS[k][0] : k, r2(w)])),
    veredictoReglas: A.verdict, hallazgos: A.rules.map((x) => ({ tema: x.title, accion: x.act, gravedad: x.sev, detalle: x.text.replace(/<[^>]+>/g, '') })) };
  const eff = efficiency(); const g = goalInfo(); const cu = cushionInfo();
  const extra = { eficiencia: eff ? { nota: eff.score, rentabilidadEsperadaPct: r2(eff.me.mu), volatilidadEsperadaPct: r2(eff.me.vol), nota_: 'nota 0-100 de la relación rentabilidad/riesgo esperada de la parte invertida frente a la mejor combinación de sus mismos bloques' } : undefined,
    objetivoAhorro: g ? { nombre: g.name, importe: Math.round(g.amount), fecha: g.date, efectivoQueCuenta: Math.round(g.cash), falta: Math.round(g.left) } : null,
    colchon: cu ? { importe: Math.round(cu.amount), cubierto: Math.round(cu.covered) } : null,
    costes: assetList().filter((a) => a.ter != null && a.ter !== '').map((a) => ({ activo: a.ticker || a.name, terPct: +a.ter })) };
  const prompt = `Eres el analista de cartera de un inversor particular residente en España. Escribe en español de España, claro y directo, tuteando. Te paso su perfil (sus respuestas), un DIAGNÓSTICO hecho con reglas fijas y sus datos. Tu trabajo: decir si mantendrías la cartera tal cual o qué ajustarías, razonándolo para SU perfil.
Devuelve SOLO un JSON: {"verdict":"mantener|ajustar|revisar","summary":"…","items":[{"action":"mantener|añadir|reducir|vigilar","title":"…","text":"…"}],"notDo":["…"]}
- "summary": 1-2 frases (máx. 45 palabras) con tu veredicto y el motivo principal.
- "items": de 1 a 4 recomendaciones, de la más a la menos importante. Título de 2 a 6 palabras; "text" máx. 60 palabras, con cifras de los datos y el porqué para su perfil. Si lo correcto es no tocar nada, un único item "mantener" que lo explique es una respuesta perfecta.
- "notDo": 2 a 4 frases cortas con ideas que has considerado y NO recomiendas para él, con el motivo (p. ej. añadir bitcoin, un fondo de gestión activa, oro, más fondos, vender para recolocar).
Reglas:
0) Prioridades, en este orden: colchón de emergencia → dinero del objetivo fuera de la bolsa → nivel de riesgo (incluida la caída en una crisis frente a la que dice aguantar) → diversificación → costes → sencillez. No propongas algo de un nivel si queda pendiente uno anterior más grave.
1) Por defecto, no tocar. Propón un cambio solo si hay un hallazgo de las reglas o un motivo claro ligado a su perfil. Tu "verdict" no puede ser más suave que "veredictoReglas" salvo que lo justifiques en "summary".
2) Respeta las cifras del diagnóstico; no las recalcules ni las contradigas.
3) Habla de tipos de activo, no de productos: «un fondo indexado de renta fija euro a corto plazo», nunca un nombre comercial, ISIN o gestora.
4) Evalúa expresamente estas ideas y ponlas en "items" (si encajan) o en "notDo" (si no): añadir cripto, añadir un fondo de gestión activa, añadir renta fija u oro, simplificar. Sé escéptico con la gestión activa: la mayoría de fondos activos rinde menos que su índice tras comisiones a largo plazo; solo tendría sentido en nichos y con costes bajos.
5) Para mover dinero en España: mejor dirigir las nuevas aportaciones o hacer traspasos entre fondos (no tributan) que vender; los ETF y las acciones sí tributan al vender. El dinero para un gasto cercano (el objetivo de ahorro) no debe estar en bolsa ni en oro; a menos de 3 años, solo efectivo o renta fija corta. Si hay "efectivoSinDestino" y el riesgo está alto, la solución es dar uso a ese efectivo (renta fija o aportaciones), no vender bolsa.
6) MERCADO son hechos recientes con fecha (tipos, Letras, inflación, caída de la bolsa desde máximos, valoración de EE. UU.), o null. Úsalos SOLO para: (a) comparar dónde rinde más el dinero seguro (efectivo frente a Letras o monetarios); (b) poner en contexto una caída y recordar su plan; (c) explicar por qué diversificar si EE. UU. está caro frente a su historia. Nunca para predecir, ni para cambiar su nivel de riesgo, ni para recomendar entrar, salir o esperar. Si MERCADO es null, no hables de la coyuntura. No inventes datos.
7) "pesoPct" en posiciones es sobre las inversiones (sin efectivo). El efectivo tiene su propio papel (colchón y objetivo).
8) El perfil son respuestas del propio inversor. Si "respuestasIncoherentes" existe, dilo en "summary" y no fuerces cambios grandes hasta que revise el cuestionario.
PERFIL (respuestas): ${JSON.stringify(qa)}
DIAGNÓSTICO: ${JSON.stringify(diag)}
CONTEXTO: ${JSON.stringify(extra)}
MERCADO: ${JSON.stringify(A.M ? { fecha: A.M.date, bce: A.M.bce, letras12m: A.M.rfCorta, inflacionEspaña: A.M.inflacion, bolsaMundial: A.M.bolsa, capeEEUU: A.M.cape } : null)}
DATOS DE LA CARTERA: ${JSON.stringify(portfolioDigest())}`;
  try {
    const r = await sampleFn.json(prompt, { modelTier: 'default', cache: false });
    const acts = Object.keys(AN_ACT);
    const items = (r && Array.isArray(r.items) ? r.items : []).slice(0, 4).map((i) => ({ action: acts.includes(i.action) ? i.action : 'vigilar', title: String(i.title || '').slice(0, 80), text: String(i.text || '').slice(0, 600) })).filter((i) => i.title || i.text);
    if (!items.length) throw { code: 'invalid_json', message: 'Respuesta vacía' };
    const doc = { date: new Date().toISOString(), verdict: AN_VERDICT[r.verdict] ? r.verdict : A.verdict, summary: String(r.summary || '').slice(0, 400), items,
      notDo: (Array.isArray(r.notDo) ? r.notDo : []).slice(0, 5).map((x) => String(x).slice(0, 300)), profileDate: A.p.date, riskW: A.riskW, rulesVerdict: A.verdict };
    if (db && !DEMO) await db.doc('insights/analista').set(doc); else { S.analista = doc; render(); }
  } catch (e) {
    const msg = { not_granted: 'No has dado permiso para preguntar a Claude desde esta página.', rate_limited: 'Demasiadas peticiones seguidas; prueba en un rato.', invalid_json: 'Claude no devolvió un formato válido; vuelve a intentarlo.' }[e && e.code] || ('No se pudo completar: ' + ((e && e.message) || e));
    const b2 = $('#anBox'); if (b2) b2.innerHTML = `<p class="err">${esc(msg)}</p>`;
  } finally { const b = $('[data-act="ai-analyst"]'); if (b) { b.disabled = false; b.textContent = 'Volver a pedir'; } }
}
