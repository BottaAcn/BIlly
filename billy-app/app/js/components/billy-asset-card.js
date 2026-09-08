import './billy-badge.js';
import { escapeHtml, TYPE_LABELS } from '../utils.js';

// <billy-asset-card> — card nella griglia del catalogo.
// Proprietà: .asset = { ID, title, description, type, certificationLevel, _similarity? }
// Evento emesso: 'open' (bubbles), detail: { assetId }
class BillyAssetCard extends HTMLElement {
  set asset(value) {
    this._asset = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('card');
    this.addEventListener('click', () => {
      if (!this._asset) return;
      this.dispatchEvent(new CustomEvent('open', { bubbles: true, detail: { assetId: this._asset.ID } }));
    });
    if (this._asset) this.render();
  }

  render() {
    if (!this.isConnected || !this._asset) return;
    const a = this._asset;
    this.innerHTML = `
      <div class="card-top">
        <div>
          <p class="type-tag">${TYPE_LABELS[a.type] || a.type || 'documento'}</p>
          <p class="card-title">${escapeHtml(a.title)}</p>
        </div>
      </div>
      <p class="card-desc">${escapeHtml(a.description) || 'Nessuna descrizione.'}</p>
      <div class="card-footer">
        <billy-badge level="${a.certificationLevel}"></billy-badge>
        ${a._similarity != null ? `<span class="source-chip-sim">${a._similarity.toFixed(2)}</span>` : ''}
      </div>
    `;
  }
}

customElements.define('billy-asset-card', BillyAssetCard);
