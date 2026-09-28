import { escapeHtml, fmtSimilarity, CERT_LABELS } from '../utils.js';

// <billy-source-chip> — citazione in una risposta di Billy.
// Proprietà (impostate via JS, non attributi, per evitare stringhe/numeri
// scomodi negli attributi HTML): .data = { assetId, title, similarity, certificationLevel, link }
// Evento emesso: 'open-asset' (bubbles), detail: { assetId }
// role="button"/tabindex/keydown: è un <div> reso interattivo via JS, senza
// questo non sarebbe raggiungibile né attivabile da tastiera.
//
// Forma presa dal mockup (riga 465): una riga sottile con l'icona a scudo
// e "<titolo> — Certificato". Qui però le fonti sono più di una, cliccabili
// e con la rilevanza restituita dal backend, e il livello di certificazione
// ha quattro valori: il verde del mockup vale per "certified", gli altri
// livelli hanno il proprio colore (vedi .msg-src.level-* in chat.css),
// altrimenti uno scaduto o un ritirato si leggerebbe come certificato.
const SHIELD_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>';

class BillySourceChip extends HTMLElement {
  set data(value) {
    this._data = value;
    this.render();
  }

  connectedCallback() {
    this.classList.add('msg-src');
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
    // Un solo level-* per volta: il chip può essere ridisegnato con dati
    // diversi (stesso nodo riusato) e la classe vecchia resterebbe.
    this.className = `msg-src level-${certificationLevel || 'community'}`;
    // similarity null = fonte di tipo skill: non è stata recuperata per
    // similarità, il modello l'ha scelta dal manifesto ed eseguita
    // (convenzione del backend, vedi API-CONTRACT.md §1).
    const pill = similarity == null ? 'skill usata' : fmtSimilarity(similarity);
    const cert = CERT_LABELS[certificationLevel] || '';
    this.innerHTML = `
      ${SHIELD_SVG}
      <span class="msg-src-title">${escapeHtml(title)}</span>
      ${cert ? `<span class="msg-src-cert">— ${cert}</span>` : ''}
      ${pill ? `<span class="similarity-pill">${pill}</span>` : ''}
    `;
  }
}

customElements.define('billy-source-chip', BillySourceChip);
