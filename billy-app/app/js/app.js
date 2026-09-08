// Bootstrap: importa i componenti singleton (registrazione customElements),
// inizializza le viste, gestisce la navigazione tra viste e il routing
// cross-vista dell'evento 'open-asset' (emesso dalla chat, gestito qui per
// non accoppiare chat-view.js e catalog-view.js tra loro).
import './components/billy-modal.js';
import './components/billy-toast-container.js';
import { initChatView } from './views/chat-view.js';
import { initCatalogView, loadCatalog, openAssetDetail } from './views/catalog-view.js';
import { initUploadView } from './views/upload-view.js';
import { initQueueView, loadQueue } from './views/queue-view.js';

const views = ['chat', 'catalog', 'upload', 'queue'];

function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === name);
  });
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  if (name === 'catalog') loadCatalog();
  if (name === 'queue') loadQueue();
  closeSidebar();
}

document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// Link "interni" generati da Billy (/catalog/asset/<id>) e chip di citazione
// in chat: non sono una vera route server-side, vengono intercettati per
// aprire la vista catalogo + dettaglio invece di navigare (che darebbe 404).
document.addEventListener('open-asset', (e) => {
  showView('catalog');
  openAssetDetail(e.detail.assetId);
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

initChatView();
initCatalogView();
initUploadView();
initQueueView();
