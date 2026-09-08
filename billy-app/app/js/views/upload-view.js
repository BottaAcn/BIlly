import { api, readFileAsBase64 } from '../api.js';
import { escapeHtml } from '../utils.js';
import { refreshQueueCount } from './queue-view.js';

// Stesso limite del backend (srv/lib/text-extraction.js, MAX_FILE_SIZE_BYTES):
// validare qui evita un giro di rete inutile per un file che il server
// rifiuterebbe comunque.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

function isAllowedFile(file) {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function initUploadView() {
  document.querySelectorAll('[data-content-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-content-tab]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isText = tab.dataset.contentTab === 'text';
      document.getElementById('content-tab-text').style.display = isText ? 'block' : 'none';
      document.getElementById('content-tab-file').style.display = isText ? 'none' : 'block';
    });
  });

  const fileInput = document.getElementById('up-file');
  const fileDropLabel = document.getElementById('file-drop-label');
  const alertBox = document.getElementById('upload-alert');

  function applySelectedFile(file) {
    if (!file) return;
    if (!isAllowedFile(file)) {
      alertBox.innerHTML = `<div class="alert alert-error">Formato non supportato: usa PDF, DOCX o TXT.</div>`;
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alertBox.innerHTML = `<div class="alert alert-error">File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024}MB).</div>`;
      return;
    }
    alertBox.innerHTML = '';
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    const sizeLabel = (file.size / 1024).toFixed(0);
    document.getElementById('file-drop-text').textContent = `Selezionato: ${file.name} (${sizeLabel} KB)`;
    fileDropLabel.classList.add('has-file');
  }

  fileInput.addEventListener('change', () => applySelectedFile(fileInput.files[0]));

  // Drag-and-drop reale: prima il testo lo prometteva ma non c'era nessun
  // listener collegato, il file andava comunque selezionato a click.
  ['dragover', 'dragenter'].forEach((evt) => {
    fileDropLabel.addEventListener(evt, (e) => {
      e.preventDefault();
      fileDropLabel.classList.add('dragover');
    });
  });
  ['dragleave', 'dragend'].forEach((evt) => {
    fileDropLabel.addEventListener(evt, () => fileDropLabel.classList.remove('dragover'));
  });
  fileDropLabel.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropLabel.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    applySelectedFile(file);
  });

  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('upload-submit');
    alertBox.innerHTML = '';

    const title = document.getElementById('up-title').value.trim();
    const description = document.getElementById('up-description').value.trim();
    const type = document.getElementById('up-type').value;
    const externalLink = document.getElementById('up-link').value.trim();
    const isTextTab = document.querySelector('[data-content-tab].active').dataset.contentTab === 'text';
    const content = isTextTab ? document.getElementById('up-content').value.trim() : '';
    const file = !isTextTab ? fileInput.files[0] : null;

    if (!title) { alertBox.innerHTML = `<div class="alert alert-error">Il titolo è obbligatorio.</div>`; return; }
    if (!content && !file) { alertBox.innerHTML = `<div class="alert alert-error">Fornisci un testo oppure un file.</div>`; return; }
    if (file && !isAllowedFile(file)) { alertBox.innerHTML = `<div class="alert alert-error">Formato non supportato: usa PDF, DOCX o TXT.</div>`; return; }
    if (file && file.size > MAX_FILE_SIZE) { alertBox.innerHTML = `<div class="alert alert-error">File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024}MB).</div>`; return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> Caricamento...`;
    try {
      const body = { title, description, type, content, externalLink };
      if (file) {
        body.fileContent = await readFileAsBase64(file);
        body.fileName = file.name;
        body.fileMimeType = file.type;
      }
      await api.uploadAsset(body);
      alertBox.innerHTML = `<div class="alert alert-success">Asset caricato: è in coda di revisione, non ancora visibile nel catalogo.
        <button type="button" class="btn btn-sm" id="upload-goto-queue" style="margin-left:8px">Vai alla coda di revisione</button>
      </div>`;
      document.getElementById('upload-goto-queue').addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('navigate-view', { detail: { view: 'queue' } }));
      });
      e.target.reset();
      document.getElementById('file-drop-text').textContent = 'Trascina un file qui o clicca per selezionarlo (PDF, DOCX, TXT)';
      fileDropLabel.classList.remove('has-file');
      refreshQueueCount();
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Carica (va in revisione)';
    }
  });
}
