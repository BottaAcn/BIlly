// DOMANDA 5: streaming dei token + eventi intermedi di LangGraph.
// DOMANDA 6: checkpointer (MemorySaver) e checkpointer persistente.
import { RESOURCE_GROUP } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const model = new AzureOpenAiChatClient({ modelName: 'gpt-5.5', resourceGroup: RESOURCE_GROUP });
const getWeather = tool(async ({ city }) => `A ${city} 22 gradi e sole.`,
  { name: 'getWeather', description: 'Meteo attuale di una città.', schema: z.object({ city: z.string() }) });

const agent = createReactAgent({ llm: model, tools: [getWeather] });

// --- 5a) streamEvents: token + eventi intermedi (tool start/end) ---
console.log('--- 5a) streamEvents(v2) ---');
let tokenChunks = 0, firstTokens = '';
const seen = new Set();
for await (const ev of agent.streamEvents(
  { messages: [{ role: 'user', content: 'Che tempo fa a Roma? Poi commenta in due frasi.' }] },
  { version: 'v2' }
)) {
  seen.add(ev.event);
  if (ev.event === 'on_chat_model_stream') {
    const t = ev.data?.chunk?.content;
    if (typeof t === 'string' && t) { tokenChunks++; if (firstTokens.length < 60) firstTokens += t; }
  }
  if (ev.event === 'on_tool_start') console.log('  evento intermedio on_tool_start :', ev.name, JSON.stringify(ev.data?.input));
  if (ev.event === 'on_tool_end') console.log('  evento intermedio on_tool_end   :', ev.name, JSON.stringify(ev.data?.output?.content ?? ev.data?.output));
}
console.log('  chunk di token ricevuti:', tokenChunks, '| primi token:', JSON.stringify(firstTokens));
console.log('  tipi di evento visti:', [...seen].sort().join(', '));

// --- 5b) streamMode: updates + messages ---
console.log('\n--- 5b) stream(streamMode:["updates","messages"]) ---');
let updates = 0, msgTokens = 0;
for await (const [mode, payload] of await agent.stream(
  { messages: [{ role: 'user', content: 'Che tempo fa a Milano?' }] },
  { streamMode: ['updates', 'messages'] }
)) {
  if (mode === 'updates') { updates++; console.log('  update dal nodo:', Object.keys(payload).join(',')); }
  if (mode === 'messages') msgTokens++;
}
console.log('  updates:', updates, '| chunk messages:', msgTokens);

// --- 6) Checkpointer: MemorySaver + stato fra turni ---
console.log('\n--- 6) MemorySaver ---');
const memory = new MemorySaver();
const agentMem = createReactAgent({ llm: model, tools: [getWeather], checkpointSaver: memory });
const cfg = { configurable: { thread_id: 'billy-thread-1' } };
await agentMem.invoke({ messages: [{ role: 'user', content: 'Mi chiamo Luca e il mio numero fortunato è 17. Ricordalo.' }] }, cfg);
const t2 = await agentMem.invoke({ messages: [{ role: 'user', content: 'Come mi chiamo e qual è il mio numero?' }] }, cfg);
console.log('  turno 2 (stesso thread):', String(t2.messages.at(-1).content).slice(0, 140).replace(/\n/g, ' '));
const state = await agentMem.getState(cfg);
console.log('  messaggi persistiti nel checkpoint:', state.values.messages.length);
const t3 = await agentMem.invoke({ messages: [{ role: 'user', content: 'Come mi chiamo?' }] }, { configurable: { thread_id: 'altro-thread' } });
console.log('  thread diverso (isolamento):', String(t3.messages.at(-1).content).slice(0, 120).replace(/\n/g, ' '));

// --- 6b) esiste un checkpointer PERSISTENTE installabile? ---
console.log('\n--- 6b) checkpointer persistenti disponibili su npm ---');
for (const pkg of ['@langchain/langgraph-checkpoint-postgres', '@langchain/langgraph-checkpoint-sqlite', '@langchain/langgraph-checkpoint']) {
  try { await import(pkg); console.log('  INSTALLATO e importabile:', pkg); }
  catch { console.log('  non installato qui:', pkg); }
}
