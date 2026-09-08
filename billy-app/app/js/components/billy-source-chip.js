import './billy-badge.js';
import { escapeHtml } from '../utils.js';

// <billy-source-chip> — citazione in una risposta di Billy.
// Proprietà (impostate via JS, non attributi, per evitare stringhe/numeri
// scomodi negli attributi HTML): .data = { assetId, title, similarity, certificationLevel, link }
// Evento emesso: 'open-asset' (bubbles), detail: { assetId }
class BillySourceChip extends HTMLElement {
  set data(value) {
    this._data = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('source-chip');
    this.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this._data) return;
      this.dispatchEvent(new CustomEvent('open-asset', {
        bubbles: true,
        detail: { assetId: this._data.assetId }
      }));
    });
    if (this._data) this.render();
  }

  render() {
    if (!this.isConnected || !this._data) return;
    const { title, similarity, certificationLevel } = this._data;
    this.innerHTML = `
      <billy-badge level="${certificationLevel}"></billy-badge>
      <span class="source-chip-title">${escapeHtml(title)}</span>
      <span class="source-chip-sim">${similarity.toFixed(2)}</span>
    `;
  }
}

customElements.define('billy-source-chip', BillySourceChip);
