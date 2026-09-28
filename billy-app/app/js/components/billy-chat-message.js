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
//
// Struttura e classi vengono dal mockup (doc/FrontEnd/billy_final_nonfinal.html,
// righe 106-121 per il CSS, 461-471 per il markup): .msg > avatar +
// .bubble-wrap > .msg-bub + fonti + .msg-time. La bolla porta anche la
// classe legacy .chat-msg-text, così il markdown renderizzato dentro
// (liste, codice, citazioni) resta formattato dalle regole di main.css.

// I puntini di attesa, identici al mockup (showTyping(), riga 471). Il
// role="status" non c'è nel mockup: senza, chi usa uno screen reader non
// ha modo di sapere che Billy sta lavorando.
const TYPING_HTML = '<div class="typing" role="status" aria-label="Billy sta pensando"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';

class BillyChatMessage extends HTMLElement {
  connectedCallback() {
    const role = this.getAttribute('role') || 'billy';
    this.classList.add('msg', role);
    // L'avatar di Billy è il personaggio ritagliato tondo: object-position
    // center top perché il PNG è a figura intera e in un cerchio da 28px
    // l'unica parte che si riconosce è la testa.
    const avatar = role === 'user'
      ? '<div class="msg-av-u" aria-hidden="true">TU</div>'
      : '<img class="msg-av-img" src="img/billy-character.png" alt="" aria-hidden="true">';
    this.innerHTML = `
      ${avatar}
      <div class="bubble-wrap">
        <div class="msg-bub ${role === 'user' ? 'u' : 'b'} chat-msg-text"></div>
        <div class="msg-foot">
          <span class="msg-time"></span>
          <span class="chat-msg-actions"></span>
        </div>
      </div>`;
    this._bubble = this.querySelector('.msg-bub');
    this._wrapEl = this.querySelector('.bubble-wrap');
    this._footEl = this.querySelector('.msg-foot');
    this._actionsEl = this.querySelector('.chat-msg-actions');
    this.querySelector('.msg-time').textContent = fmtTime(new Date().toISOString());
  }

  setUserText(text) {
    this._bubble.innerHTML = `<p>${escapeHtml(text)}</p>`;
  }

  setThinking() {
    this._steps = [];
    this._preview = '';
    this._renderProgress();
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
      : TYPING_HTML;
    // Solo puntini e nient'altro: il padding lo mette .typing, la bolla lo
    // azzera (nel mockup è uno style inline, qui la classe .flush).
    this._bubble.classList.toggle('flush', !steps.length && !this._preview);
    this._bubble.innerHTML = `${steps.length ? `<div class="chat-steps">${stepsHtml}</div>` : ''}${previewHtml}`;
  }

  setAnswer(markdownText, sources = [], steps = null) {
    const done = steps || this._steps || [];
    const stepsHtml = done.length
      ? `<details class="chat-steps-done"><summary>${done.length === 1 ? '1 passaggio' : `${done.length} passaggi`}</summary>${
          done.map((s) => `<div class="chat-step done"><span class="chat-step-dot"></span><span>${escapeHtml(s)}</span></div>`).join('')
        }</details>`
      : '';
    this._steps = done;
    this._bubble.classList.remove('flush');
    this._bubble.innerHTML = stepsHtml + marked.parse(markdownText || '');
    // Le fonti stanno FUORI dalla bolla, come nel mockup: sono una riga
    // di servizio sotto la risposta, non parte del testo.
    this._renderSources(sources);
    this._addCopyButton(markdownText || '');
  }

  _renderSources(sources) {
    if (!sources || !sources.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'msg-srcs';
    sources.forEach((s) => {
      const chip = document.createElement('billy-source-chip');
      chip.data = s;
      wrap.appendChild(chip);
    });
    this._wrapEl.insertBefore(wrap, this._footEl);
  }

  setError(message) {
    this._bubble.classList.remove('flush');
    this._bubble.classList.add('err');
    this._bubble.innerHTML = `<p>Errore: ${escapeHtml(message)}</p>`;
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
