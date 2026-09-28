// Vista "Classifica": stagione in corso, punti, progressione e attivita'
// della practice.
//
// I dati di gioco (classifica, punti, eventi) arrivano da
// gamification-api.js e oggi sono INVENTATI — vedi l'intestazione di
// gamification-mock.js. I conteggi del catalogo, invece, sono veri e
// arrivano da api.listAssets(): "quante persone hanno quanti punti" si puo'
// far finta, "quanti asset ci sono" no.
import { api } from '../api.js';
import { gameApi } from '../gamification-api.js';

// Etichetta "dati dimostrativi" nell'intestazione della vista. Finche' la
// classifica e' mock deve restare: a false sparisce, e non resta altro da
// togliere.
const SHOW_DEMO_BADGE = true;

const root = document.getElementById('game-root');
const demoNote = document.getElementById('game-demo');

// Helper locali invece di utils.js: quel file e' condiviso con le altre
// aree dell'app e queste due funzioni sono troppo piccole per giustificare
// un accoppiamento in piu'.
const esc = (s) => (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => Number(n || 0).toLocaleString('it-IT');

// ── Vocabolario delle tre reason ───────────────────────────────────────
// upload / certify / use sono l'enum PointReason dello schema, cioe' i tre
// comportamenti che il sistema ha deciso di premiare. Tutto quello che la
// vista mostra (chip, obiettivi, attivita') si appoggia a questi tre, non
// a meccaniche inventate a parte.
const REASONS = {
  upload: {
    label: 'Contributi',
    short: 'Pubblicare',
    chip: 'up',
    desc: 'Punti a chi pubblica, quando la revisione viene approvata. Ridotti in proporzione per le modifiche minori: lo decide chi certifica.',
    verb: (who, what) => `${who} ha pubblicato <em>${what}</em>`,
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>'
  },
  certify: {
    label: 'Certificazioni',
    short: 'Certificare',
    chip: 'ce',
    desc: 'Punti al certificatore che approva o rinnova il contenuto di qualcun altro: rivedere il lavoro altrui è lavoro.',
    verb: (who, what) => `${who} ha certificato <em>${what}</em>`,
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>'
  },
  use: {
    label: 'Utilizzi',
    short: 'Essere usati',
    chip: 'us',
    desc: 'Punti all’autore ogni volta che Billy cita il suo asset in una risposta: premia il contenuto che serve davvero.',
    verb: (who, what) => `<em>${what}</em> di ${who} è stato citato da Billy`,
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l1.3-3.9a9 8 0 1 1 3.4 2.9z"/></svg>'
  }
};

const SENIORITY = { analyst: 'Analyst', senior: 'Senior', manager: 'Manager' };

// ── Livelli ────────────────────────────────────────────────────────────
// Sulle soglie di totalPoints (il totale di sempre), non sui punti di
// stagione: la posizione in classifica si azzera a ogni stagione, il
// livello raggiunto no — altrimenti chi contribuisce da un anno
// ricomincerebbe da "Novizio" ogni tre mesi.
// Le soglie sono una scelta di prodotto, non un dato del backend.
const LEVELS = [
  { name: 'Novizio', min: 0 },
  { name: 'Contributore', min: 250 },
  { name: 'Curatore', min: 600 },
  { name: 'Referente', min: 1100 },
  { name: 'Ambassador', min: 1800 }
];

function levelOf(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const current = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  const pct = next ? Math.round(((points - current.min) / (next.min - current.min)) * 100) : 100;
  return { index: i, current, next, pct: Math.max(0, Math.min(100, pct)), missing: next ? next.min - points : 0 };
}

// ── Obiettivi personali ────────────────────────────────────────────────
// Uno per reason, piu' i gradini successivi: sono la stessa cosa che la
// classifica misura, ma raggiungibile anche da chi non puntera' mai al
// primo posto. Le soglie valgono sulla stagione in corso.
// Icone dei traguardi. SVG con lo stesso stroke del resto dell'app e non
// emoji: nel restyling le emoji sono state tolte ovunque, rimetterle qui
// farebbe sembrare questa vista incollata da un'altra applicazione.
const IC = {
  pen: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  shelf: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="13" x2="14" y2="13"/></svg>',
  shield: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>',
  quote: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l1.3-3.9a9 8 0 1 1 3.4 2.9z"/></svg>',
  star: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 2.9 6.3L21 9.3l-4.7 4.4 1.2 6.3L12 17l-5.5 3 1.2-6.3L3 9.3l6.1-1z"/></svg>'
};

function badgesFor(row) {
  const list = [
    { icon: IC.pen, name: 'Primo contributo', desc: 'Pubblica un asset', have: row.uploads, need: 1 },
    { icon: IC.book, name: 'Autore', desc: 'Pubblica 3 asset nella stagione', have: row.uploads, need: 3 },
    { icon: IC.shelf, name: 'Bibliotecario', desc: 'Pubblica 8 asset nella stagione', have: row.uploads, need: 8 },
    { icon: IC.quote, name: 'Fonte citata', desc: 'Fatti citare 10 volte da Billy', have: row.uses, need: 10 },
    { icon: IC.star, name: 'Riferimento', desc: 'Fatti citare 30 volte da Billy', have: row.uses, need: 30 }
  ];
  // Il traguardo da certificatore si mostra solo a chi puo' certificare: a
  // un analyst sarebbe irraggiungibile per ruolo, non per merito.
  if (row.player.isCertifier) {
    list.splice(3, 0, { icon: IC.shield, name: 'Guardiano', desc: 'Certifica 5 contenuti altrui', have: row.certifications, need: 5 });
  }
  return list;
}

// ── Formattazioni ──────────────────────────────────────────────────────
function fmtAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'poco fa';
  if (hours < 24) return `${hours} h fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ieri';
  if (days < 30) return `${days} giorni fa`;
  const months = Math.floor(days / 30);
  return months <= 1 ? 'un mese fa' : `${months} mesi fa`;
}

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function initials(name) {
  return (name || '?').trim().split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ── Stato della vista ──────────────────────────────────────────────────
// `filter` e' l'unica cosa che vive fra un render e l'altro: filtrare per
// seniority non e' una nuova richiesta al server, e' una fetta della stessa
// classifica gia' in mano.
const state = { season: null, me: null, board: [], events: [], assets: null, scoring: null, filter: 'all' };

// ── Sezioni ────────────────────────────────────────────────────────────

function renderSeason() {
  const s = state.season;
  const start = new Date(`${s.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${s.endDate}T23:59:59Z`).getTime();
  const now = Date.now();
  const pct = Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
  const myRow = state.board.find((r) => r.player.ID === state.me.ID);

  return `
    <div class="g-season">
      <div class="g-season-top">
        <div>
          <div class="g-season-name">${esc(s.name)}</div>
          <div class="g-season-dates">${fmtDay(s.startDate)} → ${fmtDay(s.endDate)} · ${s.status === 'active' ? 'in corso' : esc(s.status)}</div>
        </div>
        <div class="g-season-left">${daysLeft === 0 ? 'ultimo giorno' : `${daysLeft} giorni alla chiusura`}</div>
      </div>
      <div class="g-bar"><div class="g-bar-fill" style="width:${pct}%"></div></div>
      <div class="g-season-foot">
        <span>Sei <b>${myRow ? `${myRow.rank}º` : '—'}</b> su ${state.board.length} con <b>${num(myRow ? myRow.points : 0)}</b> punti di stagione</span>
        <span>${num(state.board.reduce((t, r) => t + r.points, 0))} punti assegnati in totale</span>
      </div>
    </div>`;
}

// I due riquadri di destra sono conteggi VERI del catalogo; i due di
// sinistra sono i punti mock. Il `title` lo dice riga per riga, senza
// ripetere un avviso a schermo che l'intestazione della vista fa gia'.
function renderStats() {
  const myRow = state.board.find((r) => r.player.ID === state.me.ID) || { points: 0, uploads: 0, uses: 0 };
  const total = state.assets ? state.assets.length : null;
  const certified = state.assets ? state.assets.filter((a) => a.certificationLevel === 'certified').length : null;

  const tile = (n, label, hint) => `
    <div class="g-stat" title="${esc(hint)}">
      <div class="g-stat-n">${n}</div>
      <div class="g-stat-l">${esc(label)}</div>
    </div>`;

  return `
    <div class="g-stats">
      ${tile(num(myRow.points), 'punti in stagione', 'Dato dimostrativo')}
      ${tile(num(state.me.totalPoints), 'punti totali', 'Dato dimostrativo')}
      ${tile(total === null ? '—' : num(total), 'asset nel catalogo', 'Dato reale, dal catalogo')}
      ${tile(certified === null ? '—' : num(certified), 'asset certificati', 'Dato reale, dal catalogo')}
    </div>`;
}

// ── Podio ──────────────────────────────────────────────────────────────
// Disposizione 2-1-3, quella del podio vero: il primo al centro e piu'
// alto, gli altri due che scendono ai lati. Leggere "chi ha vinto" da tre
// righe identiche di una lista richiede di confrontare tre numeri; qui si
// capisce dalla forma, prima di leggere.
const TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H5a2 2 0 0 0 0 4h2"/><path d="M17 6h2a2 2 0 0 1 0 4h-2"/></svg>';
const MEDAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="15" r="6"/><path d="M8.2 9.5 5 2h5l2.5 5.5"/><path d="M15.8 9.5 19 2h-5l-1 2.2"/></svg>';

function podiumCard(r, place) {
  const isMe = r.player.ID === state.me.ID;
  return `
    <button type="button" class="g-pod p${place}${isMe ? ' me' : ''}"
            data-player-id="${esc(r.player.ID)}"
            title="Apri la scheda di ${esc(r.player.displayName)}">
      <div class="g-pod-ico">${place === 1 ? TROPHY : MEDAL}</div>
      <div class="g-pod-av">${esc(initials(r.player.displayName))}</div>
      <div class="g-pod-name">${esc(r.player.displayName)}${isMe ? ' <span class="g-you">tu</span>' : ''}</div>
      <div class="g-pod-dept">${esc(r.player.department || '—')}</div>
      <div class="g-pod-pts">${num(r.points)}<small> pt</small></div>
      <div class="g-pod-step"><span class="g-pod-place">${place}</span></div>
    </button>`;
}

function podiumHtml(top) {
  const slots = [[top[1], 2], [top[0], 1], [top[2], 3]].filter(([r]) => r);
  return `<div class="g-podium">${slots.map(([r, place]) => podiumCard(r, place)).join('')}</div>`;
}

function rowHtml(r) {
  const isMe = r.player.ID === state.me.ID;
  const medal = r.rank <= 3 ? ` r${r.rank}` : '';
  // Il conteggio per reason e' la scomposizione del punteggio: dice se
  // quei punti vengono da contenuti scritti, da revisioni fatte o da
  // contenuti che vengono usati — tre profili molto diversi a parita' di
  // totale. Un conteggio a zero non si mostra: sarebbe rumore.
  const chip = (key, n) => (n ? `<span class="g-chip ${REASONS[key].chip}" title="${esc(REASONS[key].label)}">${REASONS[key].icon}${n}</span>` : '');
  // <button> e non <div>: la riga apre la scheda del giocatore, quindi
  // deve essere raggiungibile da tastiera e annunciata come comando.
  return `
    <button type="button" class="g-row${isMe ? ' me' : ''}" data-player-id="${esc(r.player.ID)}">
      <div class="g-rank${medal}">${r.rank}</div>
      <div class="g-av">${esc(initials(r.player.displayName))}</div>
      <div class="g-who">
        <div class="g-name">${esc(r.player.displayName)}${isMe ? ' <span class="g-you">tu</span>' : ''}</div>
        <div class="g-dept">${esc(r.player.department || '—')} · ${esc(SENIORITY[r.player.seniorityLevel] || '—')}${r.player.isCertifier ? ' · certificatore' : ''}</div>
      </div>
      <div class="g-chips">
        ${chip('upload', r.uploads)}
        ${chip('certify', r.certifications)}
        ${chip('use', r.uses)}
      </div>
      <div class="g-pts">${num(r.points)}<small> pt</small></div>
    </button>`;
}

function renderBoard() {
  const rows = state.filter === 'all'
    ? state.board
    : state.board.filter((r) => r.player.seniorityLevel === state.filter);

  const pill = (value, label) => `<button class="ftag${state.filter === value ? ' on' : ''}" type="button" data-game-filter="${value}">${label}</button>`;

  // Il podio si mostra solo sulla classifica intera. Con un filtro di
  // seniority attivo i primi tre della fetta non sono i primi tre della
  // stagione, e un podio che mostra posizioni 2-5-7 direbbe una bugia.
  const podium = state.filter === 'all' && rows.length >= 3 ? rows.slice(0, 3) : null;
  const rest = podium ? rows.slice(3) : rows;

  return `
    <div class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-card-title">Classifica di stagione</div>
          <div class="g-card-sub">Somma dei punti di ${esc(state.season.name)}</div>
        </div>
      </div>
      <!-- Filtro per seniority: un analyst e un manager non hanno lo
           stesso tempo da dedicare al catalogo, confrontarli in un'unica
           lista scoraggia proprio chi va incoraggiato. La posizione
           mostrata resta quella generale, non si rinumera la fetta. -->
      <div class="g-filters">
        ${pill('all', 'Tutti')}
        ${Object.entries(SENIORITY).map(([k, v]) => pill(k, v)).join('')}
      </div>
      ${podium ? podiumHtml(podium) : ''}
      <div class="g-rows">
        ${rest.length ? rest.map(rowHtml).join('') : (podium ? '' : '<div class="g-empty">Nessuno in questa categoria.</div>')}
      </div>
    </div>`;
}

function renderLevel() {
  const myRow = state.board.find((r) => r.player.ID === state.me.ID)
    || { player: state.me, points: 0, uploads: 0, certifications: 0, uses: 0 };
  const lv = levelOf(state.me.totalPoints);
  const badges = badgesFor(myRow);

  return `
    <div class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-card-title">Il tuo livello</div>
          <div class="g-card-sub">Sul totale di sempre, non sulla stagione</div>
        </div>
      </div>
      <div class="g-level">
        <div class="g-ring" style="--pct:${lv.pct}">
          <div class="g-ring-in">
            <div class="g-ring-n">${num(state.me.totalPoints)}</div>
            <div class="g-ring-l">punti</div>
          </div>
        </div>
        <div class="g-level-txt">
          <div class="g-level-name">${esc(lv.current.name)}</div>
          <div class="g-level-next">${lv.next
            ? `${num(lv.missing)} punti a <b>${esc(lv.next.name)}</b>`
            : 'Livello massimo raggiunto'}</div>
          <div class="g-bar"><div class="g-bar-fill" style="width:${lv.pct}%"></div></div>
          <div class="g-level-scale">${LEVELS.map((l, i) => `<span class="${i <= lv.index ? 'on' : ''}">${esc(l.name)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="g-sep"></div>
      <div class="g-card-title">Obiettivi di stagione</div>
      <div class="g-badges">
        ${badges.map((b) => {
          const done = b.have >= b.need;
          const pct = Math.min(100, Math.round((b.have / b.need) * 100));
          return `
            <div class="g-badge ${done ? 'on' : 'off'}">
              <div class="g-badge-ico">${b.icon}</div>
              <div class="g-badge-txt">
                <div class="g-badge-n">${esc(b.name)}</div>
                <div class="g-badge-d">${esc(b.desc)}</div>
                ${done ? '' : `<div class="g-bar g-bar-thin"><div class="g-bar-fill" style="width:${pct}%"></div></div>`}
              </div>
              <div class="g-badge-s">${done ? '✓' : `${b.have}/${b.need}`}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderScoring() {
  const s = state.scoring;
  return `
    <div class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-card-title">Come si guadagnano punti</div>
          <div class="g-card-sub">Le tre azioni che il sistema premia</div>
        </div>
      </div>
      <div class="g-rules">
        ${Object.entries(REASONS).map(([key, r]) => `
          <div class="g-rule">
            <div class="g-rule-ico ${r.chip}">${r.icon}</div>
            <div class="g-rule-txt">
              <div class="g-rule-n">${esc(r.short)}</div>
              <div class="g-rule-d">${r.desc}</div>
            </div>
            <div class="g-rule-p">+${num(s[key])}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

// Obiettivi collettivi: i numeratori sono VERI (conteggio del catalogo), le
// soglie sono inventate — un traguardo di practice che nessuno ha ancora
// concordato. Detto nel sottotitolo, non nascosto.
function renderGoals() {
  if (!state.assets) return '';
  const total = state.assets.length;
  const certified = state.assets.filter((a) => a.certificationLevel === 'certified').length;
  const expired = state.assets.filter((a) => a.certificationLevel === 'certifiedOutdated').length;

  const goal = (label, have, need, extra) => {
    const pct = Math.min(100, Math.round((have / need) * 100));
    return `
      <div class="g-goal">
        <div class="g-goal-top">
          <span>${esc(label)}</span>
          <span class="g-goal-n">${num(have)}<span class="g-goal-t"> / ${num(need)}</span></span>
        </div>
        <div class="g-bar"><div class="g-bar-fill" style="width:${pct}%"></div></div>
        ${extra ? `<div class="g-goal-x">${esc(extra)}</div>` : ''}
      </div>`;
  };

  return `
    <div class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-card-title">Traguardi della practice</div>
          <div class="g-card-sub">Conteggi reali dal catalogo, soglie di esempio</div>
        </div>
      </div>
      <div class="g-goals">
        ${goal('Asset pubblicati', total, 50)}
        ${goal('Asset certificati', certified, 25, expired ? `${expired} certificazioni scadute da rinnovare` : '')}
      </div>
    </div>`;
}

function renderActivity() {
  const realIds = new Set((state.assets || []).map((a) => a.ID));

  const rows = state.events.map((e) => {
    const r = REASONS[e.reason] || REASONS.use;
    const isMe = e.player.ID === state.me.ID;
    const who = isMe ? 'Tu' : esc(e.player.displayName);
    const what = esc(e.asset ? e.asset.title : 'un asset');
    // Cliccabile solo se l'asset esiste davvero nel catalogo: su un
    // riferimento inventato il dettaglio darebbe 404.
    const open = e.asset && realIds.has(e.asset.ID);
    const tag = open ? 'button' : 'div';
    return `
      <${tag} class="g-act${open ? ' link' : ''}"${open ? ` type="button" data-asset-id="${esc(e.asset.ID)}"` : ''}>
        <div class="g-act-ico ${r.chip}">${r.icon}</div>
        <div class="g-act-txt">
          <div class="g-act-t">${r.verb(who, what)}</div>
          <div class="g-act-m">${esc(r.label)} · ${fmtAgo(e.createdAt)}</div>
        </div>
        <div class="g-act-p">+${num(e.points)}</div>
      </${tag}>`;
  }).join('');

  return `
    <div class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-card-title">Attività recente</div>
          <div class="g-card-sub">Ultimi punti assegnati nella stagione</div>
        </div>
      </div>
      <div class="g-acts">${rows || '<div class="g-empty">Nessun punto assegnato finora.</div>'}</div>
    </div>`;
}

function render() {
  root.innerHTML = `
    ${renderSeason()}
    ${renderStats()}
    <div class="g-cols">
      <div class="g-col">
        ${renderBoard()}
        ${renderActivity()}
      </div>
      <div class="g-col">
        ${renderLevel()}
        ${renderGoals()}
        ${renderScoring()}
      </div>
    </div>`;
}

function renderSkeleton() {
  const block = (h) => `<div class="skel" style="height:${h}px;border-radius:12px"></div>`;
  root.innerHTML = `
    ${block(92)}
    <div class="g-stats">${block(74)}${block(74)}${block(74)}${block(74)}</div>
    <div class="g-cols">
      <div class="g-col">${block(320)}${block(220)}</div>
      <div class="g-col">${block(260)}${block(150)}</div>
    </div>`;
}

// ── Caricamento ────────────────────────────────────────────────────────
export async function loadGame() {
  if (!root) return;
  renderSkeleton();
  try {
    // Il catalogo e' l'unica chiamata che puo' fallire senza compromettere
    // la vista (e' il pezzo reale): fallisce da sola, e le sezioni che ne
    // dipendono si spengono invece di far saltare tutto.
    const [season, me, board, events, scoring, assets] = await Promise.all([
      gameApi.getCurrentSeason(),
      gameApi.getMyPlayer(),
      gameApi.getLeaderboard(),
      gameApi.listPointEvents({ top: 10 }),
      gameApi.getScoringRules(),
      api.listAssets().catch(() => null)
    ]);
    Object.assign(state, { season, me, board, events, scoring, assets });
    render();
  } catch (e) {
    root.innerHTML = `<div class="g-empty">Impossibile caricare la classifica: ${esc(e.message)}</div>`;
  }
}

// ── Scheda del giocatore ───────────────────────────────────────────────
// Si apre cliccando una riga o una casella del podio. Riusa <billy-modal>
// invece di un pannello proprio: e' lo stesso componente del dettaglio
// asset, quindi stesso aspetto, stessa chiusura con Escape e stesso
// comportamento al click fuori.
const modal = document.getElementById('modal');

async function openPlayer(playerId) {
  const row = state.board.find((r) => r.player.ID === playerId);
  if (!row || !modal) return;

  const p = row.player;
  const isMe = p.ID === state.me.ID;
  const lv = levelOf(p.totalPoints);
  const gap = state.board[0] && state.board[0].points - row.points;

  const meta = [
    p.department,
    SENIORITY[p.seniorityLevel],
    p.isCertifier ? 'certificatore' : null,
    p.manager ? `riporta a ${p.manager}` : null
  ].filter(Boolean).map(esc).join(' · ');

  const stat = (n, l) => `<div class="g-pstat"><div class="g-pstat-n">${n}</div><div class="g-pstat-l">${esc(l)}</div></div>`;
  const line = (key, n) => `
    <div class="g-pline">
      <span class="g-chip ${REASONS[key].chip}">${REASONS[key].icon}</span>
      <span class="g-pline-l">${esc(REASONS[key].label)}</span>
      <span class="g-pline-n">${num(n)}</span>
    </div>`;

  modal.open({
    title: p.displayName,
    bodyHtml: `
      <div class="g-phead">
        <div class="g-pav">${esc(initials(p.displayName))}</div>
        <div>
          <div class="g-pmeta">${meta || '—'}</div>
          <div class="g-plevel">${esc(lv.current.name)}${lv.next ? ` · ${num(lv.missing)} punti a ${esc(lv.next.name)}` : ''}</div>
        </div>
      </div>
      <div class="g-pstats">
        ${stat(row.rank + 'º', 'in stagione')}
        ${stat(num(row.points), 'punti stagione')}
        ${stat(num(p.totalPoints), 'punti totali')}
      </div>
      <div class="g-bar"><div class="g-bar-fill" style="width:${lv.pct}%"></div></div>
      <p class="g-pnote">${isMe
        ? (row.rank === 1 ? 'Sei in testa alla stagione.' : `Ti separano <b>${num(gap)}</b> punti dal primo posto.`)
        : (row.rank === 1 ? 'In testa alla stagione.' : `A <b>${num(gap)}</b> punti dal primo posto.`)}</p>
      <div class="g-psec">Da dove vengono i punti</div>
      ${line('upload', row.uploads)}
      ${line('certify', row.certifications)}
      ${line('use', row.uses)}
      <div class="g-psec">Attività recente</div>
      <div id="g-pacts" class="g-pacts"><div class="g-empty">Caricamento…</div></div>`,
    footerButtons: [{ label: 'Chiudi', className: 'btn-primary', onClick: () => modal.close() }]
  });

  // Gli eventi del singolo giocatore si chiedono solo all'apertura: sono
  // l'unica cosa della scheda che non e' gia' in state.board.
  let events = [];
  try {
    events = await gameApi.listPointEvents({ seasonId: state.season.ID, playerId: p.ID, top: 6 });
  } catch (e) { /* la scheda resta leggibile senza lo storico */ }

  const box = modal.query('#g-pacts');
  if (!box) return; // modale gia' chiusa nel frattempo
  box.innerHTML = events.length
    ? events.map((e) => `
        <div class="g-pact">
          <span class="g-chip ${REASONS[e.reason].chip}">${REASONS[e.reason].icon}</span>
          <span class="g-pact-t">${esc(e.asset ? e.asset.title : REASONS[e.reason].label)}</span>
          <span class="g-pact-d">${esc(fmtAgo(e.createdAt))}</span>
          <span class="g-pact-p">+${num(e.points)}</span>
        </div>`).join('')
    : '<div class="g-empty">Nessuna attività in questa stagione.</div>';
}

export function initGameView() {
  if (!root) return;
  if (SHOW_DEMO_BADGE && demoNote) demoNote.textContent = ' · dati dimostrativi';

  // Delegazione: il contenuto viene rigenerato a ogni render, riattaccare
  // i listener ogni volta sarebbe un modo silenzioso di perderli.
  root.addEventListener('click', (ev) => {
    const pill = ev.target.closest('[data-game-filter]');
    if (pill) {
      state.filter = pill.dataset.gameFilter;
      render();
      return;
    }
    // Stesso evento che usano chat e catalogo: la vista non conosce il
    // dettaglio asset, lo instrada app.js.
    const act = ev.target.closest('.g-act.link');
    if (act) {
      document.dispatchEvent(new CustomEvent('open-asset', { detail: { assetId: act.dataset.assetId } }));
      return;
    }
    // Righe di classifica e caselle del podio: aprono la scheda.
    const who = ev.target.closest('[data-player-id]');
    if (who) openPlayer(who.dataset.playerId);
  });
}
