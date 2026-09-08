import { api } from '../api.js';
import '../components/billy-chat-message.js';

const chatInput = document.getElementById('chat-input');
const chatThread = document.getElementById('chat-thread');
const chatEmpty = document.getElementById('chat-empty');
const chatSend = document.getElementById('chat-send');

function appendMessage(role) {
  if (chatEmpty.style.display !== 'none') chatEmpty.style.display = 'none';
  chatThread.style.display = 'block';

  const msg = document.createElement('billy-chat-message');
  msg.setAttribute('role', role);
  chatThread.appendChild(msg);
  chatThread.scrollTop = chatThread.scrollHeight;
  return msg;
}

async function sendChatMessage() {
  const question = chatInput.value.trim();
  if (!question) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  appendMessage('user').setUserText(question);
  const billyMsg = appendMessage('billy');
  billyMsg.setThinking();

  try {
    const data = await api.askBilly(question);
    billyMsg.setAnswer(data.answer, data.sources);
  } catch (e) {
    billyMsg.setError(e.message);
  }
  chatThread.scrollTop = chatThread.scrollHeight;
}

export function initChatView() {
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  chatSend.addEventListener('click', sendChatMessage);
}
