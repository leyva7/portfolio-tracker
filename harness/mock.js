// In-memory mock of the artifact runtime (window.claude). Seed via window.__SEED (collections -> {docId: data}).
(function(){
  const seed = window.__SEED || {};
  const store = {}; // "col/id" -> data
  for (const [c, docs] of Object.entries(seed)) for (const [id, d] of Object.entries(docs)) store[c + '/' + id] = JSON.parse(JSON.stringify(d));
  window.__STORE = store; window.__WRITES = [];
  const subsC = {}, subsD = {};
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const deep = (a, b) => { const o = Object.assign({}, a); for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = deep(o[k], v); else o[k] = v; } return o; };
  const snapDoc = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => (p in store ? clone(store[p]) : undefined) });
  const snapCol = (c) => ({ docs: Object.keys(store).filter((k) => k.startsWith(c + '/') && k.split('/').length === 2).map(snapDoc) });
  const notify = (p) => { const c = p.split('/')[0]; setTimeout(() => { (subsC[c] || []).forEach((f) => f(snapCol(c))); (subsD[p] || []).forEach((f) => f(snapDoc(p))); }, 5); };
  const docRef = (p) => ({
    set: async (d) => { store[p] = clone(d); window.__WRITES.push(['set', p]); notify(p); },
    update: async (d) => { if (!(p in store)) { const e = new Error('not found'); e.code = 'not_found'; throw e; } store[p] = deep(store[p], clone(d)); window.__WRITES.push(['update', p]); notify(p); },
    delete: async () => { delete store[p]; window.__WRITES.push(['delete', p]); notify(p); },
    get: async () => snapDoc(p),
    onSnapshot: (f, err) => { (subsD[p] = subsD[p] || []).push(f); setTimeout(() => f(snapDoc(p)), 5); return () => {}; },
  });
  const db = {
    collection: (c) => ({ doc: (id) => docRef(c + '/' + id), onSnapshot: (f, err) => { (subsC[c] = subsC[c] || []).push(f); setTimeout(() => f(snapCol(c)), 5); return () => {}; } }),
    doc: (p) => docRef(p),
  };
  const sample = { json: async (prompt) => { window.__LAST_PROMPT = prompt; await new Promise(r => setTimeout(r, 300)); if (prompt.includes('portfolio analyst')) return { verdict: 'keep', summary: 'Simulated answer (test mock, not the real Claude): the portfolio fits your profile.', items: [{ action: 'keep', title: 'Carry on as you are', text: 'Simulated text.' }, { action: 'odd', title: 'Unknown action', text: 'Should be shown as Watch.' }], notDo: ['I would not add bitcoin: simulated text.', 'I would not add active management: simulated text.'] }; return { insights: [
    { title: 'Test observation', text: 'Simulated analysis text (test mock, not the real Claude).', tone: 'info' },
    { title: 'High concentration', text: 'The three largest positions weigh more than 70 %.', tone: 'warn' },
    { title: 'Regular contributions', text: 'You invest almost every month, a good habit.', tone: 'good' } ] }; } };
  const mcp = { listTools: async () => ({ servers: [{ server: 'Alpha Vantage MCP Server' }, { server: 'Claude Code Remote' }] }),
    callTool: async (server, tool, input) => { window.__MCP = (window.__MCP || []).concat([[server, tool, input]]); if (tool === 'fire_trigger') return { content: [{ type: 'text', text: '{"ok":true}' }] }; const e = new Error('mock: sin red'); e.code = 'upstream_error'; throw e; } };
  const downloads = { save: async ({ filename, data }) => { window.__DOWNLOADS = (window.__DOWNLOADS || []).concat([{ filename, size: String(data).length }]); return 'saved'; } };
  const permissions = { state: async () => 'granted', request: async (l) => Object.fromEntries(l.map((x) => [x, 'granted'])) };
  const caps = { db, sample, mcp, downloads, permissions };
  window.claude = { use: async (n) => { if (window.__NOCAP && window.__NOCAP.includes(n)) throw Object.assign(new Error('no'), { code: 'unavailable' }); return caps[n]; } };
})();
