import { CERT_LABELS } from '../utils.js';

// <billy-badge level="certified"></billy-badge>
// Puramente presentazionale: nessun evento, nessuna dipendenza da api.js.
class BillyBadge extends HTMLElement {
  static get observedAttributes() { return ['level']; }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  render() {
    const level = this.getAttribute('level') || 'community';
    this.className = `badge badge-${level}`;
    this.textContent = CERT_LABELS[level] || level;
  }
}

customElements.define('billy-badge', BillyBadge);
