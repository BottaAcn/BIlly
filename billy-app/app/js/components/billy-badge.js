import { certUi } from '../utils.js';

// <billy-badge level="certified"></billy-badge>
// Puramente presentazionale: nessun evento, nessuna dipendenza da api.js.
// Rende la .cert-badge del mockup (classi cb-ok/cb-exp/cb-com/cb-ret):
// il pallino colorato del vecchio .badge non c'è più, nel mockup l'etichetta
// è una pill piena senza glifo. `data-level` resta esposto per chi volesse
// agganciarci una regola senza dover conoscere la mappa dei suffissi.
class BillyBadge extends HTMLElement {
  static get observedAttributes() { return ['level']; }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  render() {
    const level = this.getAttribute('level') || 'community';
    const ui = certUi(level);
    this.className = `cert-badge ${ui.badge}`;
    this.dataset.level = level;
    this.textContent = ui.label;
  }
}

customElements.define('billy-badge', BillyBadge);
