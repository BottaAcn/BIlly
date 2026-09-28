// DOMANDA 6: un checkpointer che sopravvive al RIAVVIO DEL PROCESSO esiste in JS?
// (in Python il progetto Joule-ProCode usa MemorySaver, che non persiste).
// Si lancia due volte: la 2a gira in un processo NUOVO e rilegge da disco.
import { RESOURCE_GROUP } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

const saver = SqliteSaver.fromConnString('./checkpoints.local.sqlite');
const model = new AzureOpenAiChatClient({ modelName: 'gpt-5.5', resourceGroup: RESOURCE_GROUP });
const agent = createReactAgent({ llm: model, tools: [], checkpointSaver: saver });
const cfg = { configurable: { thread_id: 'persist-1' } };

if (process.argv[2] === 'write') {
  await agent.invoke({ messages: [{ role: 'user', content: 'Mi chiamo Luca, numero fortunato 17. Ricordalo.' }] }, cfg);
  const s = await agent.getState(cfg);
  console.log('[processo 1] scritto su sqlite, messaggi nel checkpoint:', s.values.messages.length);
} else {
  const s = await agent.getState(cfg);
  console.log('[processo 2 — NUOVO PROCESSO] messaggi riletti da disco:', s.values.messages?.length ?? 0);
  const r = await agent.invoke({ messages: [{ role: 'user', content: 'Come mi chiamo e qual è il mio numero?' }] }, cfg);
  console.log('[processo 2] risposta:', String(r.messages.at(-1).content).slice(0, 140).replace(/\n/g, ' '));
}
