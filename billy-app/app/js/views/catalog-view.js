import { api } from '../api.js';
import {
  escapeHtml, fmtDate, TYPE_LABELS, CERT_LABELS, CERT_SLUG, CERT_UI, certUi,
  computeCompleteness, authorOf
} from '../utils.js';
import '../components/billy-asset-card.js';
import '../components/billy-badge.js';

const catalogGrid = document.getElementById('catalog-grid');
const catalogSearch = document.getElementById('catalog-search');
const deepToggle = document.getElementById('deep-search-toggle');
const catalogSortRow = document.getElementById('catalog-sort');
const catalogFilters = document.getElementById('catalog-filters');
const catalogCount = document.getElementById('catalog-count');
const modal = document.getElementById('modal');
const toasts = document.getElementById('toast-container');

let catalogCache = [];
let currentList = [];
let certFilter = 'all';
let sortMode = 'recent';
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

// Filtro/ordinamento applicati lato client sulla lista già caricata: né il
// cambio filtro né il cambio ordinamento fanno una nuova chiamata API.
function applyFiltersAndSort(list) {
  let out = certFilter === 'all' ? list : list.filter((a) => a.certificationLevel === certFilter);
  out = [...out];
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

function renderFiltered() {
  const filtered = applyFiltersAndSort(currentList);
  catalogCount.textContent = filtered.length === 1 ? '1 asset trovato' : `${filtered.length} asset trovati`;
  catalogGrid.innerHTML = '';
  if (!filtered.length) {
    catalogGrid.innerHTML = '<div class="ccard-empty">Nessun risultato.</div>';
    return;
  }
  filtered.forEach((a) => {
    const card = document.createElement('billy-asset-card');
    card.asset = a;
    card.addEventListener('open', (e) => openAssetDetail(e.detail.assetId));
    catalogGrid.appendChild(card);
  });
}

function setBaseList(list) {
  currentList = list;
  renderFiltered();
}

export async function loadCatalog() {
  catalogGrid.innerHTML = skeletonCards();
  try {
    catalogCache = await api.listAssets();
    setBaseList(catalogCache);
  } catch (e) {
    catalogGrid.innerHTML = `<div class="ccard-empty">Errore nel caricamento: ${escapeHtml(e.message)}</div>`;
  }
}

async function runCatalogSearch() {
  const query = catalogSearch.value.trim();
  if (!query) return setBaseList(catalogCache);

  catalogGrid.innerHTML = skeletonCards();
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
    catalogGrid.innerHTML = `<div class="ccard-empty">Errore nella ricerca: ${escapeHtml(e.message)}</div>`;
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
      catalogFilters.querySelectorAll('[data-filter-cert]').forEach((c) => c.classList.toggle('on', c === chip));
      renderFiltered();
    });
  });

  catalogSortRow.querySelectorAll('[data-sort]').forEach((pill) => {
    pill.addEventListener('click', () => {
      sortMode = pill.dataset.sort;
      catalogSortRow.querySelectorAll('[data-sort]').forEach((p) => p.classList.toggle('on', p === pill));
      renderFiltered();
    });
  });
}
