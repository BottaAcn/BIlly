import './billy-source-chip.js';
import { escapeHtml, fmtTime } from '../utils.js';

// <billy-chat-message role="user|billy"></billy-chat-message>
// Impostare l'attributo `role` PRIMA di attaccare l'elemento al DOM.
// API pubblica: .setUserText(text) | .setThinking() | .addStep(label) |
//               .setPreview(text) | .completeStep() | .setAnswer(markdown, sources, steps) |
//               .setError(message)
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

// I puntini vanno ricreati ogni volta che l'anteprima li sostituisce e poi
// torna indietro (succede ad ogni giro di tool): serve un nodo nuovo, non
// l'HTML riassegnato alla bolla intera.
function makeTyping() {
  const t = document.createElement('template');
  t.innerHTML = TYPING_HTML;
  return t.content.firstElementChild;
}

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
    this._doneSteps = 0;
    this._preview = '';
    this._stepsSig = null;
    this._cancelFrame();
    this._bubble.classList.remove('err');
    this._bubble.innerHTML = TYPING_HTML;
    this._stepsEl = null;
    this._tailEl = this._bubble.querySelector('.typing');
    this._paintProgress();
  }

  // Un passo intermedio dell'agente, già in linguaggio umano.
  addStep(label) {
    this._steps = this._steps || [];
    this._steps.push(label);
    // Il testo parziale scritto prima di un tool call è quasi sempre un
    // preambolo ("ora cerco..."): non serve conservarlo tra un passo e
    // l'altro, lo sostituisce il passo stesso.
    this._preview = '';
    this._scheduleProgress();
  }

  // Evento `result` del contratto (§1.2): lo strumento in corso ha finito.
  // Serve con LangGraph, che può fare più giri di tool: senza, l'ultimo
  // passo resterebbe "in corso" anche mentre ne parte un altro.
  completeStep() {
    this._doneSteps = Math.min((this._doneSteps || 0) + 1, (this._steps || []).length);
    this._scheduleProgress();
  }

  // Testo della risposta mentre arriva (anteprima non formattata).
  // I `delta` possono arrivare token per token: qui si accumula soltanto,
  // il DOM lo tocca _paintProgress() una volta per frame.
  setPreview(text) {
    this._preview = text;
    this._scheduleProgress();
  }

  // ── rendering dei progressi ──────────────────────────────────────
  // Un delta per token significa centinaia di eventi in pochi secondi.
  // Ridisegnare la bolla ad ogni evento fa sfarfallare i puntini e i passi
  // e costa un reflow a testa: si accumula e si dipinge al frame dopo.
  _scheduleProgress() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => { this._frame = 0; this._paintProgress(); });
  }

  _cancelFrame() {
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = 0;
  }

  _paintProgress() {
    const steps = this._steps || [];
    const preview = this._preview || '';
    this._bubble.classList.toggle('flush', !steps.length && !preview);

    // I passi cambiano di rado: si ridisegnano solo quando cambia davvero
    // qualcosa (numero di passi, passi completati, presenza dell'anteprima).
    const sig = `${steps.length}|${this._doneSteps || 0}|${preview ? 1 : 0}`;
    if (sig !== this._stepsSig) {
      this._stepsSig = sig;
      if (steps.length) {
        if (!this._stepsEl || !this._stepsEl.isConnected) {
          this._stepsEl = document.createElement('div');
          this._stepsEl.className = 'chat-steps';
          this._bubble.insertBefore(this._stepsEl, this._tailEl);
        }
        this._stepsEl.innerHTML = steps.map((s, i) => {
          // Un passo è "in corso" solo se è l'ultimo, non è ancora arrivato
          // il suo `result` e il modello non ha ripreso a scrivere.
          const running = i === steps.length - 1 && i >= (this._doneSteps || 0) && !preview;
          return `<div class="chat-step ${running ? 'running' : 'done'}">`
            + `<span class="chat-step-dot"></span><span>${escapeHtml(s)}</span></div>`;
        }).join('');
      }
    }

    // La coda della bolla è o i puntini o l'anteprima, mai entrambi: si
    // scambia il nodo invece di riscrivere la bolla, così il CSS di
    // adiacenza (.chat-steps + .typing) continua a valere e il testo che
    // cresce non viene ricreato ad ogni token.
    const wantPreview = !!preview;
    const isPreview = this._tailEl && this._tailEl.classList.contains('chat-preview');
    if (wantPreview !== isPreview || !this._tailEl || !this._tailEl.isConnected) {
      const next = wantPreview ? document.createElement('div') : makeTyping();
      if (wantPreview) next.className = 'chat-preview';
      if (this._tailEl && this._tailEl.isConnected) this._bubble.replaceChild(next, this._tailEl);
      else this._bubble.appendChild(next);
      this._tailEl = next;
    }
    if (wantPreview) this._tailEl.textContent = preview;
  }

  setAnswer(markdownText, sources = [], steps = null) {
    // Un frame gia in coda riscriverebbe la bolla sopra la risposta appena
    // messa: va annullato prima di dipingere il risultato finale.
    this._cancelFrame();
    this._stepsEl = null;
    this._tailEl = null;
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
    this._cancelFrame();
    this._stepsEl = null;
    this._tailEl = null;
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
