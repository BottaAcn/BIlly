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
// Modello del motore LangGraph (srv/lib/graph.js). Deployment gpt-5.5 nel
// resource group team-ai-contest-3, consumato via AzureOpenAiChatClient e non
// via Orchestration: l'Orchestration Service fissa `tools` alla costruzione
// del client e non supporta `tool_choice`, che qui è invece per-richiesta.
const CHAT_MODEL = 'gpt-5.5';
// gpt-5.5 è un reasoning model: @sap-ai-sdk/langchain lo riconosce dal nome
// (isReasoningModel) e traduce max_tokens in max_completion_tokens. Il budget
// è generoso perché quel tetto comprende anche i token di ragionamento, che
// non si vedono in risposta. temperature/top_p restano non impostati: la
// famiglia gpt-5 accetta solo il default e un valore esplicito dà 400.
const CHAT_MAX_TOKENS = 16384;

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

/**
 * Client chat LangChain sul deployment gpt-5.5. Costruito a ogni chiamata:
 * è un oggetto leggero e il flag di streaming dipende dall'invocazione.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.streaming] se true `invoke()` passa da
 *   _streamResponseChunks, ed è quello che alimenta gli eventi `delta`.
 * @returns {Promise<import('@sap-ai-sdk/langchain').AzureOpenAiChatClient>}
 */
async function createChatModel({ streaming = false } = {}) {
  // ESM-only come il resto di @sap-ai-sdk: import dinamico obbligato.
  const { AzureOpenAiChatClient } = await import('@sap-ai-sdk/langchain');
  return new AzureOpenAiChatClient({
    modelName: CHAT_MODEL,
    resourceGroup: RESOURCE_GROUP,
    max_tokens: CHAT_MAX_TOKENS,
    streaming
  });
}

module.exports = {
  embed,
  askClaude,
  createChatModel,
  RESOURCE_GROUP,
  EMBEDDING_MODEL,
  LLM_MODEL,
  CHAT_MODEL,
  CHAT_MAX_TOKENS
};
