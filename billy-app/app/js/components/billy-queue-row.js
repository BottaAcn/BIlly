import { escapeHtml, fmtDate, TYPE_LABELS } from '../utils.js';

// <billy-queue-row> — riga nella coda di revisione.
// Proprietà: .item = { kind: 'revision'|'renewal', revisionId, assetId, title, type, submittedBy, submittedAt }
// Eventi emessi: 'approve' e 'reject' (bubbles), detail: { revisionId }
// "Rifiuta" non compare per kind==='renewal' (stessa regola del backend: un
// rinnovo non si rifiuta, si deprecare esplicitamente altrove).
class BillyQueueRow extends HTMLElement {
  set item(value) {
    this._item = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('row');
    if (this._item) this.render();
  }

  render() {
    if (!this.isConnected || !this._item) return;
    const item = this._item;
    this.innerHTML = `
      <span class="kind-tag kind-${item.kind}">${item.kind === 'renewal' ? 'Rinnovo' : 'Nuovo'}</span>
      <div class="row-main">
        <p class="row-title">${escapeHtml(item.title)} <span class="type-tag">${TYPE_LABELS[item.type] || item.type || ''}</span></p>
        <p class="row-meta">${item.submittedBy ? `Inviato da ${escapeHtml(item.submittedBy)} · ${fmtDate(item.submittedAt)}` : 'Certificazione scaduta, in attesa di rinnovo'}</p>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm btn-primary" data-action="approve">Approva</button>
        ${item.kind === 'revision' ? `<button class="btn btn-sm btn-danger" data-action="reject">Rifiuta</button>` : ''}
      </div>
    `;
    this.querySelector('[data-action="approve"]').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('approve', { bubbles: true, detail: { revisionId: item.revisionId } }));
    });
    const rejectBtn = this.querySelector('[data-action="reject"]');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('reject', { bubbles: true, detail: { revisionId: item.revisionId } }));
      });
    }
  }
}

customElements.define('billy-queue-row', BillyQueueRow);
