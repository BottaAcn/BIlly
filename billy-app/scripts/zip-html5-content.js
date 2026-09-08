// Fase 6 — html5-apps-repo si aspetta, per ogni contenuto caricato, uno zip
// esterno che contenga uno zip interno per app (verificato con un deploy
// reale: "Invalid file format. The request body must include a zip file
// that contains a zip file for each HTML5 application"). mbt non produce
// questa struttura annidata da solo per un modulo html5 statico (nessun
// build step) — vedi fase6-checklist.md §1.6 per il dettaglio dei tentativi
// falliti. Qui produciamo noi lo zip interno (billy-ui.zip); mbt impacchetta
// poi la cartella html5-content/ come al solito, ottenendo lo zip esterno
// che lo contiene — esattamente la struttura richiesta.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const APP_DIR = path.join(__dirname, '..', 'app');
const OUT_DIR = path.join(__dirname, '..', 'html5-content');
const OUT_FILE = path.join(OUT_DIR, 'billy-ui.zip');

function addDir(zip, dir, base) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) addDir(zip, full, base);
    else zip.file(rel, fs.readFileSync(full));
  }
}

async function main() {
  const zip = new JSZip();
  addDir(zip, APP_DIR, APP_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(OUT_FILE, buffer);
  console.log(`html5 content zippato: ${OUT_FILE} (${buffer.length} byte)`);
}

main();
