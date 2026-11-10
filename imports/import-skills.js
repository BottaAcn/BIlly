'use strict';

// Importa skill da exports/<EXPORT_DATE>/skills.json su SharePoint.
// Usage: node import-skills.js [--date AAAA-MM-GG] [--dry-run]

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getGraphClient, getSiteId, withRetry } = require('./graph-client');

// --- Argomenti CLI ---
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dateArg = args.find(a => a.startsWith('--date'));
const EXPORT_DATE = dateArg ? dateArg.split('=')[1] || args[args.indexOf(dateArg) + 1]
                            : process.env.EXPORT_DATE;

if (!EXPORT_DATE || EXPORT_DATE.includes('XX')) {
  console.error('❌ EXPORT_DATE non impostato. Usa --date AAAA-MM-GG o imposta EXPORT_DATE nel .env');
  process.exit(1);
}

// export-hana.js produce assets.json (entità unificata), non skills.json
const ASSETS_FILE = path.resolve(__dirname, '..', 'exports', EXPORT_DATE, 'assets.json');

if (!fs.existsSync(ASSETS_FILE)) {
  console.error(`❌ File non trovato: ${ASSETS_FILE}`);
  console.error('   Esegui prima: node ../exports/export-hana.js  (dalla cartella billy-app/)');
  process.exit(1);
}

async function main() {
  const allAssets = JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8'));
  // Filtra solo gli asset di tipo 'skill' (lo schema BTP usa billy.Asset unificato)
  const skills = allAssets.filter(a => a.type === 'skill');
  console.log(`\n📦 Import skill da: ${ASSETS_FILE}`);
  console.log(`   Skill trovate: ${skills.length}`);
  if (DRY_RUN) console.log('   ⚠️  DRY-RUN attivo — nessuna chiamata API verrà eseguita\n');

  const { SHAREPOINT_SITE_URL, SKILL_INDEX_LIST_ID, SKILL_CONTENT_LIST_ID } = process.env;
  if (!SHAREPOINT_SITE_URL) throw new Error('SHAREPOINT_SITE_URL mancante nel .env');
  if (!SKILL_INDEX_LIST_ID) throw new Error('SKILL_INDEX_LIST_ID mancante nel .env — esegui prima provision-sharepoint.js');
  if (!SKILL_CONTENT_LIST_ID) throw new Error('SKILL_CONTENT_LIST_ID mancante nel .env');

  const client = getGraphClient();
  const siteId = await getSiteId(client, SHAREPOINT_SITE_URL);
  console.log(`   Site ID: ${siteId}\n`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const skill of skills) {
    const skillId = `btp-${skill.ID}`;
    const displayName = skill.title || `(senza titolo, ID ${skill.ID})`;

    if (DRY_RUN) {
      console.log(`  [DRY] Creerebbe "${displayName}" (${skillId}, ${skill.certificationLevel})`);
      successCount++;
      continue;
    }

    try {
      // 1. Verifica se esiste già (idempotenza)
      const existing = await withRetry(() =>
        client
          .api(`/sites/${siteId}/lists/${SKILL_INDEX_LIST_ID}/items`)
          .filter(`fields/SkillId eq '${skillId}'`)
          .select('id')
          .get()
      );

      if (existing.value && existing.value.length > 0) {
        console.log(`  ⏭️  "${displayName}" già presente — skip`);
        skippedCount++;
        continue;
      }

      // 2. Crea item in Skill Index (manifesto — NO Content)
      await withRetry(() =>
        client
          .api(`/sites/${siteId}/lists/${SKILL_INDEX_LIST_ID}/items`)
          .post({
            fields: {
              Title: skill.title || '(senza titolo)',
              Description: skill.description || '',
              CertificationLevel: skill.certificationLevel || 'community',
              Status: skill.published ? 'published' : 'draft',
              SkillId: skillId
            }
          })
      );

      // 3. Crea item in Skill Content (corpo completo)
      await withRetry(() =>
        client
          .api(`/sites/${siteId}/lists/${SKILL_CONTENT_LIST_ID}/items`)
          .post({
            fields: {
              Title: skill.title || '(senza titolo)',
              Content: skill.content || skill.body || '',
              SkillId: skillId,
              CertificationLevel: skill.certificationLevel || 'community',
              Version: 1
            }
          })
      );

      console.log(`  ✅ "${displayName}" (${skillId})`);
      successCount++;

      await new Promise(r => setTimeout(r, 250));

    } catch (err) {
      console.error(`  ❌ "${displayName}": ${err.message}`);
      errors.push({ skill: displayName, error: err.message });
      errorCount++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Successi:  ${successCount}`);
  console.log(`⏭️  Skippati: ${skippedCount}`);
  console.log(`❌ Errori:   ${errorCount}`);

  if (errors.length > 0) {
    console.log('\nDettaglio errori:');
    errors.forEach(e => console.log(`  - ${e.skill}: ${e.error}`));
  }

  if (errorCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n💥 Script fallito:', err.message);
  process.exit(1);
});
