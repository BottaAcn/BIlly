import './billy-badge.js';
import { escapeHtml, fmtSimilarity, TYPE_LABELS, TYPE_ICONS } from '../utils.js';

// <billy-asset-card> — card nella griglia del catalogo.
// Proprietà: .asset = { ID, title, description, type, certificationLevel, _similarity? }
// Evento emesso: 'open' (bubbles), detail: { assetId }
// role="button"/tabindex/keydown: è un <div> reso interattivo via JS, senza
// questo non sarebbe raggiungibile né attivabile da tastiera.
class BillyAssetCard extends HTMLElement {
  set asset(value) {
    this._asset = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('card');
    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');
    this.addEventListener('click', () => this.open());
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      }
    });
    if (this._asset) this.render();
  }

  open() {
    if (!this._asset) return;
    this.dispatchEvent(new CustomEvent('open', { bubbles: true, detail: { assetId: this._asset.ID } }));
  }

  render() {
    if (!this.isConnected || !this._asset) return;
    const a = this._asset;
    this.setAttribute('aria-label', `Apri asset: ${a.title}`);
    this.innerHTML = `
      <div class="card-top">
        <div>
          <p class="type-tag card-top-heading"><span class="type-icon">${TYPE_ICONS[a.type] || TYPE_ICONS.other}</span> ${TYPE_LABELS[a.type] || a.type || 'documento'}</p>
          <p class="card-title">${escapeHtml(a.title)}</p>
        </div>
      </div>
      <p class="card-desc">${escapeHtml(a.description) || 'Nessuna descrizione.'}</p>
      <div class="card-footer">
        <billy-badge level="${a.certificationLevel}"></billy-badge>
        ${a._similarity != null ? `<span class="similarity-pill">${fmtSimilarity(a._similarity)}</span>` : ''}
      </div>
    `;
  }
}

customElements.define('billy-asset-card', BillyAssetCard);
