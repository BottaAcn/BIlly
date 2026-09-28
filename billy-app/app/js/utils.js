// Costanti e helper condivisi tra componenti e viste.
// Nessuna dipendenza da api.js qui: sono puramente di presentazione/formato.

export const CERT_LABELS = {
  certified: 'Certificato',
  certifiedOutdated: 'Scaduto',
  community: 'Community',
  deprecated: 'Ritirato'
};

export const TYPE_LABELS = {
  document: 'Documento', skill: 'Skill', tool: 'Tool',
  application: 'Applicazione', interface: 'Interfaccia', other: 'Altro'
};

// Nessuna libreria di icone: glifi Unicode semplici, coerenti con la scelta
// di non aggiungere dipendenze esterne per il frontend.
export const TYPE_ICONS = {
  document: '📄', skill: '🧩', tool: '🛠️',
  application: '🖥️', interface: '🔌', other: '📦'
};

export function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Il backend restituisce un COSINE_SIMILARITY grezzo (0-1): un numero come
// "0.26" non comunica nulla a chi non ha scritto la query SQL. Una
// percentuale con etichetta breve resta leggibile anche nei chip stretti.
export function fmtSimilarity(value) {
  if (value == null || Number.isNaN(value)) return '';
  return `${Math.round(value * 100)}% rilevanza`;
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Ponte fra il modello dati CAP e il vocabolario del mockup
// (doc/FrontEnd/billy_final_nonfinal.html). Le classi CSS sono trascritte
// verbatim da lì e usano i suffissi corti ok/exp/com/ret: la traduzione
// vive qui, in un posto solo, invece che sparsa in ogni template.
// ---------------------------------------------------------------------------

export const CERT_SLUG = {
  certified: 'ok',
  certifiedOutdated: 'exp',
  community: 'com',
  deprecated: 'ret'
};

// I colori "vivi" (dot, sfondo e testo dell'etichetta nel modale) sono
// letterali presi dal mockup (certColors, riga 554): restano letterali
// perché lì lo sono, sostituirli con un token semantico introdurrebbe
// differenze non verificabili senza browser.
export const CERT_UI = {
  ok:  { label: 'Certificato', badge: 'cb-ok',  bar: 'bar-ok',  dot: '#4ade80', bg: 'rgba(74,222,128,.1)', color: '#4ade80' },
  exp: { label: 'Scaduto',     badge: 'cb-exp', bar: 'bar-exp', dot: '#f87171', bg: 'rgba(248,113,113,.1)', color: '#f87171' },
  com: { label: 'Community',   badge: 'cb-com', bar: 'bar-com', dot: '#fbbf24', bg: 'rgba(251,191,36,.1)', color: '#fbbf24' },
  ret: { label: 'Ritirato',    badge: 'cb-ret', bar: 'bar-ret', dot: 'rgba(240,240,248,.3)', bg: 'rgba(255,255,255,.05)', color: 'rgba(240,240,248,.4)' }
};

// Livello sconosciuto o assente → "ret" (grigio, neutro): stessa scelta del
// mockup (`certColors[c.s] || certColors['ret']`), così un dato sporco non
// si traveste da certificato.
export function certUi(level) {
  return CERT_UI[CERT_SLUG[level]] || CERT_UI.ret;
}

export const TYPE_ICO_CLASS = {
  document: 'ico-doc', skill: 'ico-skill', tool: 'ico-tool',
  application: 'ico-app', interface: 'ico-int', other: 'ico-alt'
};

// SVG trascritti dal mockup (icoEmoji, riga 492), colore di stroke incluso.
// Unica correzione: nel sorgente l'icona "Tool" chiude con `"/</svg>` —
// tag malformato che i browser interpretano a modo loro; qui `"/></svg>`.
export const TYPE_ICON_SVG = {
  document: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  skill: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 4.9 11.9l-.9.9V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-3.2l-.9-.9A7 7 0 0 1 12 2z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="9.5" y1="14" x2="14.5" y2="14"/></svg>',
  tool: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  application: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/></svg>',
  interface: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f472b6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 8h.01M11 8h.01"/><path d="M7 11h4"/></svg>',
  other: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.09 6.26L20 10l-4.55 4.74L16.18 21 12 17.77 7.82 21l1.73-6.26L5 10l5.91-1.74z"/></svg>'
};

export function typeIconSvg(type) {
  return TYPE_ICON_SVG[type] || TYPE_ICON_SVG.other;
}

// Icone della coda di revisione (mockup, riga 414): orologio per ciò che
// aspetta una prima approvazione, allerta per una certificazione scaduta.
export const IC_CLOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
export const IC_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
export const IC_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>';

// ---------------------------------------------------------------------------
// Barra di completezza
// ---------------------------------------------------------------------------
// Il mockup ha un campo `fill` inventato (0-100) che colora la barra sotto al
// titolo della card. Nel nostro modello dati quel campo NON esiste, quindi va
// derivato qui, lato client, da segnali che il backend restituisce davvero.
//
// Pesi (somma 100) e loro perché:
//   descrizione presente  25  è l'unica cosa che rende l'asset comprensibile
//                             dalla card e dai risultati di ricerca, senza
//                             doverlo aprire;
//   contenuto presente    25  senza testo non ci sono chunk né embedding:
//                             l'asset esiste ma Billy non lo sa citare —
//                             tanto grave quanto non avere descrizione;
//   certificato           20  è lo stato che ne autorizza l'uso come fonte
//                             affidabile: pesa molto, ma meno dei contenuti,
//                             perché un asset community completo è comunque
//                             più utile di uno certificato e vuoto;
//   certificazione valida 10  "non scaduto" è una condizione di igiene, non
//                             un contributo di contenuto;
//   almeno un allegato    10  valore aggiunto (il file originale scaricabile),
//                             non obbligatorio se c'è già il testo;
//   link esterno          10  stessa logica dell'allegato.
//
// Renormalizzazione: un criterio conta solo se il campo che lo alimenta è
// presente nella risposta. `content` è escluso dalla proiezione del servizio
// (srv/catalog-service.cds: `excluding { content }`) e gli allegati si
// leggono con una chiamata a parte, quindi nella griglia il punteggio si
// calcola su 4 criteri (65 punti di base) e nel modale su 5 (75). Meglio una
// percentuale onesta su ciò che si sa, che una penalizzazione sistematica di
// tutti gli asset per un dato che nessuno ha chiesto al backend.
// Deterministica: stesso asset → stessa percentuale, sempre.
export function computeCompleteness(asset, attachments) {
  const a = asset || {};
  const expiresAt = a.certificationExpiresAt ? new Date(a.certificationExpiresAt).getTime() : null;
  const hasLevel = !!a.certificationLevel;

  const criteria = [
    { label: 'Descrizione', weight: 25, known: 'description' in a, ok: !!String(a.description || '').trim() },
    { label: 'Contenuto indicizzato', weight: 25, known: 'content' in a, ok: !!String(a.content || '').trim() },
    { label: 'Certificato', weight: 20, known: hasLevel, ok: a.certificationLevel === 'certified' },
    { label: 'Certificazione valida', weight: 10, known: hasLevel, ok: a.certificationLevel !== 'certifiedOutdated' && (expiresAt === null || expiresAt > Date.now()) },
    { label: 'Allegato', weight: 10, known: Array.isArray(attachments), ok: Array.isArray(attachments) && attachments.length > 0 },
    { label: 'Link esterno', weight: 10, known: 'externalLink' in a, ok: !!a.externalLink }
  ];

  const evaluable = criteria.filter((c) => c.known);
  const total = evaluable.reduce((sum, c) => sum + c.weight, 0);
  if (!total) return { pct: 0, criteria: [] };
  const scored = evaluable.filter((c) => c.ok).reduce((sum, c) => sum + c.weight, 0);
  return { pct: Math.round((scored / total) * 100), criteria: evaluable };
}

// Testo per il tooltip: rende la percentuale spiegabile senza aprire il
// codice ("perché questo asset è al 60%?").
export function completenessHint(result) {
  if (!result.criteria.length) return 'Completezza non calcolabile';
  const rows = result.criteria.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`).join('\n');
  return `Completezza ${result.pct}%\n${rows}`;
}

// ---------------------------------------------------------------------------
// Autore
// ---------------------------------------------------------------------------
// `Asset.uploadedBy` è un'associazione a Player, ma il servizio espone la
// lista senza expand: arriva solo `uploadedBy_ID` (un UUID, inutile da
// mostrare). Finché non c'è XSUAA ogni upload finisce sul player di default
// "Utente anonimo" e `createdBy` vale 'anonymous'. Quindi: si usa il nome
// solo se esiste davvero ed è di una persona, altrimenti si ritorna null e
// la card omette avatar e autore. Nessun nome inventato, mai.
const ANONYMOUS_AUTHORS = new Set(['anonymous', 'utente anonimo', 'system', 'privileged', '']);

export function authorOf(asset) {
  const raw = asset?.uploadedBy?.displayName || asset?.uploadedByName || asset?.createdBy || '';
  const name = String(raw).trim();
  if (!name || ANONYMOUS_AUTHORS.has(name.toLowerCase())) return null;
  // Un userId tecnico ("l.botta@accenture.com") è comunque un dato reale:
  // si mostra la parte leggibile, senza inventare nome e cognome.
  return name.includes('@') ? name.split('@')[0].replace(/[._]+/g, ' ') : name;
}

export function initialsOf(name) {
  if (!name) return '';
  return name.trim().split(/[\s.]+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('');
}
