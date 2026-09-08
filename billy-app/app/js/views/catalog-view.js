import { api } from '../api.js';
import { escapeHtml, fmtDate, TYPE_LABELS } from '../utils.js';
import '../components/billy-asset-card.js';
import '../components/billy-badge.js';

const catalogGrid = document.getElementById('catalog-grid');
const catalogSearch = document.getElementById('catalog-search');
const deepToggle = document.getElementById('deep-search-toggle');
const catalogSort = document.getElementById('catalog-sort');
const catalogFilters = document.getElementById('catalog-filters');
const catalogCount = document.getElementById('catalog-count');
const modal = document.getElementById('modal');
const toasts = document.getElementById('toast-container');

let catalogCache = [];
let currentList = [];
let certFilter = 'all';

function skeletonCards() {
  return Array.from({ length: 6 }).map(() => `<div class="card skeleton" style="height:110px"></div>`).join('');
}

// Filtro/ordinamento applicati lato client sulla lista già caricata: né il
// cambio filtro né il cambio ordinamento fanno una nuova chiamata API.
function applyFiltersAndSort(list) {
  let out = certFilter === 'all' ? list : list.filter((a) => a.certificationLevel === certFilter);
  out = [...out];
  if (catalogSort.value === 'alpha') {
    out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
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
    catalogGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <p class="empty-state-title">Nessun asset trovato</p>
      <p>Prova a modificare la ricerca o i filtri, oppure carica un nuovo asset.</p>
    </div>`;
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
    catalogGrid.innerHTML = `<div class="empty-state">Errore nel caricamento: ${escapeHtml(e.message)}</div>`;
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
    catalogGrid.innerHTML = `<div class="empty-state">Errore nella ricerca: ${escapeHtml(e.message)}</div>`;
  }
}

export async function openAssetDetail(assetId) {
  modal.open({ title: 'Caricamento...', bodyHtml: '<div class="skeleton" style="height:120px"></div>' });
  try {
    const [asset, attachments] = await Promise.all([
      api.getAsset(assetId),
      api.getAttachments(assetId)
    ]);

    const attachmentsHtml = attachments.length
      ? attachments.map((att) => `
          <div class="detail-attachment">
            <div>
              <div class="detail-attachment-name">${escapeHtml(att.filename)}</div>
              <div class="detail-attachment-meta">${att.mimeType || ''} · scansione: ${att.status || 'n/d'}</div>
            </div>
            <a class="btn btn-sm" href="${api.downloadAttachmentUrl(assetId, att.ID)}">Scarica</a>
          </div>`).join('')
      : '<p class="field-hint">Nessun allegato.</p>';

    modal.open({
      title: asset.title,
      bodyHtml: `
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:14px;">
          <billy-badge level="${asset.certificationLevel}"></billy-badge>
          <span class="type-tag">${TYPE_LABELS[asset.type] || asset.type}</span>
        </div>
        <p style="font-size:13.5px; color:var(--text-secondary); margin:0 0 16px;">${escapeHtml(asset.description) || 'Nessuna descrizione.'}</p>
        ${asset.externalLink ? `<p style="margin:0 0 16px;"><a href="${asset.externalLink}" target="_blank" style="color:var(--accent); font-size:13px;">${escapeHtml(asset.externalLink)} ↗</a></p>` : ''}
        <dl class="kv">
          <dt>Caricato</dt><dd>${fmtDate(asset.createdAt)}</dd>
          <dt>Certificato</dt><dd>${fmtDate(asset.certifiedAt)}</dd>
          <dt>Scade</dt><dd>${fmtDate(asset.certificationExpiresAt)}</dd>
        </dl>
        <p class="section-label" style="margin-top:18px;">Allegati</p>
        ${attachmentsHtml}
      `,
      footerButtons: [
        { label: 'Elimina', className: 'btn-danger', onClick: () => deleteAssetFlow(asset.ID, asset.title) },
        { label: 'Cambia stato', className: 'btn-ghost', onClick: () => setCertificationFlow(asset.ID) },
        { label: 'Chiudi', className: 'btn-primary', onClick: () => modal.close() }
      ]
    });
  } catch (e) {
    modal.open({ title: 'Errore', bodyHtml: `<p style="color:var(--danger)">${escapeHtml(e.message)}</p>`, footerButtons: [{ label: 'Chiudi', className: 'btn-ghost', onClick: () => modal.close() }] });
  }
}

function deleteAssetFlow(assetId, title) {
  modal.open({
    title: 'Eliminare questo asset?',
    bodyHtml: `<p style="color:var(--text-secondary); font-size:13.5px; margin:0;">"${escapeHtml(title)}" verrà eliminato in modo definitivo, insieme ai suoi allegati e alla cronologia. L'azione non è reversibile.</p>`,
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

function setCertificationFlow(assetId) {
  modal.open({
    title: 'Cambia stato di certificazione',
    bodyHtml: `
      <div class="field">
        <label>Nuovo stato</label>
        <select class="select" id="cert-level-select">
          <option value="certified">Certificato</option>
          <option value="certifiedOutdated">Scaduto</option>
          <option value="community">Community</option>
          <option value="deprecated">Ritirato</option>
        </select>
      </div>
      <div class="field">
        <label>Validità (mesi, solo se "Certificato")</label>
        <input class="input" id="cert-validity" type="number" value="12" min="1">
      </div>`,
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: () => modal.close() },
      { label: 'Applica', className: 'btn-primary', onClick: async () => {
        const certificationLevel = modal.query('#cert-level-select').value;
        const validityMonths = Number(modal.query('#cert-validity').value) || 12;
        try {
          await api.setCertificationLevel({ assetId, certificationLevel, validityMonths });
          toasts.show('Stato aggiornato', 'success');
          modal.close();
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
  catalogSort.addEventListener('change', renderFiltered);
  catalogFilters.querySelectorAll('[data-filter-cert]').forEach((chip) => {
    chip.addEventListener('click', () => {
      certFilter = chip.dataset.filterCert;
      catalogFilters.querySelectorAll('[data-filter-cert]').forEach((c) => c.classList.toggle('active', c === chip));
      renderFiltered();
    });
  });
}
