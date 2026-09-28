import { api, askBillyStream } from '../api.js';
// Sola lettura da utils.js: `typeOf` normalizza il tipo che arriva dal
// backend, TYPE_ORDER dà ai tipi un ordine stabile. Duplicarli qui
// significherebbe avere due idee diverse di cosa sia un "tipo" di asset.
import { typeOf, TYPE_ORDER } from '../utils.js';
import '../components/billy-chat-message.js';

const chatInput = document.getElementById('chat-input');
const chatBody = document.getElementById('chat-body');
const chatThread = document.getElementById('chat-thread');
const chatEmpty = document.getElementById('chat-empty');
const chatSend = document.getElementById('chat-send');
const chatReset = document.getElementById('chat-reset');
const suggestedQuestions = document.getElementById('suggested-questions');

// A scorrere e' il contenitore (.chat-body), non la lista dei messaggi:
// la barra di input resta ferma in basso e fuori dall'area scrollabile.
function scrollToBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

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
  // flex e non block: i messaggi sono impilati con lo stesso gap del
  // mockup (16px), dato dal contenitore e non dai margini delle bolle.
  chatThread.style.display = 'flex';

  const msg = document.createElement('billy-chat-message');
  msg.setAttribute('role', role);
  chatThread.appendChild(msg);
  scrollToBottom();
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
      scrollToBottom();
    });
    billyMsg.setAnswer(data.answer, data.sources, steps);
    history.push({ conv: currentConversationId, role: 'billy', kind: 'answer', markdown: data.answer, sources: data.sources, steps });
  } catch (e) {
    billyMsg.setError(e.message);
    history.push({ conv: currentConversationId, role: 'billy', kind: 'error', message: e.message });
  }
  saveHistory();
  scrollToBottom();
}

// Precarica l'input senza inviare, come fanno le chip suggerite: l'utente
// deve poter aggiungere il contesto su cui applicare la skill.
export function prefillChat(text) {
  chatInput.value = text;
  chatInput.dispatchEvent(new Event('input'));
  chatInput.focus();
  chatInput.setSelectionRange(text.length, text.length);
}

// ═══════════════════════════════════════════════ PILL DELLA HERO ══
// Le tre pill erano cablate nel markup: sempre le stesse, e senza alcuna
// relazione con quello che c'è davvero nel catalogo. Qui vengono costruite
// dagli asset reali (api.listAssets()), così chi apre la chat vede
// suggerimenti che puntano a contenuti che esistono per davvero.
//
// Le pill statiche dell'HTML NON sono un placeholder da nascondere: sono il
// fallback. Si vedono subito (nessun buco nella hero mentre la rete
// risponde) e restano lì se il catalogo è vuoto o la chiamata fallisce.
// Tre domande generiche ma sensate valgono più di una riga vuota o di un
// messaggio d'errore in faccia a chi ha appena aperto l'app.
const FALLBACK_PILLS = Array.from(suggestedQuestions.children, (n) => n.cloneNode(true));

const PILL_COUNT = 3;

// Il mockup vuole le pill su una riga sola (white-space:nowrap): un titolo
// lungo allargherebbe la pill oltre la colonna della hero. L'etichetta si
// accorcia, la domanda intera resta in data-question e nel tooltip.
const PILL_MAX_LABEL = 26;

// Da dove riparte la rotazione al prossimo caricamento. Senza persistenza
// ogni reload ripescherebbe sempre i primi tre della graduatoria: pill
// costruite dal catalogo, ma di nuovo fisse.
const PILL_OFFSET_KEY = 'billy.pills.offset';

// Icone a 12px, stroke currentColor, come quelle già nel markup della hero.
// TYPE_ICON_SVG di utils.js non va bene qui: è a 22px e con un colore fisso
// per tipo (verde, blu, rosa) che litigherebbe col viola della pill. Stessi
// tracciati, misura e colore di quelle che c'erano.
const PILL_ICON = {
  document: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  skill: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 4.9 11.9l-.9.9V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-3.2l-.9-.9A7 7 0 0 1 12 2z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>',
  tool: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  application: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  interface: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  other: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.09 6.26L20 10l-4.55 4.74L16.18 21 12 17.77 7.82 21l1.73-6.26L5 10l5.91-1.74z"/></svg>',
  more: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
};

// Fraseggio per tipo: invocare una skill non è come chiedere cosa dice un
// documento. Per le skill si riusa la formula del pulsante "Usa questa
// skill" del catalogo (app.js, evento 'use-skill'), frase aperta che finisce
// con "per ": una skill ha bisogno del contesto su cui lavorare, e quel
// contesto lo sa solo l'utente. Gli altri tipi sono domande complete, perché
// lì basta chiedere. Nessuna di queste frasi parte da sola: la pill
// precompila l'input e l'utente decide se e come modificarla.
const PILL_QUESTION = {
  skill: (t) => `Usa la skill "${t}" per `,
  document: (t) => `Che cosa dice "${t}"?`,
  application: (t) => `A cosa serve l'applicazione "${t}" e chi la usa?`,
  interface: (t) => `A cosa serve l'interfaccia "${t}" e cosa collega?`,
  tool: (t) => `A cosa serve il tool "${t}" e quando si usa?`,
  other: (t) => `Parlami di "${t}"`
};

// Ordine di precedenza per livello di certificazione. I certificati vanno
// davanti perché sono i contenuti su cui l'azienda ha messo la firma: se una
// pill deve invitare a fidarsi, che inviti su quelli. I `deprecated`
// (Ritirato) sono esclusi del tutto — spingere verso un contenuto che
// qualcuno ha deliberatamente ritirato è peggio che non suggerire niente.
// I `certifiedOutdated` (Scaduto) restano ma per ultimi: il contenuto c'è
// ancora, è la certificazione ad essere scaduta, e Billy lo segnala comunque
// nelle fonti quando lo cita.
const PILL_CERT_RANK = { certified: 0, community: 1, certifiedOutdated: 2 };

// Asset reali ordinati; null finché il catalogo non è arrivato.
let pillPlaylist = null;
let pillOffset = readPillOffset();
let pillsRequested = false;

function readPillOffset() {
  try {
    const n = Number.parseInt(localStorage.getItem(PILL_OFFSET_KEY), 10);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch (e) {
    // Storage negato (iframe sandboxed): si riparte da capo ogni volta,
    // le pill restano vere, perdono solo la rotazione fra un reload e l'altro.
    return 0;
  }
}

function shortLabel(title) {
  if (title.length <= PILL_MAX_LABEL) return title;
  const cut = title.slice(0, PILL_MAX_LABEL);
  const space = cut.lastIndexOf(' ');
  // Si taglia sull'ultimo spazio solo se non lascia un moncone: meglio
  // "Metodologia di sti…" che "Metodologia…" quando la parola è lunga.
  return `${(space > PILL_MAX_LABEL * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function buildPillPlaylist(assets) {
  const usable = assets.filter((a) => a
    && String(a.title || '').trim()
    && a.certificationLevel !== 'deprecated');

  // Un secchio per tipo, ordinato per certificazione e poi per titolo.
  // L'ordinamento è deterministico: gli stessi dati danno sempre la stessa
  // sequenza, quindi la rotazione è prevedibile e non dipende dall'ordine
  // in cui il database ha restituito le righe.
  const buckets = new Map();
  usable.forEach((a) => {
    const t = typeOf(a);
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t).push(a);
  });
  const order = TYPE_ORDER.filter((t) => buckets.has(t));
  order.forEach((t) => buckets.get(t).sort((x, y) => {
    const byCert = (PILL_CERT_RANK[x.certificationLevel] ?? 3) - (PILL_CERT_RANK[y.certificationLevel] ?? 3);
    return byCert || String(x.title).localeCompare(String(y.title), 'it');
  }));

  // Round-robin fra i secchi invece di una classifica unica: oggi in
  // produzione ci sono 22 skill e 8 documenti, e una classifica unica
  // mostrerebbe tre skill in fila raccontando che nel catalogo c'è un tipo
  // solo di roba. Alternando i tipi, ogni terna fa vedere cosa c'è dentro.
  const playlist = [];
  const depth = Math.max(0, ...order.map((t) => buckets.get(t).length));
  for (let i = 0; i < depth; i++) {
    order.forEach((t) => {
      const asset = buckets.get(t)[i];
      if (asset) playlist.push(asset);
    });
  }
  return playlist;
}

function buildPill(asset) {
  const type = typeOf(asset);
  const title = String(asset.title).trim().replace(/\s+/g, ' ');
  const question = (PILL_QUESTION[type] || PILL_QUESTION.other)(title);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pill suggested-chip';
  btn.dataset.question = question;
  // Il tooltip porta la domanda intera: l'etichetta visibile può essere
  // troncata, e così si sa cosa finirà davvero nell'input.
  btn.title = question;
  btn.insertAdjacentHTML('beforeend', PILL_ICON[type] || PILL_ICON.other);
  // textContent e non innerHTML: il titolo arriva dal backend.
  btn.appendChild(document.createTextNode(shortLabel(title)));
  return btn;
}

// Nodo unico e riusato, non ricostruito ad ogni giro: replaceChildren lo
// sposta invece di sostituirlo, così chi ci arriva da tastiera non perde il
// focus ad ogni rotazione (un bottone che si smaterializza sotto il focus
// rimanda al <body> e costringe a ripercorrere tutto il tab order).
let morePill = null;
function getMorePill() {
  if (morePill) return morePill;
  morePill = document.createElement('button');
  morePill.type = 'button';
  morePill.className = 'pill pill-more';
  morePill.title = 'Mostra altri suggerimenti dal catalogo';
  morePill.insertAdjacentHTML('beforeend', PILL_ICON.more);
  morePill.appendChild(document.createTextNode('Altri'));
  return morePill;
}

// Rotazione: NON a timer. La hero si vede solo a conversazione vuota, cioè
// nel momento in cui si sta scegliendo cosa chiedere — è esattamente il
// momento sbagliato per far cambiare le opzioni da sole sotto il dito.
// Quindi la terna cambia agli eventi che segnano un "ricominciamo": nuovo
// caricamento della pagina e "Nuova conversazione". In più c'è la pill
// "Altri", che fa ruotare su richiesta: chi vuole vedere il resto del
// catalogo lo fa quando decide lui. Niente timer significa anche niente da
// disattivare sotto prefers-reduced-motion — resta solo la dissolvenza di
// entrata, che chat.css spegne in quel caso.
function showPills(advance) {
  if (!pillPlaylist || !pillPlaylist.length) return;
  if (advance) pillOffset = (pillOffset + PILL_COUNT) % pillPlaylist.length;

  const nodes = [];
  for (let i = 0; i < Math.min(PILL_COUNT, pillPlaylist.length); i++) {
    nodes.push(buildPill(pillPlaylist[(pillOffset + i) % pillPlaylist.length]));
  }
  // Catalogo con meno di tre asset utilizzabili: si completa la riga con le
  // domande statiche invece di lasciare la hero spoglia. Non si ripete un
  // asset per fare numero e non si inventa un titolo.
  FALLBACK_PILLS.slice(nodes.length).forEach((n) => nodes.push(n.cloneNode(true)));
  // "Altri" solo se c'è davvero altro: un pulsante che rimostra le stesse
  // tre pill è un pulsante rotto.
  if (pillPlaylist.length > PILL_COUNT) nodes.push(getMorePill());

  suggestedQuestions.replaceChildren(...nodes);
  // Retrigger dell'animazione di entrata (chat.css): senza un reflow in
  // mezzo, togliere e rimettere la classe nello stesso frame non la
  // fa ripartire.
  suggestedQuestions.classList.remove('pills-swap');
  void suggestedQuestions.offsetWidth;
  suggestedQuestions.classList.add('pills-swap');

  // L'offset da cui partirà il prossimo caricamento della pagina: si
  // persiste quello successivo, così due reload di fila non mostrano la
  // stessa terna.
  try {
    localStorage.setItem(PILL_OFFSET_KEY, String((pillOffset + PILL_COUNT) % pillPlaylist.length));
  } catch (e) { /* ignorato: si perde solo la rotazione fra reload */ }
}

// Il primo rendering arriva quando risponde la rete, cioè in un istante che
// l'utente non controlla: se in quel momento il puntatore è sopra la riga (o
// il focus è su una pill da tastiera) sostituire i bottoni significa
// cambiare la destinazione del click a metà gesto. Si aspetta che la mano
// se ne vada.
function whenPillsIdle(apply) {
  const busy = () => suggestedQuestions.matches(':hover')
    || suggestedQuestions.contains(document.activeElement);
  if (!busy()) { apply(); return; }
  const retry = () => requestAnimationFrame(() => {
    // focusout scatta prima che il focus si sia spostato: si ricontrolla
    // al frame dopo, quando activeElement è aggiornato.
    if (busy()) return;
    suggestedQuestions.removeEventListener('pointerleave', retry);
    suggestedQuestions.removeEventListener('focusout', retry);
    apply();
  });
  suggestedQuestions.addEventListener('pointerleave', retry);
  suggestedQuestions.addEventListener('focusout', retry);
}

// Una sola chiamata per sessione di pagina: la lista serve per costruire le
// pill, non per tenerle aggiornate in tempo reale. Si parte solo se la hero
// è visibile — con una conversazione già a schermo le pill non si vedono e
// la richiesta sarebbe sprecata.
async function loadSuggestedPills() {
  if (pillsRequested) return;
  pillsRequested = true;
  let assets = null;
  try {
    assets = await api.listAssets();
  } catch (e) {
    return; // catalogo irraggiungibile: restano le pill statiche
  }
  if (!Array.isArray(assets) || !assets.length) return;
  const playlist = buildPillPlaylist(assets);
  if (!playlist.length) return; // solo asset ritirati o senza titolo
  pillPlaylist = playlist;
  pillOffset %= playlist.length;
  whenPillsIdle(() => showPills(false));
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

  // Conversazione nuova, suggerimenti nuovi: la hero torna visibile e non
  // deve riproporre la terna appena usata. Se il catalogo non è ancora
  // stato letto (all'avvio c'era uno storico e la hero era nascosta), è qui
  // che lo si legge.
  if (pillPlaylist) whenPillsIdle(() => showPills(true));
  else loadSuggestedPills();
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
  // libero di modificare la domanda prima di mandarla. La pill mostra
  // un'etichetta corta (il mockup le vuole su una riga sola, senza
  // andare a capo), la domanda vera sta in data-question.
  // Delega sul contenitore e non un listener per pill: i bottoni vengono
  // ricostruiti dal catalogo (e ruotati), e handler agganciati una volta
  // sola ai figli iniziali morirebbero al primo ricambio.
  suggestedQuestions.addEventListener('click', (e) => {
    const more = e.target.closest('.pill-more');
    if (more) { showPills(true); return; }
    const chip = e.target.closest('.suggested-chip');
    if (!chip) return;
    const question = chip.dataset.question || chip.textContent.trim();
    chatInput.value = question;
    chatInput.dispatchEvent(new Event('input'));
    chatInput.focus();
    // Caret in fondo: le domande per le skill finiscono con "per " e
    // aspettano che l'utente completi la frase da lì.
    chatInput.setSelectionRange(question.length, question.length);
  });

  if (history.length) renderHistory();
  // La hero (e quindi le pill) si vede solo a conversazione vuota.
  if (!history.length) loadSuggestedPills();
}
