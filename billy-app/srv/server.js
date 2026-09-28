const cds = require('@sap/cds');

// Un'action CDS restituisce un JSON unico e non può streammare: la
// variante in streaming di askBilly vive quindi come rotta express
// registrata sull'hook di bootstrap di CAP. Entrambe chiamano lo stesso
// motore agentico — askBilly resta non-streaming perché è anche un tool
// MCP (Fase 7) e un tool MCP deve restituire un risultato.
const SSE_PATH = '/rest/billy/askBillyStream';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// ─────────────────────────────────────────────── motore agentico ──
// Quale motore risponde lo decide srv/lib/engine.js dal flag BILLY_ENGINE
// (`graph`, default = LangGraph; `legacy` = tool loop storico). I due
// espongono la stessa firma runAgent({question, history, onEvent, signal})
// e lo stesso contratto di eventi (API-CONTRACT.md §1.2): da qui in giù la
// rotta è identica e il motore non si vede.
//
// Attorno alla selezione c'è una rete di sicurezza, perché questa rotta
// deve continuare a rispondere anche se il motore preferito non carica:
// si ricade su ./lib/agent invece di restituire un 500 a ogni domanda. Il
// caricamento è pigro (alla prima richiesta, non al require del file), così
// un problema del grafo non impedisce al server di partire.
async function loadModule(specifier) {
  try {
    return require(specifier);
  } catch (e) {
    // `@sap-ai-sdk/*` e parte dell'ecosistema LangChain sono ESM-only
    // mentre il progetto è CommonJS: se require() rifiuta il modulo si
    // passa a import() dinamico, con il path convertito in URL perché su
    // Windows un path assoluto (C:\...) non è un identificatore valido.
    if (e.code !== 'ERR_REQUIRE_ESM') throw e;
    const { pathToFileURL } = require('node:url');
    return await import(pathToFileURL(require.resolve(specifier)).href);
  }
}

function pickRunAgent(mod) {
  const fn = mod?.runAgent || mod?.default?.runAgent;
  return typeof fn === 'function' ? fn : null;
}

let engineLogged = null;

async function getRunAgent() {
  let wanted = 'graph';
  try {
    const { selectEngine, engineName } = require('./lib/engine');
    wanted = engineName();
    const runAgent = pickRunAgent(selectEngine());
    if (runAgent) {
      if (engineLogged !== wanted) { engineLogged = wanted; console.log(`[billy] motore agentico: ${wanted}`); }
      return runAgent;
    }
    console.warn(`[billy] il motore "${wanted}" non espone runAgent: fallback su ./lib/agent`);
  } catch (e) {
    console.warn(`[billy] motore "${wanted}" non caricabile, fallback su ./lib/agent:`, e.message);
  }
  const runAgent = pickRunAgent(await loadModule('./lib/agent'));
  if (!runAgent) throw new Error('Nessun motore agentico disponibile');
  if (engineLogged !== 'fallback') { engineLogged = 'fallback'; console.warn('[billy] motore agentico: legacy (fallback)'); }
  return runAgent;
}

// Il body parser di CAP è montato dagli adapter di protocollo sui path dei
// servizi, non globalmente: una rotta registrata al bootstrap non lo
// eredita. Il body si legge quindi a mano, senza aggiungere middleware
// (e senza dipendere da un `express` che non è una dipendenza dichiarata).
function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body troppo grande'));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(parts).toString('utf-8').trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Body JSON non valido')); }
    });
  });
}

cds.on('bootstrap', (app) => {
  app.post(SSE_PATH, async (req, res) => {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      res.status(400).json({ error: { message: e.message } });
      return;
    }

    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) {
      res.status(400).json({ error: { message: 'Parametro "question" mancante' } });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Davanti a billy-srv su CF c'è un reverse proxy: senza questo
      // header gli eventi arriverebbero bufferizzati in blocco alla fine,
      // cioè esattamente quello che lo streaming deve evitare.
      'X-Accel-Buffering': 'no'
    });
    // Commento SSE iniziale: apre subito la connessione lato client senza
    // aspettare il primo evento reale.
    res.write(': ok\n\n');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const controller = new AbortController();
    let closed = false;
    req.on('close', () => {
      closed = true;
      controller.abort();
    });

    const send = (event) => {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const runAgent = await getRunAgent();
      await runAgent({
        question,
        history: body.history,
        signal: controller.signal,
        onEvent: send
      });
    } catch (e) {
      console.error('askBillyStream fallita:', e);
      // Errore a metà stream: va comunicato come evento, non lasciando la
      // connessione appesa finché il client va in timeout.
      send({ type: 'error', message: e.message || 'Errore interno' });
    } finally {
      if (!closed && !res.writableEnded) res.end();
    }
  });
});

module.exports = cds.server;
