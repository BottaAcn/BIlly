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
// non si rifiuta, si riusa l'ultima revisione approvata): l'icona tonda del
// mockup li distingue a colpo d'occhio, l'intestazione di gruppo dice quale
// regola vale per quel blocco.
function renderQueue(items) {
  queueList.innerHTML = '';
  if (!items.length) {
    queueList.innerHTML = '<div class="qempty">Nessun elemento in coda</div>';
    return;
  }

  const groups = [
    { title: 'Nuovi contenuti', items: items.filter((i) => i.kind === 'revision') },
    { title: 'Rinnovi in scadenza', items: items.filter((i) => i.kind === 'renewal') }
  ];

  groups.forEach((group) => {
    if (!group.items.length) return;
    const section = document.createElement('div');
    section.className = 'qgroup';

    const heading = document.createElement('p');
    heading.className = 'qgroup-title';
    heading.textContent = `${group.title} (${group.items.length})`;
    section.appendChild(heading);

    group.items.forEach((item) => {
      const row = document.createElement('billy-queue-row');
      row.item = item;
      row.addEventListener('preview', (e) => previewFlow(e.detail.revisionId));
      row.addEventListener('approve', (e) => approveFlow(e.detail.revisionId));
      row.addEventListener('reject', (e) => rejectFlow(e.detail.revisionId));
      section.appendChild(row);
    });
    queueList.appendChild(section);
  });
}

export async function loadQueue() {
  queueList.innerHTML = Array.from({ length: 3 })
    .map(() => '<div class="skel" style="height:58px;border-radius:12px;margin-bottom:8px"></div>').join('');
  try {
    const items = await api.listReviewQueue();
    renderQueue(items);
    updateQueueBadge(items.length);
  } catch (e) {
    queueList.innerHTML = `<div class="qempty">Errore: ${escapeHtml(e.message)}</div>`;
  }
}

// Sola lettura: un certificatore deve poter vedere cosa sta approvando o
// rifiutando prima di decidere, non solo il titolo della riga.
async function previewFlow(revisionId) {
  modal.open({ title: 'Caricamento anteprima...', bodyHtml: '<div class="skel" style="height:120px"></div>' });
  try {
    const detail = await api.getRevisionDetail(revisionId);
    const attachmentsHtml = detail.attachments.length
      ? detail.attachments.map((att) => `
          <div class="modal-att">
            <div>
              <div class="modal-att-name">${escapeHtml(att.filename)}</div>
              <div class="modal-att-meta">${escapeHtml(att.mimeType || '')}</div>
            </div>
          </div>`).join('')
      : '<div class="modal-empty">Nessun allegato.</div>';

    modal.open({
      title: detail.title,
      tagsHtml: `
        <div class="modal-type-lbl">${TYPE_LABELS[detail.type] || detail.type || ''}</div>
        ${detail.submittedBy ? `<div class="modal-field-lbl" style="font-size:12px">Inviato da ${escapeHtml(detail.submittedBy)} · ${fmtDate(detail.submittedAt)}</div>` : ''}`,
      bodyHtml: `
        ${detail.description ? `<div class="modal-desc">${escapeHtml(detail.description)}</div>` : ''}
        ${detail.externalLink ? `<a class="modal-link" href="${escapeHtml(detail.externalLink)}" target="_blank" rel="noopener">${escapeHtml(detail.externalLink)} ↗</a>` : ''}
        <div class="modal-section-lbl">Contenuto</div>
        <div class="modal-pre">${detail.content ? escapeHtml(detail.content) : 'Nessun testo incollato (solo allegato).'}</div>
        <div class="modal-section-lbl">Allegati</div>
        ${attachmentsHtml}
      `,
      footerButtons: [
        { label: 'Chiudi', className: 'btn-primary', onClick: () => modal.close() }
      ]
    });
  } catch (e) {
    modal.open({ title: 'Errore', bodyHtml: `<div class="modal-desc" style="color:var(--red)">${escapeHtml(e.message)}</div>`, footerButtons: [{ label: 'Chiudi', className: 'btn-ghost', onClick: () => modal.close() }] });
  }
}

function approveFlow(revisionId) {
  modal.open({
    title: 'Approva contenuto',
    bodyHtml: `
      <label class="status-validity">Validità certificazione (mesi)
        <input type="number" id="approve-validity" value="12" min="1">
      </label>
      <label class="status-validity">% punti sulla certificazione
        <input type="number" id="approve-pct" value="100" min="0" max="100">
      </label>
      <div class="modal-empty">Percentuale dei punti assegnati all'autore rispetto a una prima certificazione piena: usa un valore più basso per revisioni minori o correzioni, 100 per un contenuto nuovo o sostanzialmente riscritto.</div>`,
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: () => modal.close() },
      { label: 'Approva', className: 'btn-primary', onClick: async () => {
        const validityMonths = Number(modal.query('#approve-validity').value) || 12;
        const pointsPct = Number(modal.query('#approve-pct').value);
        try {
          await api.reviewRevision({ revisionId, approve: true, validityMonths, pointsPct });
          toasts.show('Asset approvato e pubblicato', 'success');
          modal.close();
          loadQueue();
        } catch (e) { toasts.show(e.message, 'error'); }
      } }
    ]
  });
}

// Il mockup rifiuta con un click secco; qui il rifiuto blocca la
// pubblicazione di un contenuto altrui, quindi la conferma resta.
function rejectFlow(revisionId) {
  modal.open({
    title: 'Rifiutare questo contenuto?',
    bodyHtml: '<div class="modal-desc">La revisione verrà segnata come rifiutata. Se era la prima proposta per questo asset, resterà non pubblicato.</div>',
    variant: 'danger',
    footerButtons: [
      { label: 'Annulla', className: 'btn-ghost', onClick: () => modal.close() },
      { label: 'Conferma', className: 'btn-danger', onClick: async () => {
        modal.close();
        try {
          await api.reviewRevision({ revisionId, approve: false });
          toasts.show('Asset rifiutato', 'success');
          loadQueue();
        } catch (e) { toasts.show(e.message, 'error'); }
      } }
    ]
  });
}

export function initQueueView() {
  refreshQueueCount();
}
