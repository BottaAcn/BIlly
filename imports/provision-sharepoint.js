'use strict';

// Provvede tutta la struttura SharePoint necessaria a Billy via Graph API.
// Idempotente: non ricrea library o colonne già esistenti.
// Usage: node provision-sharepoint.js
// Output: stampa tutti gli ID delle liste create (da incollare nel .env)

require('dotenv').config();
const { getGraphClient, getSiteId, withRetry } = require('./graph-client');

// ─── Definizioni delle library ───────────────────────────────────────────────

const CERT_LEVEL_CHOICES = ['certified', 'certifiedOutdated', 'community', 'deprecated'];
const STATUS_CHOICES_ASSET = ['draft', 'in-review', 'published', 'deprecated'];
const ASSET_TYPE_CHOICES = ['document', 'skill', 'interface', 'application', 'agent'];

const LIBRARIES = [
  {
    key: 'SKILL_INDEX_LIST_ID',
    name: 'Skill Index',
    description: 'Manifesto skill Billy: solo titolo e descrizione. NON contiene il corpo completo.',
    columns: [
      { name: 'Description',         type: 'multilineText', plain: true },
      { name: 'CertificationLevel',  type: 'choice', choices: CERT_LEVEL_CHOICES, default: 'certified' },
      { name: 'Status',              type: 'choice', choices: STATUS_CHOICES_ASSET, default: 'published' },
      { name: 'Owner',               type: 'person' },
      { name: 'SkillId',             type: 'text' }
    ]
  },
  {
    key: 'SKILL_CONTENT_LIST_ID',
    name: 'Skill Content',
    description: 'Corpo completo delle skill. Letto solo dall\'action LoadSkill — non è un knowledge source.',
    columns: [
      { name: 'Content',             type: 'multilineText', plain: false },
      { name: 'SkillId',             type: 'text' },
      { name: 'CertificationLevel',  type: 'choice', choices: CERT_LEVEL_CHOICES, default: 'certified' },
      { name: 'Version',             type: 'number', default: 1 }
    ]
  },
  {
    key: 'CERTIFIED_DOCS_LIST_ID',
    name: 'Certified Documents',
    description: 'Documenti tecnici certificati e validati da senior Accenture.',
    columns: [
      { name: 'AssetType',           type: 'choice', choices: ASSET_TYPE_CHOICES, default: 'document' },
      { name: 'CertificationLevel',  type: 'choice', choices: CERT_LEVEL_CHOICES, default: 'certified' },
      { name: 'Status',              type: 'choice', choices: STATUS_CHOICES_ASSET, default: 'draft' },
      { name: 'Owner',               type: 'person' },
      { name: 'Description',         type: 'multilineText', plain: true },
      { name: 'ReviewedBy',          type: 'person' },
      { name: 'ReviewNotes',         type: 'multilineText', plain: true },
      { name: 'ExternalLink',        type: 'text' },
      { name: 'Version',             type: 'number', default: 1 }
    ]
  },
  {
    key: 'COMMUNITY_DOCS_LIST_ID',
    name: 'Community Documents',
    description: 'Documenti e contributi community, non validati da senior.',
    columns: [
      { name: 'AssetType',           type: 'choice', choices: ASSET_TYPE_CHOICES, default: 'document' },
      { name: 'CertificationLevel',  type: 'choice', choices: CERT_LEVEL_CHOICES, default: 'community' },
      { name: 'Status',              type: 'choice', choices: STATUS_CHOICES_ASSET, default: 'draft' },
      { name: 'Owner',               type: 'person' },
      { name: 'Description',         type: 'multilineText', plain: true },
      { name: 'ReviewedBy',          type: 'person' },
      { name: 'ReviewNotes',         type: 'multilineText', plain: true },
      { name: 'ExternalLink',        type: 'text' },
      { name: 'Version',             type: 'number', default: 1 }
    ]
  },
  {
    key: 'AGENT_CONFIGS_LIST_ID',
    name: 'Agent Configs',
    description: 'Configurazioni dei sotto-agenti Billy (Connected Agents in Copilot Studio).',
    columns: [
      { name: 'AgentId',             type: 'text' },
      { name: 'SystemPrompt',        type: 'multilineText', plain: false },
      { name: 'AssignedSkills',      type: 'multilineText', plain: true },
      { name: 'CopilotStudioAgentId', type: 'text' },
      { name: 'Status',              type: 'choice', choices: ['draft', 'active', 'disabled'], default: 'draft' },
      { name: 'Owner',               type: 'person' },
      { name: 'Description',         type: 'multilineText', plain: true }
    ]
  }
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildColumnDef(col) {
  const base = { name: col.name, hidden: false };
  switch (col.type) {
    case 'text':
      return { ...base, text: {} };
    case 'multilineText':
      return { ...base, multilineText: { allowMultipleLines: true, appendChangesToExistingText: false, linesForEditing: col.plain ? 6 : 20, textType: col.plain ? 'plain' : 'richText' } };
    case 'choice':
      return { ...base, choice: { allowTextEntry: false, choices: col.choices, displayAs: 'dropDownMenu', defaultValue: { value: col.default || col.choices[0] } } };
    case 'person':
      return { ...base, personOrGroup: { allowMultipleSelection: false, displayAs: 'nameWithPresence', chooseFromType: 'peopleOnly' } };
    case 'number':
      return { ...base, number: { decimalPlaces: 'none', minimum: 0, defaultValue: col.default != null ? String(col.default) : '0' } };
    default:
      return { ...base, text: {} };
  }
}

async function getOrCreateList(client, siteId, lib) {
  // Cerca lista esistente per nome
  const lists = await withRetry(() =>
    client.api(`/sites/${siteId}/lists`).filter(`displayName eq '${lib.name}'`).get()
  );
  if (lists.value && lists.value.length > 0) {
    console.log(`  ⏭️  "${lib.name}" già esiste (ID: ${lists.value[0].id})`);
    return lists.value[0].id;
  }

  const created = await withRetry(() =>
    client.api(`/sites/${siteId}/lists`).post({
      displayName: lib.name,
      description: lib.description,
      list: { template: 'documentLibrary' }
    })
  );
  console.log(`  ✅ "${lib.name}" creata (ID: ${created.id})`);
  return created.id;
}

async function getExistingColumnNames(client, siteId, listId) {
  const cols = await withRetry(() =>
    client.api(`/sites/${siteId}/lists/${listId}/columns`).select('name').get()
  );
  return new Set((cols.value || []).map(c => c.name));
}

async function addColumns(client, siteId, listId, columns) {
  const existing = await getExistingColumnNames(client, siteId, listId);
  for (const col of columns) {
    if (existing.has(col.name)) {
      console.log(`    ⏭️  Colonna "${col.name}" già presente`);
      continue;
    }
    try {
      await withRetry(() =>
        client.api(`/sites/${siteId}/lists/${listId}/columns`).post(buildColumnDef(col))
      );
      console.log(`    ✅ Colonna "${col.name}" aggiunta`);
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`    ❌ Colonna "${col.name}": ${err.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { SHAREPOINT_SITE_URL } = process.env;
  if (!SHAREPOINT_SITE_URL) throw new Error('SHAREPOINT_SITE_URL mancante nel .env');

  console.log(`\n🏗️  Provisioning SharePoint: ${SHAREPOINT_SITE_URL}\n`);

  const client = getGraphClient();
  const siteId = await getSiteId(client, SHAREPOINT_SITE_URL);
  console.log(`Site ID: ${siteId}\n`);

  const results = {};

  for (const lib of LIBRARIES) {
    console.log(`📚 Library: ${lib.name}`);
    const listId = await getOrCreateList(client, siteId, lib);
    results[lib.key] = listId;
    await addColumns(client, siteId, listId, lib.columns);
    console.log('');
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('─'.repeat(60));
  console.log('✅ Provisioning completato. Copia questi valori nel .env:\n');
  console.log(`SHAREPOINT_SITE_ID=${siteId}`);
  for (const [key, id] of Object.entries(results)) {
    console.log(`${key}=${id}`);
  }
  console.log('');
}

main().catch(err => {
  console.error('\n💥 Provisioning fallito:', err.message);
  if (err.body) console.error(JSON.stringify(JSON.parse(err.body), null, 2));
  process.exit(1);
});
