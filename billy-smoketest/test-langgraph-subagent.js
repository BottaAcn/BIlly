// DOMANDA 4: agente LangGraph minimo + SOTTO-AGENTE con un set di strumenti
// DIVERSO da quello del padre (il caso d'uso che motiva tutto il cambio).
import { RESOURCE_GROUP, retryOnce } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const model = new AzureOpenAiChatClient({ modelName: 'gpt-5.5', resourceGroup: RESOURCE_GROUP });
const calls = [];

const getWeather = tool(async ({ city }) => { calls.push('getWeather'); return `A ${city} 22 gradi e sole.`; },
  { name: 'getWeather', description: 'Meteo attuale di una città.', schema: z.object({ city: z.string() }) });
const getTime = tool(async ({ city }) => { calls.push('getTime'); return `A ${city} sono le 14:30.`; },
  { name: 'getTime', description: "Ora attuale di una città.", schema: z.object({ city: z.string() }) });

// --- 1) Agente padre con DUE tool, domanda che li richiede entrambi ---
const parent = createReactAgent({ llm: model, tools: [getWeather, getTime] });
const r1 = await retryOnce(() => parent.invoke({ messages: [{ role: 'user', content: 'Che tempo fa e che ore sono a Roma? Usa gli strumenti.' }] }), 'parent');
console.log('1) AGENTE MINIMO — tool eseguiti davvero:', JSON.stringify(calls));
console.log('   n. messaggi nel grafo:', r1.messages.length, '| il ciclo si è chiuso:', typeof r1.messages.at(-1).content === 'string');
console.log('   risposta:', String(r1.messages.at(-1).content).slice(0, 160).replace(/\n/g, ' '));

// --- 2) SOTTO-AGENTE: un tool che dentro invoca un secondo agente con
//        strumenti DIVERSI (solo getTime) e un suo prompt. ---
calls.length = 0;
const subCalls = [];
const subGetTime = tool(async ({ city }) => { subCalls.push('getTime'); return `A ${city} sono le 14:30.`; },
  { name: 'getTime', description: "Ora attuale di una città.", schema: z.object({ city: z.string() }) });

const timeSubAgent = createReactAgent({
  llm: model,
  tools: [subGetTime],
  stateModifier: 'Sei un sotto-agente specializzato SOLO sugli orari. Rispondi in una riga.'
});

const delegateToTimeAgent = tool(
  async ({ request }) => {
    subCalls.push('SUBAGENT_INVOKED');
    const out = await timeSubAgent.invoke({ messages: [{ role: 'user', content: request }] });
    return String(out.messages.at(-1).content);
  },
  {
    name: 'delegateToTimeAgent',
    description: "Delega a un sotto-agente specializzato ogni domanda sugli orari.",
    schema: z.object({ request: z.string().describe('la richiesta da inoltrare al sotto-agente') })
  }
);

// Il padre NON ha getTime: per l'ora deve passare dal sotto-agente.
const supervisor = createReactAgent({ llm: model, tools: [getWeather, delegateToTimeAgent] });
const r2 = await retryOnce(() => supervisor.invoke({ messages: [{ role: 'user', content: 'Che tempo fa e che ore sono a Roma?' }] }), 'supervisor');

console.log('\n2) SOTTO-AGENTE');
console.log('   tool del padre eseguiti:', JSON.stringify(calls));
console.log('   attivita del sotto-agente:', JSON.stringify(subCalls));
console.log('   sotto-agente invocato davvero:', subCalls.includes('SUBAGENT_INVOKED'));
console.log('   il sotto-agente ha usato il SUO tool:', subCalls.filter((c) => c === 'getTime').length > 0);
console.log('   risposta finale:', String(r2.messages.at(-1).content).slice(0, 200).replace(/\n/g, ' '));
