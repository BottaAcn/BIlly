import './billy-source-chip.js';
import { escapeHtml, fmtTime } from '../utils.js';

// <billy-chat-message role="user|billy"></billy-chat-message>
// Impostare l'attributo `role` PRIMA di attaccare l'elemento al DOM.
// API pubblica: .setUserText(text) | .setThinking() | .addStep(label) |
//               .setPreview(text) | .setAnswer(markdown, sources, steps) | .setError(message)
// Billy è un agente: prima della risposta può eseguire più passi (ricerca
// nei documenti, caricamento di una skill). addStep() li mostra mentre
// avvengono, setAnswer() li archivia sopra la risposta finale.
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
    this._steps = [];
    this._preview = '';
    this._textEl.innerHTML = `
      <div class="chat-thinking">
        <span></span><span></span><span></span>
        <span class="chat-thinking-label">Billy sta pensando...</span>
      </div>`;
  }

  // Un passo intermedio dell'agente, già in linguaggio umano.
  addStep(label) {
    this._steps = this._steps || [];
    this._steps.push(label);
    // Il testo parziale scritto prima di un tool call è quasi sempre un
    // preambolo ("ora cerco..."): non serve conservarlo tra un passo e
    // l'altro, lo sostituisce il passo stesso.
    this._preview = '';
    this._renderProgress();
  }

  // Testo della risposta mentre arriva (anteprima non formattata).
  setPreview(text) {
    this._preview = text;
    this._renderProgress();
  }

  _renderProgress() {
    const steps = this._steps || [];
    const stepsHtml = steps.map((s, i) => `
      <div class="chat-step${i === steps.length - 1 && !this._preview ? ' running' : ' done'}">
        <span class="chat-step-dot"></span><span>${escapeHtml(s)}</span>
      </div>`).join('');
    const previewHtml = this._preview
      ? `<div class="chat-preview">${escapeHtml(this._preview)}</div>`
      : `<div class="chat-thinking">
           <span></span><span></span><span></span>
           <span class="chat-thinking-label">${steps.length ? 'Billy sta lavorando...' : 'Billy sta pensando...'}</span>
         </div>`;
    this._textEl.innerHTML = `${stepsHtml ? `<div class="chat-steps">${stepsHtml}</div>` : ''}${previewHtml}`;
  }

  setAnswer(markdownText, sources = [], steps = null) {
    const done = steps || this._steps || [];
    const stepsHtml = done.length
      ? `<details class="chat-steps-done"><summary>${done.length === 1 ? '1 passaggio' : `${done.length} passaggi`}</summary>${
          done.map((s) => `<div class="chat-step done"><span class="chat-step-dot"></span><span>${escapeHtml(s)}</span></div>`).join('')
        }</details>`
      : '';
    this._steps = done;
    this._textEl.innerHTML = stepsHtml + marked.parse(markdownText || '');
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
