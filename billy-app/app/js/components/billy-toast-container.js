// <billy-toast-container></billy-toast-container> — singleton nell'app.
// API pubblica: containerEl.show(message, type) — type: 'info' | 'success' | 'error'
class BillyToastContainer extends HTMLElement {
  connectedCallback() {
    this.classList.add('toast-container');
  }

  show(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    this.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
}

customElements.define('billy-toast-container', BillyToastContainer);
