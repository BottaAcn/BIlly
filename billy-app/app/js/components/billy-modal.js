// <billy-modal></billy-modal> — singleton nell'app (uno solo in index.html).
// API pubblica: modalEl.open({ title, tagsHtml, bodyHtml, footerButtons, variant }),
// modalEl.close(), modalEl.query(sel).
// footerButtons: [{ label, className, onClick }]
//
// Struttura e classi sono quelle del mockup (.modal-head / .modal-tags /
// .modal-body / .modal-footer, overlay attivato da .vis). Si continua a
// mettere anche la vecchia classe .open perché è quella su cui main.css
// apre l'overlay: finché le due regole convivono, togliere .open
// spegnerebbe la modale per chiunque non abbia ancora il CSS nuovo.
class BillyModal extends HTMLElement {
  connectedCallback() {
    this.classList.add('modal-overlay');
    this.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <h3 class="modal-title" id="modal-title"></h3>
          <button class="modal-close" type="button" aria-label="Chiudi">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-tags" hidden></div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>`;

    this._titleEl = this.querySelector('.modal-title');
    this._tagsEl = this.querySelector('.modal-tags');
    this._bodyEl = this.querySelector('.modal-body');
    this._footerEl = this.querySelector('.modal-footer');

    this.querySelector('.modal-close').addEventListener('click', () => this.close());
    this.addEventListener('click', (e) => { if (e.target === this) this.close(); });
    // Esc chiude: nel mockup è un listener globale (riga 611). Qui sta sul
    // componente perché la modale è unica e sa da sé se è aperta.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.classList.contains('vis')) this.close();
    });
  }

  open({ title = '', tagsHtml = '', bodyHtml = '', footerButtons = [], variant = null }) {
    this._titleEl.textContent = title;
    this._tagsEl.innerHTML = tagsHtml;
    this._tagsEl.hidden = !tagsHtml;
    this._bodyEl.innerHTML = bodyHtml;
    this._footerEl.innerHTML = '';
    footerButtons.forEach((btn) => {
      const b = document.createElement('button');
      b.className = `btn ${btn.className || ''}`;
      b.textContent = btn.label;
      b.type = 'button';
      b.onclick = btn.onClick;
      this._footerEl.appendChild(b);
    });
    // variant: 'danger' distingue visivamente le conferme distruttive
    // (elimina, rifiuta) dal resto (dettaglio, anteprima) pur riusando lo
    // stesso componente singleton.
    this.classList.toggle('modal--danger', variant === 'danger');
    this.classList.add('open', 'vis');
  }

  close() {
    this.classList.remove('open', 'vis');
  }

  // Comodo per i moduli views/: cerca un elemento dentro il body corrente
  // (es. dopo aver popolato bodyHtml con un form, leggere un input).
  query(selector) {
    return this._bodyEl.querySelector(selector);
  }

  // Le tag (pallino + stato + tipo) stanno fuori dal body: serve poterle
  // aggiornare senza riaprire la modale quando cambia lo stato inline.
  queryTag(selector) {
    return this._tagsEl.querySelector(selector);
  }
}

customElements.define('billy-modal', BillyModal);
