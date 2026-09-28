#!/usr/bin/env node
// Carica nel marketplace le skill del "Toolkit AI" (cartelle con un
// SKILL.md: frontmatter YAML con `name` e `description`, poi il corpo).
//
//   node scripts/seed-skills.js [cartellaSorgente] [baseUrl]
//
// Passa per le action REST del CatalogService già deployato invece di
// scrivere su HANA: uploadAsset + reviewRevision sono gli unici percorsi
// che rispettano tutti gli invarianti del modello dati (Asset + revisione
// approvata, published, getOrCreateDefaultPlayer lato server, nessun
// chunk per le skill). Scrivere le righe a mano vorrebbe dire duplicare
// quelle regole e rischiare di divergerne.
//
// Idempotente: una skill il cui titolo è già pubblicato viene saltata.

const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE = process.env.TOOLKIT_DIR
  || 'C:\\Users\\l.botta\\OneDrive - Accenture\\AI Contest - Generale\\Toolkit AI';
const DEFAULT_BASE_URL = process.env.BILLY_URL
  || 'https://accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com';

const MAX_DESCRIPTION = 2000; // Asset.description : String(2000)
const MAX_TITLE = 200;        // Asset.title : String(200)

// Parser minimo del frontmatter: basta per la forma usata dal Toolkit
// (`key: valore` e blocchi `key: >-` / `key: |`), niente dipendenza YAML.
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  const lines = match[1].split(/\r?\n/);
  let key = null;
  let block = null;
  let buffer = [];

  const flush = () => {
    if (!key) return;
    // `>-` piega le righe in un paragrafo unico, `|` le tiene separate.
    meta[key] = block === '>' ? buffer.join(' ').trim() : buffer.join('\n').trim();
    key = null;
    buffer = [];
  };

  for (const line of lines) {
    const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (entry && !/^\s/.test(line)) {
      flush();
      const [, name, value] = entry;
      if (value === '>-' || value === '>' || value === '|' || value === '|-') {
        key = name;
        block = value[0];
      } else {
        meta[name] = value.replace(/^["']|["']$/g, '').trim();
      }
    } else if (key) {
      buffer.push(line.trim());
    }
  }
  flush();

  return { meta, body: raw.slice(match[0].length) };
}

function findSkillFiles(dir) {
  const found = [];
  const walk = (current) => {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toUpperCase() === 'SKILL.MD') found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

function toAsset(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  // Titolo leggibile: l'H1 del corpo se c'è, altrimenti lo slug del
  // frontmatter (`name`) che è tecnico ma sempre presente.
  const heading = /^#\s+(.+)$/m.exec(body);
  const title = (heading ? heading[1] : meta.name || path.basename(path.dirname(file))).trim();
  return {
    title: title.slice(0, MAX_TITLE),
    // La description è la chiave di routing dell'agente (è l'unica cosa
    // che il modello vede quando decide se caricare la skill): va
    // riportata fedele, non riassunta.
    description: (meta.description || '').slice(0, MAX_DESCRIPTION),
    type: 'skill',
    content: body.trim(),
    sourceFile: file
  };
}

async function callApi(baseUrl, route, { method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* risposta non-JSON */ }
  if (!res.ok) throw new Error(data?.error?.message || `${res.status} ${text.slice(0, 200)}`);
  return data;
}

async function main() {
  const [sourceArg, baseArg] = process.argv.slice(2);
  const sourceDir = sourceArg || DEFAULT_SOURCE;
  const baseUrl = (baseArg || DEFAULT_BASE_URL).replace(/\/$/, '');

  if (!fs.existsSync(sourceDir)) {
    console.error(`Cartella sorgente non trovata: ${sourceDir}`);
    process.exit(1);
  }

  const files = findSkillFiles(sourceDir);
  console.log(`Sorgente: ${sourceDir}`);
  console.log(`Backend : ${baseUrl}`);
  console.log(`Trovati ${files.length} SKILL.md\n`);
  if (!files.length) return;

  const existing = await callApi(baseUrl, '/rest/catalog/Asset');
  const publishedTitles = new Set((existing || []).map((a) => a.title));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const asset = toAsset(file);
    if (publishedTitles.has(asset.title)) {
      console.log(`- skip   ${asset.title} (già presente)`);
      skipped++;
      continue;
    }
    if (!asset.description) console.warn(`  ! ${asset.title}: description vuota, il routing dell'agente ne risentirà`);

    try {
      const uploaded = await callApi(baseUrl, '/rest/catalog/uploadAsset', {
        method: 'POST',
        body: {
          title: asset.title,
          description: asset.description,
          type: 'skill',
          content: asset.content
        }
      });

      // uploadAsset non restituisce la revisione: si recupera dalla coda,
      // che è anche la verifica che la revisione pending esista davvero.
      const queue = await callApi(baseUrl, '/rest/catalog/listReviewQueue');
      const pending = (queue || []).find((q) => q.kind === 'revision' && q.assetId === uploaded.ID);
      if (!pending) throw new Error('revisione pending non trovata in coda');

      await callApi(baseUrl, '/rest/catalog/reviewRevision', {
        method: 'POST',
        body: { revisionId: pending.revisionId, approve: true, validityMonths: 12 }
      });

      publishedTitles.add(asset.title);
      created++;
      console.log(`- ok     ${asset.title}`);
    } catch (e) {
      failed++;
      console.error(`- FALLITA ${asset.title}: ${e.message}`);
    }
  }

  console.log(`\nCreate ${created}, saltate ${skipped}, fallite ${failed}.`);
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

// Esportate per poter controllare il parsing senza toccare il backend.
module.exports = { parseFrontmatter, findSkillFiles, toAsset };
