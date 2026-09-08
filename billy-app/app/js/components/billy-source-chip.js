import './billy-badge.js';
import { escapeHtml, fmtSimilarity } from '../utils.js';

// <billy-source-chip> — citazione in una risposta di Billy.
// Proprietà (impostate via JS, non attributi, per evitare stringhe/numeri
// scomodi negli attributi HTML): .data = { assetId, title, similarity, certificationLevel, link }
// Evento emesso: 'open-asset' (bubbles), detail: { assetId }
// role="button"/tabindex/keydown: è un <div> reso interattivo via JS, senza
// questo non sarebbe raggiungibile né attivabile da tastiera.
class BillySourceChip extends HTMLElement {
  set data(value) {
    this._data = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('source-chip');
    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');
    this.addEventListener('click', (e) => {
      e.preventDefault();
      this.open();
    });
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      }
    });
    if (this._data) this.render();
  }

  open() {
    if (!this._data) return;
    this.dispatchEvent(new CustomEvent('open-asset', {
      bubbles: true,
      detail: { assetId: this._data.assetId }
    }));
  }

  render() {
    if (!this.isConnected || !this._data) return;
    const { title, similarity, certificationLevel } = this._data;
    this.setAttribute('aria-label', `Apri fonte: ${title}`);
    this.innerHTML = `
      <billy-badge level="${certificationLevel}"></billy-badge>
      <span class="source-chip-title">${escapeHtml(title)}</span>
      <span class="similarity-pill">${fmtSimilarity(similarity)}</span>
    `;
  }
}

customElements.define('billy-source-chip', BillySourceChip);
