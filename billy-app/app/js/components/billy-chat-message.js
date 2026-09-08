import './billy-source-chip.js';
import { escapeHtml, fmtTime } from '../utils.js';

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
        <div class="chat-msg-name-row">
          <span class="chat-msg-name">${role === 'user' ? 'Tu' : 'Billy'}</span>
          <span class="chat-msg-time"></span>
        </div>
        <div class="chat-msg-text"></div>
        <div class="chat-msg-actions"></div>
      </div>`;
    this._textEl = this.querySelector('.chat-msg-text');
    this._timeEl = this.querySelector('.chat-msg-time');
    this._actionsEl = this.querySelector('.chat-msg-actions');
    this._timeEl.textContent = fmtTime(new Date().toISOString());
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
    this._addCopyButton(markdownText || '');
  }

  setError(message) {
    this._textEl.innerHTML = `<p style="color:var(--danger)">Errore: ${escapeHtml(message)}</p>`;
  }

  _addCopyButton(rawText) {
    this._actionsEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-copy-btn';
    btn.textContent = 'Copia';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText);
        btn.textContent = 'Copiato';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copia'; btn.classList.remove('copied'); }, 1500);
      } catch (e) { /* clipboard non disponibile (es. contesto non sicuro): nessuna azione */ }
    });
    this._actionsEl.appendChild(btn);
  }
}

customElements.define('billy-chat-message', BillyChatMessage);
