'use strict';

// Importa documenti da exports/<EXPORT_DATE>/documents.json su SharePoint.
// I chunk vengono riassemblati in documenti completi e caricati come file .txt.
// Usage: node import-documents.js [--date AAAA-MM-GG] [--dry-run]

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getGraphClient, getSiteId, withRetry } = require('./graph-client');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dateArg = args.find(a => a.startsWith('--date'));
const EXPORT_DATE = dateArg ? dateArg.split('=')[1] || args[args.indexOf(dateArg) + 1]
                            : process.env.EXPORT_DATE;

if (!EXPORT_DATE || EXPORT_DATE.includes('XX')) {
  console.error('❌ EXPORT_DATE non impostato. Usa --date AAAA-MM-GG o imposta EXPORT_DATE nel .env');
  process.exit(1);
}

// export-hana.js produce assets.json (asset) + chunks.json (chunk RAG) — non documents.json
const ASSETS_FILE = path.resolve(__dirname, '..', 'exports', EXPORT_DATE, 'assets.json');
const CHUNKS_FILE = path.resolve(__dirname, '..', 'exports', EXPORT_DATE, 'chunks.json');

if (!fs.existsSync(ASSETS_FILE)) {
  console.error(`❌ File non trovato: ${ASSETS_FILE}`);
  console.error('   Esegui prima: node ../exports/export-hana.js  (dalla cartella billy-app/)');
  process.exit(1);
}
if (!fs.existsSync(CHUNKS_FILE)) {
  console.error(`❌ File non trovato: ${CHUNKS_FILE}`);
  console.error('   Assicurati che export-hana.js abbia esportato anche i chunk RAG.');
  process.exit(1);
}

function safeFileName(title) {
  return title.replace(/[^a-zA-Z0-9 _\-àèìòùÀÈÌÒÙ]/g, '_').trim().substring(0, 100);
}

function isCertifiedLevel(level) {
  return level === 'certified' || level === 'certifiedOutdated';
}

async function getDriveId(client, siteId) {
  const drives = await withRetry(() =>
    client.api(`/sites/${siteId}/drives`).get()
  );
  if (!drives.value || drives.value.length === 0) {
    throw new Error('Nessun drive trovato nel sito SharePoint');
  }
  // Prende il primo drive (Documents library di default)
  return drives.value[0].id;
}

async function getListDriveForLibrary(client, siteId, listId) {
  // Recupera il drive associato a una specifica document library
  try {
    const list = await withRetry(() =>
      client.api(`/sites/${siteId}/lists/${listId}`).select('id,name').get()
    );
    // Il drive della lista ha lo stesso nome della lista
    const drives = await withRetry(() =>
      client.api(`/sites/${siteId}/drives`).get()
    );
    const drive = drives.value.find(d => d.name === list.name);
    return drive ? drive.id : drives.value[0].id;
  } catch {
    return null;
  }
}

async function main() {
  // Carica asset e chunk — lo schema BTP usa billy.Asset (unificato) + billy.Chunk separato
  const allAssets = JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8'));
  const docAssets = allAssets.filter(a => a.type === 'document');
  const assetMap = new Map(docAssets.map(a => [a.ID, a]));

  const chunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, 'utf8'));

  // Raggruppa chunk per asset_ID (campo nel schema BTP — non documentId)
  const byDoc = new Map();
  for (const chunk of chunks) {
    const key = chunk.asset_ID;
    if (!key || !assetMap.has(key)) continue; // ignora chunk di asset non-document
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key).push(chunk);
  }

  console.log(`\n📄 Import documenti da: ${ASSETS_FILE} + ${CHUNKS_FILE}`);
  console.log(`   Asset documento totali: ${docAssets.length}`);
  console.log(`   Con chunk RAG: ${byDoc.size}`);
  console.log(`   Senza chunk (upload diretto content): ${docAssets.length - byDoc.size}`);
  if (DRY_RUN) console.log('   ⚠️  DRY-RUN attivo\n');

  const { SHAREPOINT_SITE_URL, CERTIFIED_DOCS_LIST_ID, COMMUNITY_DOCS_LIST_ID } = process.env;
  if (!SHAREPOINT_SITE_URL) throw new Error('SHAREPOINT_SITE_URL mancante nel .env');
  if (!CERTIFIED_DOCS_LIST_ID || !COMMUNITY_DOCS_LIST_ID) {
    throw new Error('CERTIFIED_DOCS_LIST_ID o COMMUNITY_DOCS_LIST_ID mancanti — esegui prima provision-sharepoint.js');
  }

  const client = getGraphClient();
  const siteId = await getSiteId(client, SHAREPOINT_SITE_URL);

  const certDriveId = await getListDriveForLibrary(client, siteId, CERTIFIED_DOCS_LIST_ID);
  const commDriveId = await getListDriveForLibrary(client, siteId, COMMUNITY_DOCS_LIST_ID);
  const fallbackDriveId = await getDriveId(client, siteId);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const errors = [];

  // Gestisce anche asset documento senza chunk (content direttamente nell'asset)
  const docsToProcess = new Map();
  for (const asset of docAssets) {
    const chunks = byDoc.get(asset.ID);
    docsToProcess.set(asset.ID, { asset, chunks: chunks || [] });
  }

  for (const [docId, { asset, chunks: docChunks }] of docsToProcess) {
    // Testo: preferisce i chunk riassemblati, fallback al campo content dell'asset
    let fullText;
    if (docChunks.length > 0) {
      docChunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
      fullText = docChunks.map(c => c.text || '').join('\n\n');
    } else {
      fullText = asset.content || asset.description || '';
    }
    const title = asset.title || `documento-${docId}`;
    const certLevel = asset.certificationLevel || 'community';
    const fileName = `${safeFileName(title)}.txt`;

    if (DRY_RUN) {
      const target = isCertifiedLevel(certLevel) ? 'Certified Documents' : 'Community Documents';
      console.log(`  [DRY] "${title}" → ${target} (${docChunks.length} chunk, ${certLevel})`);
      successCount++;
      continue;
    }

    try {
      const driveId = isCertifiedLevel(certLevel)
        ? (certDriveId || fallbackDriveId)
        : (commDriveId || fallbackDriveId);

      // Upload file
      await withRetry(() =>
        client
          .api(`/drives/${driveId}/root:/${fileName}:/content`)
          .header('Content-Type', 'text/plain; charset=utf-8')
          .put(Buffer.from(fullText, 'utf8'))
      );

      // Recupera item appena creato per aggiornare i metadati
      const uploaded = await withRetry(() =>
        client
          .api(`/drives/${driveId}/root:/${fileName}`)
          .select('id,listItem')
          .expand('listItem')
          .get()
      );

      if (uploaded.listItem) {
        const listId = isCertifiedLevel(certLevel) ? CERTIFIED_DOCS_LIST_ID : COMMUNITY_DOCS_LIST_ID;
        await withRetry(() =>
          client
            .api(`/sites/${siteId}/lists/${listId}/items/${uploaded.listItem.id}/fields`)
            .patch({
              AssetType: 'document',
              CertificationLevel: certLevel,
              Status: asset.published ? 'published' : 'draft',
              Description: title
            })
        );
      }

      console.log(`  ✅ "${title}" (${docChunks.length} chunk → ${fileName})`);
      successCount++;

      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`  ❌ "${title}": ${err.message}`);
      errors.push({ doc: title, error: err.message });
      errorCount++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Successi:  ${successCount}`);
  console.log(`⏭️  Skippati: ${skippedCount}`);
  console.log(`❌ Errori:   ${errorCount}`);

  if (errors.length > 0) {
    console.log('\nDettaglio errori:');
    errors.forEach(e => console.log(`  - ${e.doc}: ${e.error}`));
  }

  if (errorCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n💥 Script fallito:', err.message);
  process.exit(1);
});
