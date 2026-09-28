#!/usr/bin/env node
/**
 * Banco di prova del routing delle skill di Billy — 35 casi.
 *
 * Rigioca i 35 casi di `cases-35.json` contro un'istanza di Billy (CF o
 * locale), misura quale skill è stata caricata per ogni caso, stampa il
 * punteggio e lo confronta con la baseline (27/35, doc/V1/causa-a-fix.md),
 * evidenziando le REGRESSIONI.
 *
 * Nessuna dipendenza: solo Node >= 22 (fetch, AbortSignal.timeout).
 *
 *   node test/run-35.js --base https://<host>
 *   node test/run-35.js --base http://localhost:4004 --mode rest --only 1-5
 *
 * Misura (in ordine di precisione):
 *  - `--mode sse` (default): POST /rest/billy/askBillyStream, si contano gli
 *    eventi {"type":"tool","name":"loadSkill","args":{"skillId":"<uuid>"}}.
 *    Gli UUID sono risolti in titoli via GET /rest/catalog/Asset.
 *  - `--mode rest`: POST /rest/billy/askBilly, si guardano le `sources`:
 *    similarity === null significa skill, un numero significa documento.
 *    Meno preciso — una skill caricata ma non citata non compare.
 *
 * Esce con codice 1 se c'è almeno una regressione rispetto alla baseline.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ────────────────────────────────────────────────────────── argomenti ──

const DEFAULTS = {
  base: process.env.BILLY_BASE_URL || '',
  mode: 'sse',
  timeout: 150000,   // una domanda richiede 20-60s; qui c'è margine per 5 giri di tool
  retries: 3,        // il DNS verso CF da qui è intermittente: senza retry si misura la rete
  delay: 1500,       // sequenziale e con pausa: in parallelo il modello va in throttling
  minAnswer: 40,     // sotto questa lunghezza la risposta è considerata vuota → retry
  only: null,
  out: null,
  quiet: false
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`Manca il valore per ${a}`);
      return v;
    };
    switch (a) {
      case '--base': case '-b': opts.base = next(); break;
      case '--mode': case '-m': opts.mode = next().toLowerCase(); break;
      case '--timeout': opts.timeout = Number(next()); break;
      case '--retries': opts.retries = Number(next()); break;
      case '--delay': opts.delay = Number(next()); break;
      case '--min-answer': opts.minAnswer = Number(next()); break;
      case '--only': opts.only = parseOnly(next()); break;
      case '--out': case '-o': opts.out = next(); break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default: fail(`Argomento sconosciuto: ${a}`);
    }
  }
  if (!opts.base) fail('Serve --base <url> (oppure la variabile BILLY_BASE_URL)');
  if (!['sse', 'rest'].includes(opts.mode)) fail('--mode accetta solo "sse" o "rest"');
  opts.base = opts.base.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(opts.base)) opts.base = `https://${opts.base}`;
  return opts;
}

// "1,4,7-9" → Set{1,4,7,8,9}
function parseOnly(spec) {
  const ids = new Set();
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) fail(`--only: intervallo non valido "${part}"`);
    const from = Number(m[1]);
    const to = Number(m[2] || m[1]);
    for (let i = from; i <= to; i++) ids.add(i);
  }
  return ids;
}

function usage() {
  console.log(`
Banco dei 35 casi di routing skill di Billy.

  node test/run-35.js --base <url> [opzioni]

  --base, -b <url>     host di Billy (CF o http://localhost:4004). Obbligatorio.
  --mode, -m sse|rest  come si misura la skill caricata (default: sse, più preciso)
  --only <1,4,7-9>     esegue solo i casi indicati
  --timeout <ms>       timeout per tentativo (default ${DEFAULTS.timeout})
  --retries <n>        ritentativi su errore/risposta vuota (default ${DEFAULTS.retries})
  --delay <ms>         pausa fra un caso e il successivo (default ${DEFAULTS.delay})
  --min-answer <n>     lunghezza minima perché una risposta non sia "vuota" (default ${DEFAULTS.minAnswer})
  --out, -o <file>     salva il JSON completo (risposte integrali incluse)
  --quiet, -q          niente riga di avanzamento, solo il riepilogo finale

Esce con 1 se c'è almeno una regressione rispetto alla baseline.
`.trim());
}

function fail(msg) {
  console.error(`errore: ${msg}\n`);
  usage();
  process.exit(2);
}

// ────────────────────────────────────────────────── match sulle skill ──

// Minuscole + accenti via, spazi collassati. La punteggiatura resta: serve
// per titoli tipo "Modello P&L" e "Logiche_Calcolo".
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function patternsFor(token, groups) {
  const g = groups[token];
  return (g ? g : [token]).map((p) => new RegExp(p, 'i'));
}

function matchesAny(text, tokens, groups) {
  const t = norm(text);
  return (tokens || []).some((tok) => patternsFor(tok, groups).some((re) => re.test(t)));
}

// ─────────────────────────────────────────────────────────── trasporto ──

async function fetchSkillCatalog(base, timeout) {
  const url = `${base}/rest/catalog/Asset`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /rest/catalog/Asset → HTTP ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : (body.value || body.d?.results || []);
  const byId = new Map();
  for (const r of rows) if (r && r.ID) byId.set(String(r.ID).toLowerCase(), { title: r.title, type: r.type });
  return byId;
}

/** POST /rest/billy/askBillyStream e ricostruisce gli eventi SSE. */
async function askStream(base, question, timeout) {
  const res = await fetch(`${base}/rest/billy/askBillyStream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(timeout)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} su askBillyStream: ${(await res.text()).slice(0, 200)}`);
  if (!res.body) throw new Error('Risposta SSE senza body');

  const decoder = new TextDecoder();
  const events = [];
  let buf = '';
  let answer = '';
  let delta = '';
  let sources = [];
  let streamError = null;

  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let sep;
    // I frame SSE sono separati da una riga vuota (\n\n o \r\n\r\n).
    while ((sep = buf.search(/\r?\n\r?\n/)) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + buf.slice(sep).match(/^\r?\n\r?\n/)[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (!data) continue; // commento SSE di keep-alive (": ok")
      let ev;
      try { ev = JSON.parse(data); } catch { continue; }
      events.push(ev);
      if (ev.type === 'delta' && typeof ev.text === 'string') delta += ev.text;
      if (ev.type === 'answer') {
        if (typeof ev.answer === 'string') answer = ev.answer;
        if (Array.isArray(ev.sources)) sources = ev.sources;
      }
      if (ev.type === 'error') streamError = ev.message || 'errore nello stream';
    }
  }
  if (streamError) throw new Error(`Evento error dallo stream: ${streamError}`);
  return { answer: answer || delta, sources, events };
}

/** POST /rest/billy/askBilly (action CDS, non-streaming). */
async function askRest(base, question, timeout) {
  const res = await fetch(`${base}/rest/billy/askBilly`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(timeout)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} su askBilly: ${text.slice(0, 200)}`);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error('Risposta non JSON da askBilly'); }
  const payload = body.value ?? body.d ?? body;
  return { answer: payload.answer || '', sources: payload.sources || [], events: [] };
}

// ─────────────────────────────────────────────────── esecuzione caso ──

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCase(kase, opts, catalog) {
  const attempts = [];
  for (let attempt = 1; attempt <= opts.retries + 1; attempt++) {
    const started = Date.now();
    try {
      const raw = opts.mode === 'sse'
        ? await askStream(opts.base, kase.question, opts.timeout)
        : await askRest(opts.base, kase.question, opts.timeout);
      const ms = Date.now() - started;
      const answer = (raw.answer || '').trim();
      // Risposta vuota = quasi sempre rete/DNS, non il sistema: si ritenta,
      // altrimenti la misura viene inquinata da errori di trasporto.
      if (answer.length < opts.minAnswer) {
        const why = `risposta vuota o troppo corta (${answer.length} caratteri)`;
        attempts.push({ attempt, ms, error: why });
        if (attempt <= opts.retries) { await sleep(2000 * attempt); continue; }
        // Esauriti i tentativi con una risposta vuota: è quasi sempre
        // trasporto, non routing. Va segnato come NON MISURATO, non come
        // fallimento — un errore di rete non deve entrare nel punteggio.
        return { ok: false, answer, sources: raw.sources, events: raw.events, ms, attempts, tries: attempt, error: why };
      }
      return { ok: true, answer, sources: raw.sources, events: raw.events, ms, attempts, tries: attempt };
    } catch (e) {
      const ms = Date.now() - started;
      attempts.push({ attempt, ms, error: e.message });
      if (attempt <= opts.retries) { await sleep(2000 * attempt); continue; }
      return { ok: false, answer: '', sources: [], events: [], ms, attempts, tries: attempt, error: e.message };
    }
  }
  return { ok: false, answer: '', sources: [], events: [], attempts, error: 'esauriti i tentativi' };
}

/** Quali skill sono state caricate, come titoli leggibili. */
function extractLoadedSkills(run, catalog) {
  const found = new Map(); // chiave normalizzata → { label, via }

  for (const ev of run.events) {
    if (ev.type !== 'tool' || ev.name !== 'loadSkill') continue;
    const id = String(ev.args?.skillId || '').toLowerCase();
    const hit = catalog?.get(id);
    const label = hit?.title || (id ? `skill sconosciuta (${id.slice(0, 8)}…)` : 'skill senza id');
    found.set(norm(label), { label, via: 'loadSkill' });
  }

  // `similarity: null` in sources = skill (un numero = documento).
  for (const s of run.sources || []) {
    if (s && (s.similarity === null || s.similarity === undefined)) {
      const label = s.title || `asset ${String(s.assetId || '').slice(0, 8)}…`;
      if (!found.has(norm(label))) found.set(norm(label), { label, via: 'sources' });
    }
  }
  return [...found.values()];
}

function judge(kase, loaded, answer, groups) {
  const labels = loaded.map((l) => l.label);

  if (kase.expect === 'none') {
    const offenders = labels.filter((l) => !matchesAny(l, kase.tolerate || [], groups));
    if (offenders.length) {
      return { verdict: 'KO', kind: 'SPURIA', why: `skill caricata quando non serviva: ${offenders.join(', ')}` };
    }
    // Criterio testuale (solo caso 10): senza skill la misura non basta.
    if (kase.answerMustMatch && kase.answerMustMatch.length) {
      const a = norm(answer);
      const ok = kase.answerMustMatch.some((p) => new RegExp(p, 'i').test(a));
      if (!ok) return { verdict: 'KO', kind: 'CONFINE', why: 'nessuna skill caricata, ma la risposta non dichiara il confine (accetta l\'incarico)' };
    }
    return { verdict: 'OK', kind: 'OK', why: labels.length ? `nessuna skill fuori posto (tollerata: ${labels.join(', ')})` : 'nessuna skill caricata, come atteso' };
  }

  if (!labels.length) {
    return { verdict: 'KO', kind: 'NO-SKILL', why: `nessuna skill caricata, attesa ${kase.expectedLabel}` };
  }
  const hit = labels.find((l) => matchesAny(l, kase.accept || [], groups));
  if (hit) {
    const noise = labels.filter((l) => l !== hit);
    return { verdict: 'OK', kind: noise.length ? 'OK (con rumore)' : 'OK', why: noise.length ? `${hit} (+ rumore: ${noise.join(', ')})` : hit };
  }
  return { verdict: 'KO', kind: 'KO', why: `skill sbagliata: ${labels.join(', ')} — attesa ${kase.expectedLabel}` };
}

function checkFlags(kase, answer) {
  return (kase.flags || [])
    .filter((f) => new RegExp(f.pattern, 'i').test(norm(answer)))
    .map((f) => f.label);
}

// ─────────────────────────────────────────────────────────────── main ──

async function main() {
  const opts = parseArgs(process.argv);
  const suite = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases-35.json'), 'utf-8'));
  const groups = suite.skillGroups || {};
  const cases = suite.cases.filter((c) => !opts.only || opts.only.has(c.id));

  console.log(`Banco dei 35 casi — ${cases.length} caso/i · ${opts.base} · modo ${opts.mode}`);
  console.log(`Baseline: ${suite.baselineScore}/${suite.total} — ${suite.baselineRef}`);

  let catalog = null;
  try {
    catalog = await fetchSkillCatalog(opts.base, 30000);
    console.log(`Catalogo: ${catalog.size} asset pubblicati (per risolvere gli UUID di loadSkill in titoli)\n`);
  } catch (e) {
    console.warn(`Attenzione: catalogo non leggibile (${e.message}). Gli UUID di loadSkill non saranno risolti; si userà il fallback su sources.\n`);
  }

  const results = [];
  for (const [i, kase] of cases.entries()) {
    if (!opts.quiet) process.stdout.write(`  [${String(i + 1).padStart(2)}/${cases.length}] caso ${String(kase.id).padStart(2)} … `);
    const run = await runCase(kase, opts, catalog);
    const loaded = extractLoadedSkills(run, catalog);
    const verdict = run.ok
      ? judge(kase, loaded, run.answer, groups)
      : { verdict: 'ERRORE', kind: 'ERRORE', why: `non misurato: ${run.error}` };
    const flags = run.ok ? checkFlags(kase, run.answer) : [];

    const row = {
      id: kase.id,
      question: kase.question,
      expected: kase.expectedLabel,
      loaded: loaded.map((l) => l.label),
      verdict: verdict.verdict,
      kind: verdict.kind,
      why: verdict.why,
      flags,
      baseline: kase.baseline.verdict,
      baselineLoaded: kase.baseline.loaded,
      delta: run.ok
        ? (kase.baseline.verdict === verdict.verdict ? 'uguale' : (verdict.verdict === 'OK' ? 'MIGLIORATO' : 'REGRESSIONE'))
        : 'non misurato',
      ms: run.ms,
      tries: run.tries,
      attempts: run.attempts,
      answer: run.answer
    };
    results.push(row);

    if (!opts.quiet) {
      const tag = row.verdict === 'OK' ? 'OK ' : (row.verdict === 'KO' ? 'KO ' : 'ERR');
      const mark = row.delta === 'REGRESSIONE' ? '  <<< REGRESSIONE' : (row.delta === 'MIGLIORATO' ? '  <<< migliorato' : '');
      console.log(`${tag} ${Math.round((row.ms || 0) / 1000)}s${row.tries > 1 ? ` (${row.tries} tentativi)` : ''} — ${row.why}${mark}`);
    }
    if (i < cases.length - 1) await sleep(opts.delay);
  }

  report(suite, results, opts);

  if (opts.out) {
    const payload = { ranAt: new Date().toISOString(), base: opts.base, mode: opts.mode, baselineScore: suite.baselineScore, results };
    fs.writeFileSync(opts.out, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\nDettaglio completo (risposte integrali incluse): ${path.resolve(opts.out)}`);
  }

  const regressions = results.filter((r) => r.delta === 'REGRESSIONE').length;
  process.exit(regressions > 0 ? 1 : 0);
}

function report(suite, results, opts) {
  const ok = results.filter((r) => r.verdict === 'OK');
  const ko = results.filter((r) => r.verdict === 'KO');
  const err = results.filter((r) => r.verdict === 'ERRORE');
  const regressions = results.filter((r) => r.delta === 'REGRESSIONE');
  const improvements = results.filter((r) => r.delta === 'MIGLIORATO');
  const partial = results.length !== suite.total;

  console.log('\n' + '─'.repeat(78));
  console.log('DETTAGLIO');
  console.log('─'.repeat(78));
  for (const r of results) {
    const d = r.delta === 'REGRESSIONE' ? '  [REGRESSIONE]' : (r.delta === 'MIGLIORATO' ? '  [migliorato]' : '');
    console.log(`${String(r.id).padStart(2)}. ${r.verdict.padEnd(7)} (baseline ${r.baseline})${d}`);
    console.log(`    domanda : ${r.question}`);
    console.log(`    attesa  : ${r.expected}`);
    console.log(`    caricata: ${r.loaded.length ? r.loaded.join(', ') : '(nessuna)'}   |   baseline: ${r.baselineLoaded.length ? r.baselineLoaded.join(', ') : '(nessuna)'}`);
    console.log(`    perché  : ${r.why}`);
    if (r.flags.length) console.log(`    avvisi  : ${r.flags.join(' · ')}`);
  }

  console.log('\n' + '─'.repeat(78));
  console.log('PUNTEGGIO');
  console.log('─'.repeat(78));
  const scale = partial ? `${results.length} (sottoinsieme)` : suite.total;
  console.log(`  ${ok.length}/${scale} corretti${err.length ? ` · ${err.length} non misurati (errore di rete)` : ''}`);
  if (!partial) {
    const delta = ok.length - suite.baselineScore;
    const sign = delta > 0 ? `+${delta}` : String(delta);
    console.log(`  baseline ${suite.baselineScore}/${suite.total} → ${ok.length}/${suite.total} (${sign})`);
  } else {
    const baseOk = results.filter((r) => r.baseline === 'OK').length;
    console.log(`  sul solo sottoinsieme: baseline ${baseOk}/${results.length} → ${ok.length}/${results.length}`);
  }
  console.log(`  falliti: ${ko.length ? ko.map((r) => r.id).join(', ') : 'nessuno'}`);
  if (err.length) console.log(`  non misurati: ${err.map((r) => r.id).join(', ')} — rilanciali con --only`);

  console.log('');
  if (regressions.length) {
    console.log(`  REGRESSIONI (${regressions.length}) — casi che la baseline dava OK e ora falliscono:`);
    for (const r of regressions) console.log(`    - caso ${r.id}: ${r.why}\n      baseline: ${r.baselineLoaded.join(', ') || '(nessuna skill)'} · ora: ${r.loaded.join(', ') || '(nessuna skill)'}`);
  } else {
    console.log('  Nessuna regressione rispetto alla baseline.');
  }
  if (improvements.length) {
    console.log(`\n  Migliorati (${improvements.length}): ${improvements.map((r) => r.id).join(', ')}`);
  }
  const flagged = results.filter((r) => r.flags.length);
  if (flagged.length) {
    console.log(`\n  Avvisi testuali (non incidono sul punteggio):`);
    for (const r of flagged) console.log(`    - caso ${r.id}: ${r.flags.join(' · ')}`);
  }
  console.log('');
  console.log('  Nota: il routing di un LLM non è deterministico — il punteggio ha un margine');
  console.log('  di ±2 casi. Un delta di 1-2 punti non è un segnale: ripetere la passata.');
}

if (require.main === module) {
  main().catch((e) => {
    console.error('\nEsecuzione interrotta:', e.stack || e.message);
    process.exit(2);
  });
}

// Esportati per poter verificare il criterio di giudizio a secco, senza
// chiamare il sistema (vedi README §"Verificare il banco").
module.exports = { norm, matchesAny, judge, extractLoadedSkills, checkFlags };
