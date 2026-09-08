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

initChatView();
initCatalogView();
initUploadView();
initQueueView();
