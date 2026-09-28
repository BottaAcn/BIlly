import { escapeHtml, fmtDate, TYPE_LABELS, IC_CLOCK, IC_ALERT } from '../utils.js';

// <billy-queue-row> — riga nella coda di revisione (.qrow del mockup).
// Proprietà: .item = { kind: 'revision'|'renewal', revisionId, assetId, title, type, submittedBy, submittedAt }
// Eventi emessi: 'preview', 'approve' e 'reject' (bubbles), detail: { revisionId }
// L'icona tonda distingue i due flussi come nel mockup: orologio viola per
// un contenuto nuovo che aspetta la prima approvazione, allerta rossa per
// una certificazione scaduta da rinnovare.
// "Rifiuta" non compare per kind==='renewal' (stessa regola del backend: un
// rinnovo non si rifiuta, si deprecare esplicitamente altrove).
class BillyQueueRow extends HTMLElement {
  set item(value) {
    this._item = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('qrow');
    if (this._item) this.render();
  }

  render() {
    if (!this.isConnected || !this._item) return;
    const item = this._item;
    const isRenewal = item.kind === 'renewal';
    const meta = isRenewal
      ? 'Certificazione scaduta · in attesa di rinnovo'
      : `${item.submittedBy ? `${escapeHtml(item.submittedBy)} · ` : ''}${fmtDate(item.submittedAt)}`;

    this.innerHTML = `
      <div class="qico ${isRenewal ? 'e' : 'n'}">${isRenewal ? IC_ALERT : IC_CLOCK}</div>
      <div class="qtxt">
        <div class="qname">${escapeHtml(item.title)}</div>
        <div class="qmeta">${TYPE_LABELS[item.type] || item.type || ''} · ${meta}</div>
      </div>
      <div class="qbtns">
        <button class="qbtn" type="button" data-action="preview">Anteprima</button>
        ${isRenewal ? '' : '<button class="qbtn" type="button" data-action="reject">Rifiuta</button>'}
        <button class="qbtn ok" type="button" data-action="approve">Approva</button>
      </div>
    `;

    this.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent(btn.dataset.action, {
          bubbles: true, detail: { revisionId: item.revisionId }
        }));
      });
    });
  }
}

customElements.define('billy-queue-row', BillyQueueRow);
