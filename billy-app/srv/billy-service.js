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

// Chunking a caratteri, deliberatamente semplice: da rivedere quando si
// avranno documenti reali della practice da usare per misurare la qualità
// del retrieval (architecture.md §4, D8 — non assumere, misurare).
const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 100;

function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// Peso applicato alla similarity grezza in base allo stato di certificazione
// (architecture.md §4 / D10). 'deprecated' non compare qui: è escluso a
// monte dalla query, non solo penalizzato.
const CERTIFICATION_WEIGHT_SQL = `
  CASE c."CERTIFICATIONLEVEL"
    WHEN 'certified' THEN 1.0
    WHEN 'certifiedOutdated' THEN 0.8
    WHEN 'community' THEN 0.6
    ELSE 0.6
  END`;

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

    const segments = chunkText(content);
    for (let i = 0; i < segments.length; i++) {
      const response = await embedClient.run({ input: [segments[i]] });
      const embedding = response.getEmbedding();
      await INSERT.into('billy.Chunk').entries({
        ID: crypto.randomUUID(),
        asset_ID: assetID,
        text: segments[i],
        embedding: `[${embedding.join(',')}]`,
        certificationLevel: 'community',
        chunkIndex: i
      });
    }

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

    // "TEXT" va quotata: è parola riservata in SQL HANA. Esclude i chunk
    // di asset 'deprecated' (WHERE, non solo penalizzati) e pesa la
    // similarity per certificationLevel (architecture.md §4, D10).
    const rows = await cds.run(
      `SELECT TOP 3 a."ID" as "ASSETID", a."TITLE" as "TITLE", c."TEXT" as "TEXT",
              c."CERTIFICATIONLEVEL" as "CERTIFICATIONLEVEL",
              COSINE_SIMILARITY(c."EMBEDDING", TO_REAL_VECTOR(?)) * ${CERTIFICATION_WEIGHT_SQL} AS "SIMILARITY"
       FROM "BILLY_CHUNK" as c
       JOIN "BILLY_ASSET" as a ON a."ID" = c."ASSET_ID"
       WHERE c."CERTIFICATIONLEVEL" != 'deprecated'
       ORDER BY "SIMILARITY" DESC`,
      [`[${qEmbedding.join(',')}]`]
    );

    const context = rows.length
      ? rows.map((r) => `- [${r.CERTIFICATIONLEVEL}] ${r.TITLE}: ${r.TEXT}`).join('\n')
      : '(nessun documento in archivio)';

    const llm = new OrchestrationClient(
      { promptTemplating: { model: { name: LLM_MODEL } } },
      { resourceGroup: RESOURCE_GROUP }
    );
    const res = await llm.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `Rispondi usando solo questo contesto. Ogni fonte è preceduta dal suo stato di certificazione tra parentesi quadre. Se una fonte usata per la risposta non è "certified", avvisa esplicitamente l'utente che l'informazione non è (ancora) certificata.\n${context}`
        },
        { role: 'user', content: question }
      ]
    });

    return {
      answer: res.getContent(),
      // Link placeholder: non è una route reale finché il frontend/catalogo
      // (Fase 4) non esiste. È il contratto che il frontend implementerà.
      sources: rows.map((r) => ({
        assetId: r.ASSETID,
        title: r.TITLE,
        similarity: r.SIMILARITY,
        certificationLevel: r.CERTIFICATIONLEVEL,
        link: `/catalog/asset/${r.ASSETID}`
      }))
    };
  };
};
