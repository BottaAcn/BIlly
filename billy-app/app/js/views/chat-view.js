import { askBillyStream } from '../api.js';
import '../components/billy-chat-message.js';

const chatInput = document.getElementById('chat-input');
const chatThread = document.getElementById('chat-thread');
const chatEmpty = document.getElementById('chat-empty');
const chatSend = document.getElementById('chat-send');
const chatReset = document.getElementById('chat-reset');
const suggestedQuestions = document.getElementById('suggested-questions');

// Persistenza lato client su localStorage: chiudere la scheda (o il
// browser) non deve cancellare le conversazioni, si ritrovano il giorno
// dopo. Quello che si CONSERVA e quello che si MANDA al modello sono due
// cose diverse: si conserva molto (per rileggere), si manda poco (solo la
// conversazione in corso, ultimi turni) — vedi historyForBackend().
const STORAGE_KEY = 'billy-chat-history';

// Tetti alla persistenza: localStorage ha ~5-10MB per origine e una
// scrittura oltre quota lancia, rompendo la chat. Si tagliano i messaggi
// più vecchi prima di arrivarci.
const MAX_STORED_MESSAGES = 200;
const MAX_STORED_BYTES = 400 * 1024;
// Quanto si manda al backend. Mandare settimane di storico gonfierebbe il
// contesto (e il costo in token) con roba irrilevante. Il server applica
// comunque un proprio tetto di 20 messaggi (vedi API-CONTRACT.md §1.1).
const MAX_SENT_MESSAGES = 16;

function newConversationId() {
  // randomUUID richiede un secure context: fallback per http locale.
  return crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// La conversazione "in corso" cambia ad ogni apertura della pagina e ad
// ogni reset: è l'unica parte dello storico che viene rimandata al
// modello. Il resto resta a schermo, ma per Billy è passato remoto.
let currentConversationId = newConversationId();

function loadHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Migrazione una tantum dal vecchio sessionStorage (pre-Fase 11):
    // chi ha la scheda aperta non perde la conversazione in corso.
    if (stored === null) {
      const legacy = sessionStorage.getItem(STORAGE_KEY);
      if (legacy) {
        sessionStorage.removeItem(STORAGE_KEY);
        return JSON.parse(legacy) || [];
      }
    }
    return JSON.parse(stored) || [];
  } catch (e) {
    return [];
  }
}

// Taglia dall'inizio (i messaggi più vecchi) finché non si sta nei limiti.
function trimHistory() {
  if (history.length > MAX_STORED_MESSAGES) history = history.slice(-MAX_STORED_MESSAGES);
  let serialized = JSON.stringify(history);
  while (history.length > 1 && serialized.length > MAX_STORED_BYTES) {
    history = history.slice(Math.ceil(history.length / 4) || 1);
    serialized = JSON.stringify(history);
  }
  return serialized;
}

function saveHistory() {
  let serialized = trimHistory();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      return;
    } catch (e) {
      // Quota superata (o storage non disponibile): si butta via metà
      // dello storico più vecchio e si riprova, invece di far saltare
      // l'invio del messaggio.
      if (history.length <= 1) break;
      history = history.slice(Math.ceil(history.length / 2));
      serialized = JSON.stringify(history);
    }
  }
  // Rinuncia silenziosa: la chat resta comunque funzionante in memoria.
}

let history = loadHistory();

function appendMessage(role) {
  if (chatEmpty.style.display !== 'none') chatEmpty.style.display = 'none';
  chatThread.style.display = 'block';

  const msg = document.createElement('billy-chat-message');
  msg.setAttribute('role', role);
  chatThread.appendChild(msg);
  chatThread.scrollTop = chatThread.scrollHeight;
  return msg;
}

function appendSeparator() {
  const sep = document.createElement('div');
  sep.className = 'chat-conv-sep';
  sep.textContent = 'Conversazione precedente';
  chatThread.appendChild(sep);
}

function renderHistory() {
  let lastConv;
  history.forEach((entry, i) => {
    // Le conversazioni chiuse restano a schermo ma sono separate: aiuta a
    // capire perché Billy non "ricorda" ciò che si vede più in alto.
    if (i > 0 && entry.conv !== lastConv) appendSeparator();
    lastConv = entry.conv;
    if (entry.role === 'user') appendMessage('user').setUserText(entry.text);
    else if (entry.kind === 'error') appendMessage('billy').setError(entry.message);
    else appendMessage('billy').setAnswer(entry.markdown, entry.sources, entry.steps);
  });
}

// Quello che si manda al modello: solo la conversazione in corso, solo i
// turni riusciti (gli errori non fanno parte della conversazione) e solo
// gli ultimi MAX_SENT_MESSAGES. Deliberatamente molto meno di quello che
// si conserva in locale.
function historyForBackend() {
  return history
    .filter((e) => e.conv === currentConversationId && (e.role === 'user' || e.kind === 'answer'))
    .map((e) => (e.role === 'user'
      ? { role: 'user', content: e.text }
      : { role: 'assistant', content: e.markdown }))
    .slice(-MAX_SENT_MESSAGES);
}

// Traduce gli eventi dell'agente in una riga leggibile. Gli eventi sono
// definiti in doc/V1/external-brief/API-CONTRACT.md §1.2.
function stepLabel(event) {
  if (event.name === 'searchKnowledge') {
    const q = event.args?.query;
    return q ? `Cerco nei documenti: "${q}"` : 'Cerco nei documenti...';
  }
  if (event.name === 'loadSkill') return 'Carico una skill dal marketplace...';
  return `Eseguo ${event.name || 'uno strumento'}...`;
}

async function sendChatMessage(prefilled) {
  const question = (prefilled ?? chatInput.value).trim();
  if (!question) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Lo storico da mandare è quello PRIMA di questa domanda: la domanda
  // corrente viaggia nel campo `question`, non dentro `history`.
  const backendHistory = historyForBackend();

  // Prima domanda di una nuova conversazione con dei turni vecchi ancora
  // a schermo: separatore, come nel replay all'avvio.
  if (history.length && history[history.length - 1].conv !== currentConversationId) appendSeparator();

  appendMessage('user').setUserText(question);
  history.push({ conv: currentConversationId, role: 'user', text: question });
  saveHistory();

  const billyMsg = appendMessage('billy');
  billyMsg.setThinking();

  const steps = [];
  let preview = '';

  try {
    const data = await askBillyStream(question, backendHistory, (event) => {
      if (event.type === 'tool') {
        steps.push(stepLabel(event));
        billyMsg.addStep(steps[steps.length - 1]);
      } else if (event.type === 'delta') {
        preview += event.text;
        billyMsg.setPreview(preview);
      }
      chatThread.scrollTop = chatThread.scrollHeight;
    });
    billyMsg.setAnswer(data.answer, data.sources, steps);
    history.push({ conv: currentConversationId, role: 'billy', kind: 'answer', markdown: data.answer, sources: data.sources, steps });
  } catch (e) {
    billyMsg.setError(e.message);
    history.push({ conv: currentConversationId, role: 'billy', kind: 'error', message: e.message });
  }
  saveHistory();
  chatThread.scrollTop = chatThread.scrollHeight;
}

// Precarica l'input senza inviare, come fanno le chip suggerite: l'utente
// deve poter aggiungere il contesto su cui applicare la skill.
export function prefillChat(text) {
  chatInput.value = text;
  chatInput.dispatchEvent(new Event('input'));
  chatInput.focus();
  chatInput.setSelectionRange(text.length, text.length);
}

function resetChat() {
  history = [];
  // Nuova conversazione anche lato modello: dopo un reset Billy non deve
  // ricordare nulla di quella precedente.
  currentConversationId = newConversationId();
  saveHistory();
  chatThread.innerHTML = '';
  chatThread.style.display = 'none';
  chatEmpty.style.display = 'flex';
}

export function initChatView() {
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  chatSend.addEventListener('click', () => sendChatMessage());
  chatReset.addEventListener('click', resetChat);

  // Le chip precompilano l'input, non inviano da sole: l'utente resta
  // libero di modificare la domanda prima di mandarla.
  suggestedQuestions.querySelectorAll('.suggested-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.textContent;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    });
  });

  if (history.length) renderHistory();
}
