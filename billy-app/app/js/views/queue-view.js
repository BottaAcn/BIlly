import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
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

function renderQueue(items) {
  queueList.innerHTML = '';
  if (!items.length) {
    queueList.innerHTML = `<div class="empty-state">
      <p class="empty-state-title">Coda vuota</p>
      <p>Nessun contenuto in attesa di revisione o rinnovo.</p>
    </div>`;
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('billy-queue-row');
    row.item = item;
    row.addEventListener('approve', (e) => approveFlow(e.detail.revisionId));
    row.addEventListener('reject', (e) => rejectFlow(e.detail.revisionId));
    queueList.appendChild(row);
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
