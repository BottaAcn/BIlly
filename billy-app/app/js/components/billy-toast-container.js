import { IC_CHECK, IC_ALERT } from '../utils.js';

// <billy-toast-container></billy-toast-container> — singleton nell'app.
// API pubblica: containerEl.show(message, type) — type: 'info' | 'success' | 'error'
//
// Nel mockup il toast è un nodo fisso già presente nel DOM, che entra e esce
// aggiungendo/togliendo .show (transizione elastica, 2.5s di permanenza).
// Qui i toast si creano al volo, quindi .show va messa al frame successivo:
// senza, il browser non ha uno stato iniziale da cui animare.
class BillyToastContainer extends HTMLElement {
  connectedCallback() {
    this.classList.add('toast-container');
  }

  show(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${type === 'error' ? IC_ALERT : IC_CHECK}<span></span>`;
    el.querySelector('span').textContent = message;
    this.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    // Un errore va letto, un "fatto" no: 2.5s è la durata del mockup, gli
    // errori restano il doppio prima di sparire.
    const life = type === 'error' ? 5000 : 2500;
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, life);
  }
}

customElements.define('billy-toast-container', BillyToastContainer);
