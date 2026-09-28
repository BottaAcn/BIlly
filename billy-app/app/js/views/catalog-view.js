import { api } from '../api.js';
import {
  escapeHtml, fmtDate, TYPE_LABELS, TYPE_ORDER, typeOf,
  CERT_LABELS, CERT_SLUG, CERT_UI, certUi,
  computeCompleteness, authorOf
} from '../utils.js';
import '../components/billy-asset-card.js';
import '../components/billy-badge.js';

const catalogGrid = document.getElementById('catalog-grid');
const catalogSearch = document.getElementById('catalog-search');
const deepToggle = document.getElementById('deep-search-toggle');
const catalogSortRow = document.getElementById('catalog-sort');
const catalogFilters = document.getElementById('catalog-filters');
const catalogTypes = document.getElementById('catalog-types');
const groupToggle = document.getElementById('catalog-group');
const catalogCount = document.getElementById('catalog-count');
const modal = document.getElementById('modal');
const toasts = document.getElementById('toast-container');

let catalogCache = [];
let currentList = [];
let certFilter = 'all';
let typeFilter = 'all';
let sortMode = 'recent';
// Raggruppamento acceso di default: con 22 skill e 8 documenti mescolati in
// una griglia unica, trovare l'unico documento utile significa scorrere
// trenta card indistinte. Resta spegnibile (vedi il toggle in initCatalogView).
let groupByType = true;
// Asset aperto nella modale: serve al pannello "cambia stato" inline, che
// agisce sull'asset corrente senza riaprire nulla.
let currentAsset = null;

// Scheletro identico al mockup (riga 513): un blocco 44x44 per l'icona,
// una riga di titolo, una di meta. Le misure sono inline come nel sorgente.
function skeletonCards() {
  return Array.from({ length: 8 }).map(() => `
    <div class="ccard" style="pointer-events:none">
      <div class="skel" style="height:44px;width:44px;border-radius:12px;margin-bottom:10px"></div>
      <div class="skel" style="height:13px;width:80%;margin-bottom:6px"></div>
      <div class="skel" style="height:10px;width:40%;margin-top:8px"></div>
    </div>`).join('');
}

// ══ FILTRI, ORDINAMENTO, RAGGRUPPAMENTO ══
// I controlli sono quattro e vanno tenuti indipendenti, perché rispondono a
// quattro domande diverse: "di cosa parla" (ricerca, l'unica che passa dal
// server), "di chi mi posso fidare" (certificazione), "che cosa è" (tipo),
// "in che ordine lo guardo" (ordinamento). Ricerca, certificazione e tipo si
// sommano in AND; l'ordinamento è l'ultimo passo e non toglie nulla. Il
// raggruppamento non è un quinto filtro: è solo il modo in cui la lista
// già filtrata e ordinata viene impaginata.
//
// Filtri e ordinamento restano lato client sulla lista già caricata: né il
// cambio filtro né il cambio ordinamento fanno una nuova chiamata API.
function byCert(list) {
  return certFilter === 'all' ? list : list.filter((a) => a.certificationLevel === certFilter);
}

function byType(list) {
  return typeFilter === 'all' ? list : list.filter((a) => typeOf(a) === typeFilter);
}

function sortList(list) {
  const out = [...list];
  if (sortMode === 'alpha') {
    out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortMode === 'cert') {
    // Stesso ordine del mockup (riga 505): prima ciò su cui ci si può
    // fidare, in fondo ciò che è stato ritirato.
    const rank = { certified: 0, community: 1, certifiedOutdated: 2, deprecated: 3 };
    out.sort((a, b) => (rank[a.certificationLevel] ?? 9) - (rank[b.certificationLevel] ?? 9));
  } else if (!out.some((a) => a._similarity != null)) {
    // "Più recenti" di default; in ricerca approfondita si rispetta invece
    // l'ordine di rilevanza già restituito da deepSearch.
    out.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  return out;
}

// Pill di tipo. Due scelte che vanno lette insieme:
//  - l'ELENCO delle pill viene dal catalogo intero, non dai risultati
//    correnti: se cambiasse a ogni tasto premuto la riga ballerebbe sotto il
//    puntatore e sparirebbe proprio la pill che si sta per cliccare. I 6 tipi
//    non compaiono tutti: quelli che nessuno ha mai caricato sarebbero solo
//    rumore (oggi in catalogo esistono davvero skill e documenti);
//  - i CONTEGGI invece sono vivi, calcolati su ricerca + certificazione ma
//    PRIMA del filtro di tipo. Così ogni numero risponde a "quanti risultati
//    ottengo se clicco qui"; calcolandoli dopo, ogni pill non selezionata
//    direbbe 0 e la riga smetterebbe di essere navigabile.
function renderTypePills(scoped) {
  const universe = catalogCache.length ? catalogCache : currentList;
  const present = TYPE_ORDER.filter((t) => universe.some((a) => typeOf(a) === t));
  // Un tipo può sparire dal catalogo (eliminato l'ultimo asset) mentre il suo
  // filtro è attivo: senza questo resterebbe un filtro invisibile che svuota
  // la griglia senza spiegare perché.
  if (typeFilter !== 'all' && !present.includes(typeFilter)) typeFilter = 'all';

  // Catalogo di un tipo solo: la riga non offrirebbe nessuna scelta.
  catalogTypes.hidden = present.length < 2;
  if (catalogTypes.hidden) {
    catalogTypes.innerHTML = '';
    return;
  }

  const counts = {};
  scoped.forEach((a) => { const t = typeOf(a); counts[t] = (counts[t] || 0) + 1; });

  const pill = (value, label, count) => {
    const on = value === typeFilter;
    // Una pill a zero resta visibile (dice che quel tipo esiste, ma che gli
    // altri filtri lo escludono) e non cliccabile: porterebbe a una griglia
    // vuota. Quella accesa resta sempre attiva, serve per tornare indietro.
    const off = !count && !on ? ' disabled' : '';
    return `<button class="ftag${on ? ' on' : ''}" type="button"${off}`
      + ` data-filter-type="${value}" aria-pressed="${on}">`
      + `${escapeHtml(label)}<span class="ftag-n">${count}</span></button>`;
  };

  // innerHTML rigenera i nodi a ogni render: se il fuoco era su una pill
  // (navigazione da tastiera) va rimesso, altrimenti dopo un Invio finisce
  // sul <body> e si perde il posto nella pagina.
  const hadFocus = catalogTypes.contains(document.activeElement);
  catalogTypes.innerHTML = '<span class="flt-lbl">Tipo:</span>'
    + pill('all', 'Tutti', scoped.length)
    + present.map((t) => pill(t, TYPE_LABELS[t], counts[t] || 0)).join('');
  if (hadFocus) catalogTypes.querySelector(`[data-filter-type="${typeFilter}"]`)?.focus();
}

// Raggruppa preservando l'ordine di prima apparizione. È la regola che tiene
// insieme raggruppamento e ordinamento senza casi speciali: si ordina prima
// la lista piatta, poi la si spezza in sezioni, così le sezioni escono
// nell'ordine del criterio attivo e dentro ogni sezione vale lo stesso ordine.
// Con "A → Z" viene prima la sezione del primo titolo in alfabeto; con la
// rilevanza della ricerca approfondita viene prima la sezione che contiene il
// risultato migliore, e la card in alto a sinistra resta la prima della
// classifica esattamente come nella griglia piatta.
function groupsOf(list) {
  const groups = new Map();
  list.forEach((a) => {
    const t = typeOf(a);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(a);
  });
  return [...groups];
}

function cardFor(asset) {
  const card = document.createElement('billy-asset-card');
  card.asset = asset;
  card.addEventListener('open', (e) => openAssetDetail(e.detail.assetId));
  return card;
}

// Scheletro, errori e stato vuoto vogliono sempre la griglia piatta:
// .ccard-empty occupa la riga con grid-column:1/-1 e fuori da un grid non
// avrebbe nulla da attraversare.
function fillGrid(html) {
  catalogGrid.className = 'cgrid';
  catalogGrid.innerHTML = html;
}

function renderFiltered() {
  const scoped = byCert(currentList);
  renderTypePills(scoped);
  const filtered = sortList(byType(scoped));

  catalogCount.textContent = filtered.length === 1 ? '1 asset trovato' : `${filtered.length} asset trovati`;
  if (!filtered.length) return fillGrid('<div class="ccard-empty">Nessun risultato.</div>');

  const groups = groupsOf(filtered);
  // Un gruppo solo (filtro di tipo attivo, o risultati tutti dello stesso
  // tipo): l'intestazione ripeterebbe quello che dicono già la pill accesa e
  // il conteggio qui sopra, quindi griglia piatta.
  if (!groupByType || groups.length < 2) {
    fillGrid('');
    filtered.forEach((a) => catalogGrid.appendChild(cardFor(a)));
    return;
  }

  catalogGrid.className = 'cgroups';
  catalogGrid.innerHTML = '';
  groups.forEach(([type, items]) => {
    const section = document.createElement('section');
    section.className = 'cgroup';
    section.innerHTML = `<h2 class="cgroup-head">${escapeHtml(TYPE_LABELS[type])}`
      + `<span class="cgroup-count">${items.length}</span></h2>`
      + '<div class="cgrid"></div>';
    const grid = section.querySelector('.cgrid');
    items.forEach((a) => grid.appendChild(cardFor(a)));
    catalogGrid.appendChild(section);
  });
}

function setBaseList(list) {
  currentList = list;
  renderFiltered();
}

export async function loadCatalog() {
  fillGrid(skeletonCards());
  try {
    catalogCache = await api.listAssets();
    setBaseList(catalogCache);
  } catch (e) {
    fillGrid(`<div class="ccard-empty">Errore nel caricamento: ${escapeHtml(e.message)}</div>`);
  }
}

async function runCatalogSearch() {
  const query = catalogSearch.value.trim();
  if (!query) return setBaseList(catalogCache);

  fillGrid(skeletonCards());
  try {
    if (deepToggle.checked) {
      // deepSearch ritorna {assetId, title, similarity}, non l'intera scheda
      // asset: si arricchisce incrociando con la cache già caricata.
      const results = await api.deepSearch(query);
      const byId = Object.fromEntries(catalogCache.map((a) => [a.ID, a]));
      setBaseList(results.map((r) => ({ ...(byId[r.assetId] || {}), ID: r.assetId, title: r.title, _similarity: r.similarity })));
    } else {
      setBaseList(await api.searchAssets(query));
    }
  } catch (e) {
    fillGrid(`<div class="ccard-empty">Errore nella ricerca: ${escapeHtml(e.message)}</div>`);
  }
}

// Riga sotto al titolo della modale: pallino + stato + tipo (mockup 622-626).
function tagsHtml(asset) {
  const ui = certUi(asset.certificationLevel);
  return `
    <div class="modal-cert-dot" style="background:${ui.dot}"></div>
    <div class="modal-cert-lbl" style="background:${ui.bg};color:${ui.color}">${ui.label}</div>
    <div class="modal-type-lbl">${TYPE_LABELS[asset.type] || asset.type || ''}</div>`;
}

// Pannello "cambia stato" inline: sostituisce la vecchia seconda modale.
// Parte nascosto, lo apre il bottone "Cambia stato" del footer.
function statusPanelHtml(asset) {
  const options = Object.entries(CERT_LABELS).map(([level, label]) => {
    const ui = CERT_UI[CERT_SLUG[level]];
    const selected = level === asset.certificationLevel ? ' selected' : '';
    return `<button type="button" class="status-opt${selected}" data-status="${level}">
      <span class="status-opt-dot" style="background:${ui.dot}"></span>${label}
    </button>`;
  }).join('');
  return `
    <div class="status-panel" id="m-status-panel" style="display:none">
      <div class="modal-section-lbl">Cambia stato</div>
      ${options}
      <label class="status-validity">Validità della certificazione (mesi)
        <input type="number" id="cert-validity" value="12" min="1">
      </label>
    </div>`;
}

export async function openAssetDetail(assetId) {
  modal.open({ title: 'Caricamento...', bodyHtml: '<div class="skel" style="height:120px"></div>' });
  try {
    const [asset, attachments] = await Promise.all([
      api.getAsset(assetId),
      api.getAttachments(assetId)
    ]);
    currentAsset = asset;

    // Qui gli allegati sono noti, quindi la percentuale è calcolata su un
    // criterio in più rispetto alla card (vedi computeCompleteness).
    const completeness = computeCompleteness(asset, attachments);
    // La riga "Autore" del mockup compare solo se c'è davvero un nome:
    // `uploadedBy` non è espansa dal servizio e senza login `createdBy`
    // vale 'anonymous' (vedi authorOf in utils.js).
    const author = authorOf(asset);

    const attachmentsHtml = attachments.length
      ? attachments.map((att) => `
          <div class="modal-att">
            <div>
              <div class="modal-att-name">${escapeHtml(att.filename)}</div>
              <div class="modal-att-meta">${escapeHtml(att.mimeType || '')} · scansione: ${escapeHtml(att.status || 'n/d')}</div>
            </div>
            <a class="modal-att-dl" href="${api.downloadAttachmentUrl(assetId, att.ID)}">Scarica</a>
          </div>`).join('')
      : '<div class="modal-empty">Nessun allegato.</div>';

    modal.open({
      title: asset.title,
      tagsHtml: tagsHtml(asset),
      bodyHtml: `
        <div class="modal-desc">${escapeHtml(asset.description) || 'Nessuna descrizione.'}</div>
        <div class="modal-fields">
          <div class="modal-field"><span class="modal-field-lbl">Caricato</span><span class="modal-field-val">${fmtDate(asset.createdAt)}</span></div>
          <div class="modal-field"><span class="modal-field-lbl">Certificato</span><span class="modal-field-val">${fmtDate(asset.certifiedAt)}</span></div>
          <div class="modal-field"><span class="modal-field-lbl">Scade</span><span class="modal-field-val">${fmtDate(asset.certificationExpiresAt)}</span></div>
          ${author ? `<div class="modal-field"><span class="modal-field-lbl">Autore</span><span class="modal-field-val">${escapeHtml(author)}</span></div>` : ''}
          <div class="modal-field"><span class="modal-field-lbl">Completezza</span><span class="modal-field-val">${completeness.pct}%</span></div>
        </div>
        ${asset.externalLink ? `<a class="modal-link" href="${escapeHtml(asset.externalLink)}" target="_blank" rel="noopener">${escapeHtml(asset.externalLink)} ↗</a>` : ''}
        <div class="modal-section-lbl">Allegati</div>
        ${attachmentsHtml}
        ${statusPanelHtml(asset)}
      `,
      footerButtons: [
        { label: 'Elimina', className: 'btn-danger', onClick: () => deleteAssetFlow(asset.ID, asset.title) },
        { label: 'Cambia stato', className: 'btn-ghost', onClick: toggleStatusPanel },
        { label: 'Chiudi', className: 'btn-primary', onClick: () => modal.close() }
      ]
    });

    modal.query('#m-status-panel').querySelectorAll('.status-opt').forEach((opt) => {
      opt.addEventListener('click', () => setStatus(opt));
    });
  } catch (e) {
    modal.open({ title: 'Errore', bodyHtml: `<div class="modal-desc" style="color:var(--red)">${escapeHtml(e.message)}</div>`, footerButtons: [{ label: 'Chiudi', className: 'btn-ghost', onClick: () => modal.close() }] });
  }
}

function toggleStatusPanel() {
  const panel = modal.query('#m-status-panel');
  if (!panel) return;
  // Il mockup rimette 'block'; qui il pannello è una colonna flex (ha un
  // gap fra le opzioni), quindi si riapre con il display che gli serve.
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

async function setStatus(optionEl) {
  if (!currentAsset) return;
  const certificationLevel = optionEl.dataset.status;
  const validityMonths = Number(modal.query('#cert-validity')?.value) || 12;
  try {
    await api.setCertificationLevel({ assetId: currentAsset.ID, certificationLevel, validityMonths });
    currentAsset.certificationLevel = certificationLevel;

    modal.query('#m-status-panel').querySelectorAll('.status-opt')
      .forEach((o) => o.classList.toggle('selected', o === optionEl));
    const ui = certUi(certificationLevel);
    const dot = modal.queryTag('.modal-cert-dot');
    const label = modal.queryTag('.modal-cert-lbl');
    if (dot) dot.style.background = ui.dot;
    if (label) { label.textContent = ui.label; label.style.background = ui.bg; label.style.color = ui.color; }

    toasts.show(`Stato aggiornato: ${ui.label}`, 'success');
    loadCatalog();
  } catch (e) {
    toasts.show(e.message, 'error');
  }
}

// Il mockup elimina senza chiedere niente; qui l'eliminazione è definitiva
// e porta con sé allegati e cronologia, quindi la conferma resta.
function deleteAssetFlow(assetId, title) {
  modal.open({
    title: 'Eliminare questo asset?',
    bodyHtml: `<div class="modal-desc">"${escapeHtml(title)}" verrà eliminato in modo definitivo, insieme ai suoi allegati e alla cronologia. L'azione non è reversibile.</div>`,
    variant: 'danger',
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: () => modal.close() },
      { label: 'Conferma', className: 'btn-danger', onClick: async () => {
        modal.close();
        try {
          await api.deleteAsset(assetId);
          toasts.show('Asset eliminato', 'success');
          loadCatalog();
        } catch (e) { toasts.show(e.message, 'error'); }
      } }
    ]
  });
}

export function initCatalogView() {
  document.getElementById('catalog-refresh').addEventListener('click', loadCatalog);
  let searchDebounce;
  catalogSearch.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runCatalogSearch, 350);
  });
  deepToggle.addEventListener('change', runCatalogSearch);

  catalogFilters.querySelectorAll('[data-filter-cert]').forEach((chip) => {
    chip.addEventListener('click', () => {
      certFilter = chip.dataset.filterCert;
      catalogFilters.querySelectorAll('[data-filter-cert]').forEach((c) => {
        c.classList.toggle('on', c === chip);
        // .on è solo colore: senza aria-pressed uno screen reader legge
        // cinque bottoni identici e non sa quale filtro è attivo.
        c.setAttribute('aria-pressed', String(c === chip));
      });
      renderFiltered();
    });
  });

  // Le pill di tipo sono rigenerate a ogni render (i conteggi cambiano):
  // l'ascoltatore sta sul contenitore, che invece non viene mai sostituito.
  catalogTypes.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter-type]');
    if (!chip) return;
    typeFilter = chip.dataset.filterType;
    renderFiltered();
  });

  groupToggle.addEventListener('click', () => {
    groupByType = !groupByType;
    groupToggle.classList.toggle('on', groupByType);
    groupToggle.setAttribute('aria-pressed', String(groupByType));
    renderFiltered();
  });

  catalogSortRow.querySelectorAll('[data-sort]').forEach((pill) => {
    pill.addEventListener('click', () => {
      sortMode = pill.dataset.sort;
      catalogSortRow.querySelectorAll('[data-sort]').forEach((p) => p.classList.toggle('on', p === pill));
      renderFiltered();
    });
  });
}
