// Bootstrap: importa i componenti singleton (registrazione customElements),
// inizializza le viste, gestisce la navigazione tra viste e il routing
// cross-vista dell'evento 'open-asset' (emesso dalla chat, gestito qui per
// non accoppiare chat-view.js e catalog-view.js tra loro).
import './components/billy-modal.js';
import './components/billy-toast-container.js';
import { initIntroView } from './views/intro-view.js';
import { initChatView, prefillChat } from './views/chat-view.js';
import { initCatalogView, loadCatalog, openAssetDetail } from './views/catalog-view.js';
import { initUploadView } from './views/upload-view.js';
import { initQueueView, loadQueue } from './views/queue-view.js';
import { initGameView, loadGame } from './views/game-view.js';

const views = ['chat', 'catalog', 'upload', 'queue', 'game'];

function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === name);
  });
  // .on e non .active: nel mockup la voce selezionata e' .ni.on ed e'
  // quella classe a far crescere la barretta viola a sinistra.
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.view === name);
  });
  if (name === 'catalog') loadCatalog();
  if (name === 'queue') loadQueue();
  // La classifica si ricarica a ogni ingresso come catalogo e coda: i punti
  // cambiano mentre si lavora nelle altre viste (un'approvazione ne genera),
  // una vista di punteggio ferma a quando l'app e' partita direbbe il falso.
  if (name === 'game') loadGame();
  closeSidebar();
}

// [data-view] e non .nav-item[data-view]: la stessa navigazione vale anche
// per la CTA "Start chatting" della landing, senza duplicare il handler.
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// Link "interni" generati da Billy (/catalog/asset/<id>) e chip di citazione
// in chat: non sono una vera route server-side, vengono intercettati per
// aprire la vista catalogo + dettaglio invece di navigare (che darebbe 404).
document.addEventListener('open-asset', (e) => {
  showView('catalog');
  openAssetDetail(e.detail.assetId);
});

// "Usa questa skill" su una card del catalogo: porta in chat con
// l'invocazione già scritta. Routing qui per lo stesso motivo di
// 'open-asset' — la card non conosce né la chat né api.js.
document.addEventListener('use-skill', (e) => {
  showView('chat');
  prefillChat(`Usa la skill "${e.detail.title}" per `);
});

// Stesso principio di 'open-asset': un'azione dentro una vista (es. il
// pulsante "Vai alla coda" dopo un upload riuscito) non deve importare
// showView() da app.js, disaccoppia le viste tra loro via un evento.
document.addEventListener('navigate-view', (e) => showView(e.detail.view));

// Sidebar responsive (drawer sotto ~900px, vedi main.css). Sopra quella
// soglia il pulsante hamburger resta nascosto via CSS e questo codice non
// ha alcun effetto visibile.
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('open');
  sidebarToggle.setAttribute('aria-expanded', 'false');
}
function openSidebar() {
  sidebar.classList.add('open');
  sidebarBackdrop.classList.add('open');
  sidebarToggle.setAttribute('aria-expanded', 'true');
}
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
sidebarBackdrop.addEventListener('click', closeSidebar);

// Sidebar collassabile (200px ↔ 52px). È una preferenza di lavoro, non
// uno stato della sessione: chi lavora con la barra stretta la ritrova
// stretta anche domani, quindi localStorage e non sessionStorage.
const COLLAPSED_KEY = 'billy.sidebar.collapsed';
const collapseBtn = document.getElementById('side-collapse');

function applyCollapsed(collapsed) {
  sidebar.classList.toggle('collapsed', collapsed);
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Espandi la barra laterale' : 'Comprimi la barra laterale';
  collapseBtn.setAttribute('aria-label', label);
  collapseBtn.title = label;
}

// Ripristino della preferenza. La transizione va spenta per un frame:
// altrimenti chi tiene la barra stretta la vede "richiudersi" da 200 a
// 52px ad ogni caricamento della pagina.
// Storage negato (iframe sandboxed, cookie bloccati): la barra parte
// aperta, non è un errore da propagare.
sidebar.classList.add('no-anim');
try { applyCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1'); } catch (e) { /* ignorato */ }
requestAnimationFrame(() => sidebar.classList.remove('no-anim'));

collapseBtn.addEventListener('click', () => {
  const collapsed = !sidebar.classList.contains('collapsed');
  applyCollapsed(collapsed);
  try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignorato */ }
});

// Logo neon in sidebar: se il file non c'è (o non è ancora stato fornito)
// si mostra il nome testuale al suo posto.
const brandLogo = document.getElementById('brand-logo');
const brandName = document.getElementById('brand-name');
// complete/naturalWidth oltre al listener: questo modulo e' differito, se
// il caricamento e' gia' fallito l'evento 'error' e' passato da un pezzo.
const showBrandFallback = () => {
  brandLogo.hidden = true;
  brandName.hidden = false;
};
if (brandLogo.complete && brandLogo.naturalWidth === 0) showBrandFallback();
brandLogo.addEventListener('error', showBrandFallback);

initIntroView();
initChatView();
initCatalogView();
initUploadView();
initQueueView();
initGameView();
