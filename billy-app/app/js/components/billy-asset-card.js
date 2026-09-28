import './billy-badge.js';
import { escapeHtml, fmtSimilarity, TYPE_LABELS, TYPE_ICONS } from '../utils.js';

// <billy-asset-card> — card nella griglia del catalogo.
// Proprietà: .asset = { ID, title, description, type, certificationLevel, _similarity? }
// Eventi emessi (bubbles): 'open' { assetId } | 'use-skill' { assetId, title }
// 'use-skill' esiste solo per type === 'skill': gli altri tipi non hanno
// (ancora) un modello di delivery definito, quindi nessuna CTA.
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

  useSkill(e) {
    // La card intera è cliccabile: senza stopPropagation il click aprirebbe
    // anche il dettaglio dell'asset.
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('use-skill', {
      bubbles: true,
      detail: { assetId: this._asset.ID, title: this._asset.title }
    }));
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
        ${a.type === 'skill' ? '<button type="button" class="btn btn-sm card-use-skill">Usa questa skill</button>' : ''}
      </div>
    `;
    const useBtn = this.querySelector('.card-use-skill');
    if (useBtn) useBtn.addEventListener('click', (e) => this.useSkill(e));
  }
}

customElements.define('billy-asset-card', BillyAssetCard);
