import './billy-source-chip.js';
import { escapeHtml } from '../utils.js';

// <billy-chat-message role="user|billy"></billy-chat-message>
// Impostare l'attributo `role` PRIMA di attaccare l'elemento al DOM.
// API pubblica: .setUserText(text) | .setThinking() | .setAnswer(markdown, sources) | .setError(message)
// `marked` è globale (script CDN in index.html), non importato come modulo.
class BillyChatMessage extends HTMLElement {
  connectedCallback() {
    const role = this.getAttribute('role') || 'billy';
    this.classList.add('chat-msg', role);
    this.innerHTML = `
      <div class="chat-msg-avatar">${role === 'user' ? 'Tu' : 'B'}</div>
      <div class="chat-msg-body">
        <div class="chat-msg-name">${role === 'user' ? 'Tu' : 'Billy'}</div>
        <div class="chat-msg-text"></div>
      </div>`;
    this._textEl = this.querySelector('.chat-msg-text');
  }

  setUserText(text) {
    this._textEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
  }

  setThinking() {
    this._textEl.innerHTML = `
      <div class="chat-thinking">
        <span></span><span></span><span></span>
        <span class="chat-thinking-label">Billy sta pensando...</span>
      </div>`;
  }

  setAnswer(markdownText, sources = []) {
    this._textEl.innerHTML = marked.parse(markdownText || '');
    if (sources.length) {
      const wrap = document.createElement('div');
      wrap.className = 'chat-sources';
      sources.forEach((s) => {
        const chip = document.createElement('billy-source-chip');
        chip.data = s;
        wrap.appendChild(chip);
      });
      this._textEl.appendChild(wrap);
    }
  }

  setError(message) {
    this._textEl.innerHTML = `<p style="color:var(--danger)">Errore: ${escapeHtml(message)}</p>`;
  }
}

customElements.define('billy-chat-message', BillyChatMessage);
