const cds = require('@sap/cds');
const { readFileSync } = require('fs');
const path = require('path');

if (!process.env.AICORE_SERVICE_KEY) {
  try {
    const keyPath = path.join(__dirname, '..', 'service-key.local.json');
    process.env.AICORE_SERVICE_KEY = readFileSync(keyPath, 'utf-8');
  } catch (e) {
    // No local key file — expected on Cloud Foundry, where AICORE_SERVICE_KEY
    // is set directly as an application env var (cf set-env), not via file.
  }
}

const RESOURCE_GROUP = 'team-ai-contest-3';
const EMBEDDING_MODEL = 'text-embedding-3-large';
const LLM_MODEL = 'anthropic--claude-4.6-sonnet';

// Nessun utente reale finché XSUAA non è attiva (D15). Placeholder tecnico
// da rimuovere quando l'auth reale sostituirà questo utente fittizio con
// l'utente autenticato (cds.context.user).
const ANONYMOUS_USER_ID = 'anonymous';

module.exports = class BillyService extends cds.ApplicationService {
  async init() {
    this.on('uploadAsset', this.onUploadAsset);
    this.on('askBilly', this.onAskBilly);
    return super.init();
  }

  // TODO(D15): rimuovere quando XSUAA è attiva — sostituire con il player
  // legato all'utente autenticato reale invece di un utente tecnico fisso.
  getOrCreateDefaultPlayer = async () => {
    const existing = await SELECT.one.from('billy.Player').where({ userId: ANONYMOUS_USER_ID });
    if (existing) return existing;

    const ID = crypto.randomUUID();
    await INSERT.into('billy.Player').entries({
      ID,
      userId: ANONYMOUS_USER_ID,
      displayName: 'Utente anonimo'
    });
    return { ID, userId: ANONYMOUS_USER_ID, displayName: 'Utente anonimo' };
  };

  onUploadAsset = async (req) => {
    const { title, content } = req.data;
    const player = await this.getOrCreateDefaultPlayer();

    const assetID = crypto.randomUUID();
    await INSERT.into('billy.Asset').entries({
      ID: assetID,
      title,
      type: 'document',
      certificationLevel: 'community',
      uploadedBy_ID: player.ID
    });

    // @sap-ai-sdk è ESM-only — dynamic import da questo modulo CommonJS
    // (funziona correttamente in Node, a differenza di un import statico
    // con path grezzo, vedi bug Windows già risolto in v0.0.1).
    const { AzureOpenAiEmbeddingClient } = await import('@sap-ai-sdk/foundation-models');
    const embedClient = new AzureOpenAiEmbeddingClient({
      modelName: EMBEDDING_MODEL,
      resourceGroup: RESOURCE_GROUP
    });
    const response = await embedClient.run({ input: [content] });
    const embedding = response.getEmbedding();

    // Fase 0: 1 asset = 1 chunk (nessun chunking reale — Fase 1).
    await INSERT.into('billy.Chunk').entries({
      ID: crypto.randomUUID(),
      asset_ID: assetID,
      text: content,
      embedding: `[${embedding.join(',')}]`,
      certificationLevel: 'community',
      chunkIndex: 0
    });

    return { ID: assetID, title, type: 'document', certificationLevel: 'community' };
  };

  onAskBilly = async (req) => {
    const { question } = req.data;

    const { AzureOpenAiEmbeddingClient } = await import('@sap-ai-sdk/foundation-models');
    const { OrchestrationClient } = await import('@sap-ai-sdk/orchestration');

    const embedClient = new AzureOpenAiEmbeddingClient({
      modelName: EMBEDDING_MODEL,
      resourceGroup: RESOURCE_GROUP
    });
    const qEmbedding = (await embedClient.run({ input: [question] })).getEmbedding();

    // Fase 0: nessuna esclusione/pesatura per certificationLevel ancora
    // (Fase 1). "TEXT" va quotata: è parola riservata in SQL HANA.
    const rows = await cds.run(
      `SELECT TOP 3 c."ID" as "ID", a."TITLE" as "TITLE", c."TEXT" as "TEXT",
              COSINE_SIMILARITY(c."EMBEDDING", TO_REAL_VECTOR(?)) AS "SIMILARITY"
       FROM "BILLY_CHUNK" as c
       JOIN "BILLY_ASSET" as a ON a."ID" = c."ASSET_ID"
       ORDER BY "SIMILARITY" DESC`,
      [`[${qEmbedding.join(',')}]`]
    );

    const context = rows.length
      ? rows.map((r) => `- ${r.TITLE}: ${r.TEXT}`).join('\n')
      : '(nessun documento in archivio)';

    const llm = new OrchestrationClient(
      { promptTemplating: { model: { name: LLM_MODEL } } },
      { resourceGroup: RESOURCE_GROUP }
    );
    const res = await llm.chatCompletion({
      messages: [
        { role: 'system', content: `Rispondi usando solo questo contesto:\n${context}` },
        { role: 'user', content: question }
      ]
    });

    return {
      answer: res.getContent(),
      sources: rows.map((r) => ({ title: r.TITLE, similarity: r.SIMILARITY }))
    };
  };
};
