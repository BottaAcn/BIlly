// exports/export-hana.js
// Esporta tutti gli asset Billy (skill, documenti, interfacce, applicazioni, agenti)
// e i chunk RAG dal DB HANA di produzione verso file JSON locali.
//
// Prerequisiti:
//   - Eseguire dalla cartella billy-app/: cd billy-app && node ../exports/export-hana.js
//   - Il file .cdsrc.json / package.json deve avere il profilo HANA configurato
//   - Le credenziali HANA devono essere disponibili (VCAP_SERVICES o .env)
//
// Output: exports/AAAA-MM-GG/
//   assets.json         — tutti gli Asset pubblicati (tutti i tipi, content incluso)
//   assets-all.json     — tutti gli Asset inclusi bozze e pending
//   chunks.json         — chunk RAG (text, chunkIndex, certificationLevel, asset.ID)
//   players.json        — utenti (per risolvere uploadedBy)
//   revisions.json      — revisioni approvate
//   capabilities.json   — AgentCapability (agente → skill/application)
//   summary.json        — conteggi per tipo e certificazione

'use strict';

const cds = require('@sap/cds');
const fs  = require('fs');
const path = require('path');

async function exportAll() {
  // Connessione al DB (usa le credenziali del profilo attivo in package.json / .cdsrc.json)
  const db = await cds.connect.to('db');

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, today);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\n📁 Export in: ${outDir}\n`);

  // Helper: salva JSON e stampa conteggio
  function save(filename, data) {
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    const size = Math.round(fs.statSync(filePath).size / 1024);
    console.log(`  ✅ ${filename}: ${Array.isArray(data) ? data.length : Object.keys(data).length} record (${size} KB)`);
    return data;
  }

  // ── 1. ASSET PUBBLICATI (tutti i tipi, content incluso) ──────────────────────
  console.log('1. Asset pubblicati...');
  const assets = await db.run(
    SELECT.from('billy.Asset')
      .columns(
        'ID', 'title', 'description', 'type', 'certificationLevel',
        'published', 'content', 'externalLink',
        'certifiedAt', 'certificationExpiresAt',
        'createdAt', 'modifiedAt',
        'uploadedBy_ID', 'certifiedBy_ID'
      )
      .where({ published: true })
      .orderBy('type', 'certificationLevel', 'title')
  );
  save('assets.json', assets);

  // ── 2. TUTTI GLI ASSET (inclusi bozza, pending) ───────────────────────────────
  console.log('2. Tutti gli asset (incluse bozze)...');
  const assetsAll = await db.run(
    SELECT.from('billy.Asset')
      .columns(
        'ID', 'title', 'description', 'type', 'certificationLevel',
        'published', 'content', 'externalLink',
        'certifiedAt', 'certificationExpiresAt',
        'createdAt', 'modifiedAt',
        'uploadedBy_ID', 'certifiedBy_ID'
      )
      .orderBy('type', 'certificationLevel', 'title')
  );
  save('assets-all.json', assetsAll);

  // ── 3. CHUNK RAG (no embedding — vettori non serializzabili in JSON utile) ────
  console.log('3. Chunk RAG...');
  let chunks = [];
  try {
    chunks = await db.run(
      SELECT.from('billy.Chunk')
        .columns('ID', 'asset_ID', 'text', 'chunkIndex', 'certificationLevel')
        .orderBy('asset_ID', 'chunkIndex')
    );
    save('chunks.json', chunks);
  } catch (e) {
    console.warn(`  ⚠️  Chunk: ${e.message} — skip`);
  }

  // ── 4. PLAYER ────────────────────────────────────────────────────────────────
  console.log('4. Player...');
  let players = [];
  try {
    players = await db.run(
      SELECT.from('billy.Player')
        .columns('ID', 'userId', 'displayName', 'department', 'seniorityLevel',
                 'isCertifier', 'isAdmin', 'totalPoints')
        .orderBy('displayName')
    );
    save('players.json', players);
  } catch (e) {
    console.warn(`  ⚠️  Player: ${e.message} — skip`);
  }

  // ── 5. REVISIONI APPROVATE ────────────────────────────────────────────────────
  console.log('5. Revisioni approvate...');
  let revisions = [];
  try {
    revisions = await db.run(
      SELECT.from('billy.AssetRevision')
        .columns('ID', 'asset_ID', 'title', 'description', 'content',
                 'type', 'externalLink', 'status',
                 'submittedBy_ID', 'reviewedBy_ID', 'reviewedAt',
                 'createdAt', 'modifiedAt')
        .where({ status: 'approved' })
        .orderBy('asset_ID', 'createdAt')
    );
    save('revisions.json', revisions);
  } catch (e) {
    console.warn(`  ⚠️  AssetRevision: ${e.message} — skip`);
  }

  // ── 6. AGENT CAPABILITIES ────────────────────────────────────────────────────
  console.log('6. AgentCapability...');
  let capabilities = [];
  try {
    capabilities = await db.run(
      SELECT.from('billy.AgentCapability')
        .columns('ID', 'agent_ID', 'capability_ID', 'kind', 'position')
        .orderBy('agent_ID', 'position')
    );
    save('capabilities.json', capabilities);
  } catch (e) {
    console.warn(`  ⚠️  AgentCapability: ${e.message} — skip`);
  }

  // ── 7. SUMMARY ───────────────────────────────────────────────────────────────
  console.log('7. Summary...');
  const summary = {
    exportDate: today,
    exportedAt: new Date().toISOString(),
    counts: {
      assetsPublished: assets.length,
      assetsTotal: assetsAll.length,
      chunks: chunks.length,
      players: players.length,
      revisions: revisions.length,
      capabilities: capabilities.length,
    },
    byType: {},
    byCertLevel: {},
  };

  for (const a of assetsAll) {
    summary.byType[a.type] = (summary.byType[a.type] || 0) + 1;
    summary.byCertLevel[a.certificationLevel] = (summary.byCertLevel[a.certificationLevel] || 0) + 1;
  }

  // Skill con content vuoto = potenziale problema
  const skillsWithoutContent = assets.filter(a => a.type === 'skill' && !a.content);
  if (skillsWithoutContent.length > 0) {
    summary.warnings = skillsWithoutContent.map(a => `Skill senza content: "${a.title}" (${a.ID})`);
    summary.warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
  }

  save('summary.json', summary);

  // ── RIEPILOGO FINALE ──────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log(`✅ Export completato: ${outDir}`);
  console.log(`   Asset pubblicati : ${assets.length}`);
  console.log(`   Asset totali     : ${assetsAll.length}`);
  console.log(`   Chunk RAG        : ${chunks.length}`);
  console.log(`   Player           : ${players.length}`);
  console.log('\n   Per tipo:');
  Object.entries(summary.byType).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  console.log('\n   Per certificazione:');
  Object.entries(summary.byCertLevel).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  console.log('\n⚠️  IMPORTANTE: gli embedding (vettori 3072-dim) NON sono inclusi.');
  console.log('   I chunk su Copilot Studio verranno re-indicizzati da Microsoft.');
  console.log('════════════════════════════════════════\n');
}

exportAll().catch(err => {
  console.error('\n❌ Export fallito:', err.message);
  console.error(err.stack);
  process.exit(1);
});
