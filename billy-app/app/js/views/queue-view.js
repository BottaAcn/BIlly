import { api } from '../api.js';
import { escapeHtml, fmtDate, TYPE_LABELS } from '../utils.js';
import '../components/billy-queue-row.js';

const queueList = document.getElementById('queue-list');
const queueCountBadge = document.getElementById('queue-count');
const modal = document.getElementById('modal');
const toasts = document.getElementById('toast-container');

function updateQueueBadge(count) {
  if (count > 0) { queueCountBadge.textContent = count; queueCountBadge.style.display = 'inline-flex'; }
  else { queueCountBadge.style.display = 'none'; }
}

export async function refreshQueueCount() {
  try {
    const items = await api.listReviewQueue();
    updateQueueBadge(items.length);
  } catch (e) { /* silenzioso, non critico */ }
}

// Nuovi contenuti e rinnovi in scadenza sono processi diversi (un rinnovo
// non si rifiuta, si riusa l'ultima revisione approvata): separarli in due
// sezioni li rende distinguibili senza dover leggere l'etichetta su ogni riga.
function renderQueue(items) {
  queueList.innerHTML = '';
  if (!items.length) {
    queueList.innerHTML = `<div class="empty-state">
      <p class="empty-state-title">Coda vuota</p>
      <p>Nessun contenuto in attesa di revisione o rinnovo.</p>
    </div>`;
    return;
  }

  const groups = [
    { title: 'Nuovi contenuti', items: items.filter((i) => i.kind === 'revision') },
    { title: 'Rinnovi in scadenza', items: items.filter((i) => i.kind === 'renewal') }
  ];

  groups.forEach((group) => {
    if (!group.items.length) return;
    const section = document.createElement('div');
    section.className = 'queue-section';

    const heading = document.createElement('p');
    heading.className = 'queue-section-title';
    heading.textContent = `${group.title} (${group.items.length})`;
    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'row-list';
    group.items.forEach((item) => {
      const row = document.createElement('billy-queue-row');
      row.item = item;
      row.addEventListener('preview', (e) => previewFlow(e.detail.revisionId));
      row.addEventListener('approve', (e) => approveFlow(e.detail.revisionId));
      row.addEventListener('reject', (e) => rejectFlow(e.detail.revisionId));
      list.appendChild(row);
    });
    section.appendChild(list);
    queueList.appendChild(section);
  });
}

export async function loadQueue() {
  queueList.innerHTML = Array.from({ length: 3 }).map(() => `<div class="row skeleton" style="height:56px"></div>`).join('');
  try {
    const items = await api.listReviewQueue();
    renderQueue(items);
    updateQueueBadge(items.length);
  } catch (e) {
    queueList.innerHTML = `<div class="empty-state">Errore: ${escapeHtml(e.message)}</div>`;
  }
}

// Sola lettura: un certificatore deve poter vedere cosa sta approvando o
// rifiutando prima di decidere, non solo il titolo della riga.
async function previewFlow(revisionId) {
  modal.open({ title: 'Caricamento anteprima...', bodyHtml: '<div class="skeleton" style="height:120px"></div>' });
  try {
    const detail = await api.getRevisionDetail(revisionId);
    const attachmentsHtml = detail.attachments.length
      ? detail.attachments.map((att) => `
          <div class="detail-attachment">
            <div>
              <div class="detail-attachment-name">${escapeHtml(att.filename)}</div>
              <div class="detail-attachment-meta">${att.mimeType || ''}</div>
            </div>
          </div>`).join('')
      : '<p class="field-hint">Nessun allegato.</p>';

    modal.open({
      title: detail.title,
      bodyHtml: `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
          <span class="type-tag">${TYPE_LABELS[detail.type] || detail.type}</span>
          ${detail.submittedBy ? `<span class="row-meta">Inviato da ${escapeHtml(detail.submittedBy)} · ${fmtDate(detail.submittedAt)}</span>` : ''}
        </div>
        ${detail.description ? `<p style="font-size:13.5px; color:var(--text-secondary); margin:0 0 14px;">${escapeHtml(detail.description)}</p>` : ''}
        ${detail.externalLink ? `<p style="margin:0 0 14px;"><a href="${detail.externalLink}" target="_blank" style="color:var(--accent); font-size:13px;">${escapeHtml(detail.externalLink)} ↗</a></p>` : ''}
        <p class="section-label">Contenuto</p>
        <div style="white-space:pre-wrap; font-size:13px; line-height:1.6; max-height:280px; overflow-y:auto; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px;">${detail.content ? escapeHtml(detail.content) : '<span class="field-hint">Nessun testo incollato (solo allegato).</span>'}</div>
        <p class="section-label" style="margin-top:16px;">Allegati</p>
        ${attachmentsHtml}
      `,
      footerButtons: [
        { label: 'Chiudi', className: 'btn-primary', onClick: () => modal.close() }
      ]
    });
  } catch (e) {
    modal.open({ title: 'Errore', bodyHtml: `<p style="color:var(--danger)">${escapeHtml(e.message)}</p>`, footerButtons: [{ label: 'Chiudi', className: 'btn-ghost', onClick: () => modal.close() }] });
  }
}

function approveFlow(revisionId) {
  modal.open({
    title: 'Approva contenuto',
    bodyHtml: `
      <div class="field">
        <label>Validità certificazione (mesi)</label>
        <input class="input" id="approve-validity" type="number" value="12" min="1">
      </div>
      <div class="field">
        <label>% punti sulla certificazione (100 = prima certificazione)</label>
        <input class="input" id="approve-pct" type="number" value="100" min="0" max="100">
        <p class="field-hint">Percentuale dei punti assegnati all'autore rispetto a una prima certificazione piena: usa un valore più basso per revisioni minori o correzioni, 100 per un contenuto nuovo o sostanzialmente riscritto.</p>
      </div>`,
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: () => modal.close() },
      { label: 'Approva', className: 'btn-primary', onClick: async () => {
        const validityMonths = Number(modal.query('#approve-validity').value) || 12;
        const pointsPct = Number(modal.query('#approve-pct').value);
        try {
          await api.reviewRevision({ revisionId, approve: true, validityMonths, pointsPct });
          toasts.show('Approvato', 'success');
          modal.close();
          loadQueue();
        } catch (e) { toasts.show(e.message, 'error'); }
      } }
    ]
  });
}

function rejectFlow(revisionId) {
  modal.open({
    title: 'Rifiutare questo contenuto?',
    bodyHtml: `<p style="color:var(--text-secondary); font-size:13.5px; margin:0;">La revisione verrà segnata come rifiutata. Se era la prima proposta per questo asset, resterà non pubblicato.</p>`,
    variant: 'danger',
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: () => modal.close() },
      { label: 'Conferma', className: 'btn-danger', onClick: async () => {
        modal.close();
        try {
          await api.reviewRevision({ revisionId, approve: false });
          toasts.show('Contenuto rifiutato', 'success');
          loadQueue();
        } catch (e) { toasts.show(e.message, 'error'); }
      } }
    ]
  });
}

export function initQueueView() {
  refreshQueueCount();
}
