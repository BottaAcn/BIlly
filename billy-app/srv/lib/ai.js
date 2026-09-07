const { readFileSync } = require('fs');
const path = require('path');

if (!process.env.AICORE_SERVICE_KEY) {
  try {
    const keyPath = path.join(__dirname, '..', '..', 'service-key.local.json');
    process.env.AICORE_SERVICE_KEY = readFileSync(keyPath, 'utf-8');
  } catch (e) {
    // No local key file — expected on Cloud Foundry, where AICORE_SERVICE_KEY
    // is set directly as an application env var (cf set-env), not via file.
  }
}

const RESOURCE_GROUP = 'team-ai-contest-3';
const EMBEDDING_MODEL = 'text-embedding-3-large';
const LLM_MODEL = 'anthropic--claude-4.6-sonnet';

// @sap-ai-sdk è ESM-only — dynamic import da moduli CommonJS (funziona
// correttamente in Node, a differenza di un import statico con path grezzo,
// vedi bug Windows già risolto in v0.0.1).
async function embed(text) {
  const { AzureOpenAiEmbeddingClient } = await import('@sap-ai-sdk/foundation-models');
  const client = new AzureOpenAiEmbeddingClient({
    modelName: EMBEDDING_MODEL,
    resourceGroup: RESOURCE_GROUP
  });
  const response = await client.run({ input: [text] });
  return response.getEmbedding();
}

async function askClaude(systemPrompt, userMessage) {
  const { OrchestrationClient } = await import('@sap-ai-sdk/orchestration');
  const llm = new OrchestrationClient(
    { promptTemplating: { model: { name: LLM_MODEL } } },
    { resourceGroup: RESOURCE_GROUP }
  );
  const res = await llm.chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  });
  return res.getContent();
}

module.exports = { embed, askClaude, RESOURCE_GROUP, EMBEDDING_MODEL, LLM_MODEL };
