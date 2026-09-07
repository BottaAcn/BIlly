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

module.exports = class BillyService extends cds.ApplicationService {
  async init() {
    this.on('addDocument', this.onAddDocument);
    this.on('askBilly', this.onAskBilly);
    return super.init();
  }

  onAddDocument = async (req) => {
    const { title, content } = req.data;

    // @sap-ai-sdk packages are ESM-only — dynamic import from this CommonJS
    // module (works fine in Node, unlike a raw-path static import).
    const { AzureOpenAiEmbeddingClient } = await import('@sap-ai-sdk/foundation-models');

    const embedClient = new AzureOpenAiEmbeddingClient({
      modelName: EMBEDDING_MODEL,
      resourceGroup: RESOURCE_GROUP
    });
    const response = await embedClient.run({ input: [content] });
    const embedding = response.getEmbedding();

    const ID = crypto.randomUUID();
    // Insert into the DB-level entity (billy.Document), not the service
    // projection: the projection excludes `embedding` on purpose (never
    // serialize the raw vector back to clients), so an INSERT through it
    // would reject the embedding field. Same pattern as the SAP reference
    // (mail-insights-service.ts uses INSERT.into('ai.db.Mails'), not the
    // service-level Mails projection).
    await INSERT.into('billy.Document').entries({
      ID,
      title,
      content,
      embedding: `[${embedding.join(',')}]`
    });

    return { ID, title, content };
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

    const rows = await cds.run(
      `SELECT TOP 3 "ID", "TITLE", "CONTENT",
              COSINE_SIMILARITY("EMBEDDING", TO_REAL_VECTOR(?)) AS "SIMILARITY"
       FROM "BILLY_DOCUMENT"
       ORDER BY "SIMILARITY" DESC`,
      [`[${qEmbedding.join(',')}]`]
    );

    const context = rows.length
      ? rows.map((r) => `- ${r.TITLE}: ${r.CONTENT}`).join('\n')
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
