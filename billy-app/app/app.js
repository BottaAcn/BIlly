// Billy — frontend v0 (non definitivo). Vanilla JS, nessun build step:
// vedi doc/V1/external-brief/API-CONTRACT.md per il contratto esatto.
// Le chiavi JSON NON sono uniformi tra endpoint (ID vs assetId per lo
// stesso concetto) — gestito esplicitamente sotto, non è un refuso.

const CERT_LABELS = {
  certified: 'Certificato',
  certifiedOutdated: 'Scaduto',
  community: 'Community',
  deprecated: 'Ritirato'
};

const TYPE_LABELS = {
  document: 'Documento', skill: 'Skill', tool: 'Tool',
  application: 'Applicazione', interface: 'Interfaccia', other: 'Altro'
};

// --------------------------------------------------------------- helpers

function badgeHtml(level) {
  const l = level || 'community';
  return `<span class="badge badge-${l}">${CERT_LABELS[l] || l}</span>`;
}

function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* risposta non-JSON (es. download binario) */ }
  if (!res.ok) {
    const msg = data?.error?.message || `Errore ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------- modal

function openModal({ title, bodyHtml, footerButtons = [] }) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = '';
  footerButtons.forEach((btn) => {
    const b = document.createElement('button');
    b.className = `btn ${btn.className || ''}`;
    b.textContent = btn.label;
    b.onclick = btn.onClick;
    footer.appendChild(b);
  });
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

function confirmModal(title, message, onConfirm) {
  openModal({
    title,
    bodyHtml: `<p style="color:var(--text-secondary); font-size:13.5px; margin:0;">${message}</p>`,
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: closeModal },
      { label: 'Conferma', className: 'btn-danger', onClick: () => { closeModal(); onConfirm(); } }
    ]
  });
}

// ------------------------------------------------------------- nav/views

const views = ['chat', 'catalog', 'upload', 'queue'];
function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === name);
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  if (name === 'catalog') loadCatalog();
  if (name === 'queue') loadQueue();
}
document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// Link "interni" generati da Billy (/catalog/asset/<id>) — non è una vera
// route server-side, viene intercettato per aprire la vista catalogo +
// dettaglio invece di far navigare il browser (che risulterebbe in 404).
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-internal-asset]');
  if (!link) return;
  e.preventDefault();
  showView('catalog');
  openAssetDetail(link.dataset.internalAsset);
});

// ====================================================================
// CHAT
// ====================================================================

const chatInput = document.getElementById('chat-input');
const chatThread = document.getElementById('chat-thread');
const chatEmpty = document.getElementById('chat-empty');
const chatSend = document.getElementById('chat-send');

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});
chatSend.addEventListener('click', sendChatMessage);

function appendChatMessage({ role, html, thinking }) {
  if (chatEmpty.style.display !== 'none') chatEmpty.style.display = 'none';
  chatThread.style.display = 'block';

  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${role}`;
  wrap.innerHTML = `
    <div class="chat-msg-avatar">${role === 'user' ? 'Tu' : 'B'}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-name">${role === 'user' ? 'Tu' : 'Billy'}</div>
      <div class="chat-msg-text">${html}</div>
    </div>`;
  chatThread.appendChild(wrap);
  chatThread.scrollTop = chatThread.scrollHeight;
  return wrap;
}

async function sendChatMessage() {
  const question = chatInput.value.trim();
  if (!question) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  appendChatMessage({ role: 'user', html: `<p>${escapeHtml(question)}</p>` });

  const thinkingMsg = appendChatMessage({
    role: 'billy',
    html: `<div class="chat-thinking"><span></span><span></span><span></span><span class="chat-thinking-label">Billy sta pensando...</span></div>`
  });

  try {
    const data = await api('/rest/billy/askBilly', { method: 'POST', body: { question } });
    const answerHtml = marked.parse(data.answer || '');
    const sourcesHtml = (data.sources || []).length
      ? `<div class="chat-sources">${data.sources.map((s) => `
          <a href="${s.link}" data-internal-asset="${s.assetId}" class="source-chip">
            ${badgeHtml(s.certificationLevel)}
            <span class="source-chip-title">${escapeHtml(s.title)}</span>
            <span class="source-chip-sim">${s.similarity.toFixed(2)}</span>
          </a>`).join('')}</div>`
      : '';
    thinkingMsg.querySelector('.chat-msg-text').innerHTML = answerHtml + sourcesHtml;
  } catch (e) {
    thinkingMsg.querySelector('.chat-msg-text').innerHTML =
      `<p style="color:var(--danger)">Errore: ${escapeHtml(e.message)}</p>`;
  }
  chatThread.scrollTop = chatThread.scrollHeight;
}

// ====================================================================
// CATALOG
// ====================================================================

const catalogGrid = document.getElementById('catalog-grid');
const catalogSearch = document.getElementById('catalog-search');
const deepToggle = document.getElementById('deep-search-toggle');
let catalogCache = [];

document.getElementById('catalog-refresh').addEventListener('click', loadCatalog);
let searchDebounce;
catalogSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runCatalogSearch, 350);
});
deepToggle.addEventListener('change', runCatalogSearch);

async function loadCatalog() {
  catalogGrid.innerHTML = skeletonCards();
  try {
    catalogCache = await api('/rest/catalog/Asset');
    renderCatalog(catalogCache);
  } catch (e) {
    catalogGrid.innerHTML = `<div class="empty-state">Errore nel caricamento: ${escapeHtml(e.message)}</div>`;
  }
}

async function runCatalogSearch() {
  const query = catalogSearch.value.trim();
  if (!query) return renderCatalog(catalogCache);

  catalogGrid.innerHTML = skeletonCards();
  try {
    if (deepToggle.checked) {
      // deepSearch ritorna {assetId, title, similarity} — non l'intera scheda
      // asset, quindi si arricchisce incrociando con la cache già caricata.
      const results = await api(`/rest/catalog/deepSearch?query=${encodeURIComponent(query)}`);
      const byId = Object.fromEntries(catalogCache.map((a) => [a.ID, a]));
      renderCatalog(results.map((r) => ({ ...(byId[r.assetId] || {}), ID: r.assetId, title: r.title, _similarity: r.similarity }))
        .filter((a) => a.title));
    } else {
      const results = await api(`/rest/catalog/searchAssets?query=${encodeURIComponent(query)}`);
      renderCatalog(results);
    }
  } catch (e) {
    catalogGrid.innerHTML = `<div class="empty-state">Errore nella ricerca: ${escapeHtml(e.message)}</div>`;
  }
}

function skeletonCards() {
  return Array.from({ length: 6 }).map(() => `<div class="card skeleton" style="height:110px"></div>`).join('');
}

function renderCatalog(assets) {
  if (!assets.length) {
    catalogGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <p class="empty-state-title">Nessun asset trovato</p>
      <p>Prova a modificare la ricerca, oppure carica un nuovo asset.</p>
    </div>`;
    return;
  }
  catalogGrid.innerHTML = assets.map((a) => `
    <div class="card" data-open-asset="${a.ID}">
      <div class="card-top">
        <div>
          <p class="type-tag">${TYPE_LABELS[a.type] || a.type || 'documento'}</p>
          <p class="card-title">${escapeHtml(a.title)}</p>
        </div>
      </div>
      <p class="card-desc">${escapeHtml(a.description) || 'Nessuna descrizione.'}</p>
      <div class="card-footer">
        ${badgeHtml(a.certificationLevel)}
        ${a._similarity != null ? `<span class="source-chip-sim">${a._similarity.toFixed(2)}</span>` : ''}
      </div>
    </div>
  `).join('');

  catalogGrid.querySelectorAll('[data-open-asset]').forEach((card) => {
    card.addEventListener('click', () => openAssetDetail(card.dataset.openAsset));
  });
}

async function openAssetDetail(assetId) {
  openModal({ title: 'Caricamento...', bodyHtml: '<div class="skeleton" style="height:120px"></div>', footerButtons: [] });
  try {
    const [asset, attachments] = await Promise.all([
      api(`/rest/catalog/Asset/${assetId}`),
      api(`/rest/catalog/Asset/${assetId}/attachments`).catch(() => [])
    ]);

    const attachmentsHtml = attachments.length
      ? attachments.map((att) => `
          <div class="detail-attachment">
            <div>
              <div class="detail-attachment-name">${escapeHtml(att.filename)}</div>
              <div class="detail-attachment-meta">${att.mimeType || ''} · scansione: ${att.status || 'n/d'}</div>
            </div>
            <a class="btn btn-sm" href="/rest/catalog/downloadAttachment?assetId=${assetId}&attachmentId=${att.ID}">Scarica</a>
          </div>`).join('')
      : '<p class="field-hint">Nessun allegato.</p>';

    openModal({
      title: asset.title,
      bodyHtml: `
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:14px;">
          ${badgeHtml(asset.certificationLevel)}
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
        { label: 'Chiudi', className: 'btn-primary', onClick: closeModal }
      ]
    });
  } catch (e) {
    openModal({ title: 'Errore', bodyHtml: `<p style="color:var(--danger)">${escapeHtml(e.message)}</p>`, footerButtons: [{ label: 'Chiudi', className: 'btn-ghost', onClick: closeModal }] });
  }
}

function deleteAssetFlow(assetId, title) {
  confirmModal('Eliminare questo asset?', `"${escapeHtml(title)}" verrà eliminato in modo definitivo, insieme ai suoi allegati e alla cronologia. L'azione non è reversibile.`, async () => {
    try {
      await api('/rest/catalog/deleteAsset', { method: 'POST', body: { assetId } });
      toast('Asset eliminato', 'success');
      loadCatalog();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

function setCertificationFlow(assetId) {
  openModal({
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
      { label: 'Annulla', className: 'btn-ghost', onClick: closeModal },
      { label: 'Applica', className: 'btn-primary', onClick: async () => {
        const certificationLevel = document.getElementById('cert-level-select').value;
        const validityMonths = Number(document.getElementById('cert-validity').value) || 12;
        try {
          await api('/rest/catalog/setCertificationLevel', { method: 'POST', body: { assetId, certificationLevel, validityMonths } });
          toast('Stato aggiornato', 'success');
          closeModal();
          loadCatalog();
        } catch (e) { toast(e.message, 'error'); }
      } }
    ]
  });
}

// ====================================================================
// UPLOAD
// ====================================================================

document.querySelectorAll('[data-content-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-content-tab]').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isText = tab.dataset.contentTab === 'text';
    document.getElementById('content-tab-text').style.display = isText ? 'block' : 'none';
    document.getElementById('content-tab-file').style.display = isText ? 'none' : 'block';
  });
});

const fileInput = document.getElementById('up-file');
const fileDropLabel = document.getElementById('file-drop-label');
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (f) {
    document.getElementById('file-drop-text').textContent = `Selezionato: ${f.name}`;
    fileDropLabel.classList.add('has-file');
  }
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('upload-submit');
  const alertBox = document.getElementById('upload-alert');
  alertBox.innerHTML = '';

  const title = document.getElementById('up-title').value.trim();
  const description = document.getElementById('up-description').value.trim();
  const type = document.getElementById('up-type').value;
  const externalLink = document.getElementById('up-link').value.trim();
  const isTextTab = document.querySelector('[data-content-tab].active').dataset.contentTab === 'text';
  const content = isTextTab ? document.getElementById('up-content').value.trim() : '';
  const file = !isTextTab ? fileInput.files[0] : null;

  if (!title) { alertBox.innerHTML = `<div class="alert alert-error">Il titolo è obbligatorio.</div>`; return; }
  if (!content && !file) { alertBox.innerHTML = `<div class="alert alert-error">Fornisci un testo oppure un file.</div>`; return; }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Caricamento...`;
  try {
    const body = { title, description, type, content, externalLink };
    if (file) {
      body.fileContent = await readFileAsBase64(file);
      body.fileName = file.name;
      body.fileMimeType = file.type;
    }
    await api('/rest/catalog/uploadAsset', { method: 'POST', body });
    alertBox.innerHTML = `<div class="alert alert-success">Asset caricato: è in coda di revisione, non ancora visibile nel catalogo.</div>`;
    e.target.reset();
    document.getElementById('file-drop-text').textContent = 'Trascina un file qui o clicca per selezionarlo (PDF, DOCX, TXT)';
    fileDropLabel.classList.remove('has-file');
    refreshQueueCount();
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Carica (va in revisione)';
  }
});

// ====================================================================
// REVIEW QUEUE
// ====================================================================

const queueList = document.getElementById('queue-list');

async function loadQueue() {
  queueList.innerHTML = Array.from({ length: 3 }).map(() => `<div class="row skeleton" style="height:56px"></div>`).join('');
  try {
    const items = await api('/rest/catalog/listReviewQueue');
    renderQueue(items);
    updateQueueBadge(items.length);
  } catch (e) {
    queueList.innerHTML = `<div class="empty-state">Errore: ${escapeHtml(e.message)}</div>`;
  }
}

async function refreshQueueCount() {
  try {
    const items = await api('/rest/catalog/listReviewQueue');
    updateQueueBadge(items.length);
  } catch (e) { /* silenzioso, non critico */ }
}

function updateQueueBadge(count) {
  const el = document.getElementById('queue-count');
  if (count > 0) { el.textContent = count; el.style.display = 'inline-flex'; }
  else { el.style.display = 'none'; }
}

function renderQueue(items) {
  if (!items.length) {
    queueList.innerHTML = `<div class="empty-state">
      <p class="empty-state-title">Coda vuota</p>
      <p>Nessun contenuto in attesa di revisione o rinnovo.</p>
    </div>`;
    return;
  }
  queueList.innerHTML = items.map((item) => `
    <div class="row">
      <span class="kind-tag kind-${item.kind}">${item.kind === 'renewal' ? 'Rinnovo' : 'Nuovo'}</span>
      <div class="row-main">
        <p class="row-title">${escapeHtml(item.title)} <span class="type-tag">${TYPE_LABELS[item.type] || item.type || ''}</span></p>
        <p class="row-meta">${item.submittedBy ? `Inviato da ${escapeHtml(item.submittedBy)} · ${fmtDate(item.submittedAt)}` : 'Certificazione scaduta, in attesa di rinnovo'}</p>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm btn-primary" data-approve="${item.revisionId}">Approva</button>
        ${item.kind === 'revision' ? `<button class="btn btn-sm btn-danger" data-reject="${item.revisionId}">Rifiuta</button>` : ''}
      </div>
    </div>
  `).join('');

  queueList.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', () => approveFlow(btn.dataset.approve));
  });
  queueList.querySelectorAll('[data-reject]').forEach((btn) => {
    btn.addEventListener('click', () => rejectFlow(btn.dataset.reject));
  });
}

function approveFlow(revisionId) {
  openModal({
    title: 'Approva contenuto',
    bodyHtml: `
      <div class="field">
        <label>Validità certificazione (mesi)</label>
        <input class="input" id="approve-validity" type="number" value="12" min="1">
      </div>
      <div class="field">
        <label>% punti sulla certificazione (100 = prima certificazione)</label>
        <input class="input" id="approve-pct" type="number" value="100" min="0" max="100">
      </div>`,
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: closeModal },
      { label: 'Approva', className: 'btn-primary', onClick: async () => {
        const validityMonths = Number(document.getElementById('approve-validity').value) || 12;
        const pointsPct = Number(document.getElementById('approve-pct').value);
        try {
          await api('/rest/catalog/reviewRevision', { method: 'POST', body: { revisionId, approve: true, validityMonths, pointsPct } });
          toast('Approvato', 'success');
          closeModal();
          loadQueue();
        } catch (e) { toast(e.message, 'error'); }
      } }
    ]
  });
}

function rejectFlow(revisionId) {
  confirmModal('Rifiutare questo contenuto?', 'La revisione verrà segnata come rifiutata. Se era la prima proposta per questo asset, resterà non pubblicato.', async () => {
    try {
      await api('/rest/catalog/reviewRevision', { method: 'POST', body: { revisionId, approve: false } });
      toast('Contenuto rifiutato', 'success');
      loadQueue();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ------------------------------------------------------------------ init
refreshQueueCount();
