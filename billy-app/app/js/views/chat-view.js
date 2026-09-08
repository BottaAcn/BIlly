import { api } from '../api.js';
import '../components/billy-chat-message.js';

const chatInput = document.getElementById('chat-input');
const chatThread = document.getElementById('chat-thread');
const chatEmpty = document.getElementById('chat-empty');
const chatSend = document.getElementById('chat-send');
const chatReset = document.getElementById('chat-reset');
const suggestedQuestions = document.getElementById('suggested-questions');

// Persistenza solo lato client (sessionStorage): un refresh accidentale
// della pagina non deve cancellare la conversazione. Nessun impatto sul
// backend, nessuna nuova chiamata API — si salva solo quello che arriva
// già dalle risposte esistenti.
const STORAGE_KEY = 'billy-chat-history';

function loadHistory() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}

function saveHistory() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history)); }
  catch (e) { /* storage pieno/non disponibile: la chat resta solo in memoria per questa sessione */ }
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

function renderHistory() {
  history.forEach((entry) => {
    if (entry.role === 'user') appendMessage('user').setUserText(entry.text);
    else if (entry.kind === 'error') appendMessage('billy').setError(entry.message);
    else appendMessage('billy').setAnswer(entry.markdown, entry.sources);
  });
}

async function sendChatMessage(prefilled) {
  const question = (prefilled ?? chatInput.value).trim();
  if (!question) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  appendMessage('user').setUserText(question);
  history.push({ role: 'user', text: question });
  saveHistory();

  const billyMsg = appendMessage('billy');
  billyMsg.setThinking();

  try {
    const data = await api.askBilly(question);
    billyMsg.setAnswer(data.answer, data.sources);
    history.push({ role: 'billy', kind: 'answer', markdown: data.answer, sources: data.sources });
  } catch (e) {
    billyMsg.setError(e.message);
    history.push({ role: 'billy', kind: 'error', message: e.message });
  }
  saveHistory();
  chatThread.scrollTop = chatThread.scrollHeight;
}

function resetChat() {
  history = [];
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
