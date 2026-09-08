// <billy-modal></billy-modal> — singleton nell'app (uno solo in index.html).
// API pubblica: modalEl.open({ title, bodyHtml, footerButtons }), modalEl.close().
// footerButtons: [{ label, className, onClick }]
class BillyModal extends HTMLElement {
  connectedCallback() {
    this.classList.add('modal-overlay');
    this.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
          <button class="modal-close" type="button">&times;</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>`;

    this._titleEl = this.querySelector('.modal-title');
    this._bodyEl = this.querySelector('.modal-body');
    this._footerEl = this.querySelector('.modal-footer');

    this.querySelector('.modal-close').addEventListener('click', () => this.close());
    this.addEventListener('click', (e) => { if (e.target === this) this.close(); });
  }

  open({ title = '', bodyHtml = '', footerButtons = [] }) {
    this._titleEl.textContent = title;
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
    this.classList.add('open');
  }

  close() {
    this.classList.remove('open');
  }

  // Comodo per i moduli views/: cerca un elemento dentro il body corrente
  // (es. dopo aver popolato bodyHtml con un form, leggere un input).
  query(selector) {
    return this._bodyEl.querySelector(selector);
  }
}

customElements.define('billy-modal', BillyModal);
