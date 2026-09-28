import './billy-badge.js';
import {
  escapeHtml, fmtDate, fmtSimilarity, TYPE_LABELS, TYPE_ICO_CLASS,
  typeIconSvg, certUi, computeCompleteness, completenessHint, authorOf, initialsOf
} from '../utils.js';

// <billy-asset-card> — card nella griglia del catalogo (.ccard del mockup).
// Proprietà: .asset = { ID, title, type, certificationLevel, createdAt, ... }
// Eventi emessi (bubbles): 'open' { assetId } | 'use-skill' { assetId, title }
// 'use-skill' esiste solo per type === 'skill': gli altri tipi non hanno
// (ancora) un modello di delivery definito, quindi nessuna CTA.
// role="button"/tabindex/keydown: è un custom element reso interattivo via
// JS, senza questo non sarebbe raggiungibile né attivabile da tastiera.
class BillyAssetCard extends HTMLElement {
  set asset(value) {
    this._asset = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('ccard');
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
    const cert = certUi(a.certificationLevel);
    const type = a.type || 'other';
    // Gli allegati non sono nella lista (servirebbe una chiamata per card):
    // la completezza qui è calcolata sui soli campi che il servizio manda.
    const completeness = computeCompleteness(a);
    const author = authorOf(a);

    this.setAttribute('aria-label', `Apri asset: ${a.title}`);
    this.innerHTML = `
      <div class="ccard-top">
        <div class="ccard-ico ${TYPE_ICO_CLASS[type] || 'ico-alt'}">${typeIconSvg(type)}</div>
        ${a.certificationLevel ? `<billy-badge level="${escapeHtml(a.certificationLevel)}"></billy-badge>` : ''}
      </div>
      <div>
        <div class="ccard-name">${escapeHtml(a.title)}</div>
        <div class="ccard-type">${TYPE_LABELS[type] || type}</div>
      </div>
      ${completeness.criteria.length ? `
      <div class="ccard-bar" title="${escapeHtml(completenessHint(completeness))}">
        <div class="ccard-bar-fill ${cert.bar}" style="width:${completeness.pct}%"></div>
      </div>` : ''}
      <div class="ccard-meta">
        <span class="ccard-date">${fmtDate(a.createdAt)}</span>
        ${a._similarity != null ? `<span class="ccard-sim">${fmtSimilarity(a._similarity)}</span>` : ''}
        ${author ? `<span class="ccard-author"><span class="ccard-av">${escapeHtml(initialsOf(author))}</span>${escapeHtml(author)}</span>` : ''}
      </div>
      ${type === 'skill' ? '<button type="button" class="ccard-use">Usa questa skill</button>' : ''}
    `;
    const useBtn = this.querySelector('.ccard-use');
    if (useBtn) useBtn.addEventListener('click', (e) => this.useSkill(e));
  }
}

customElements.define('billy-asset-card', BillyAssetCard);
