// DOMANDA 2+3 su gpt-5.5 via AzureOpenAiChatClient:
// bindTools con set DIVERSI a runtime sullo stesso modello + tool_choice.
import { RESOURCE_GROUP, retryOnce } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const getWeather = tool(async ({ city }) => `A ${city} ci sono 22 gradi e sole.`, {
  name: 'getWeather',
  description: 'Restituisce il meteo attuale di una città.',
  schema: z.object({ city: z.string().describe('nome della città') })
});
const getTime = tool(async ({ city }) => `A ${city} sono le 14:30.`, {
  name: 'getTime',
  description: "Restituisce l'ora attuale di una città.",
  schema: z.object({ city: z.string().describe('nome della città') })
});

const model = new AzureOpenAiChatClient({ modelName: 'gpt-5.5', resourceGroup: RESOURCE_GROUP });

const names = r => (r.tool_calls ?? []).map(t => t.name);

// --- A: stesso modello, primo set ---
const withWeather = model.bindTools([getWeather]);
const a = await retryOnce(() => withWeather.invoke('Che tempo fa a Roma?'), 'A');
console.log('A) bindTools([getWeather]) -> tool_calls:', JSON.stringify(names(a)));

// --- B: stesso modello, secondo set DIVERSO ---
const withTime = model.bindTools([getTime]);
const b = await retryOnce(() => withTime.invoke('Che ore sono a Roma?'), 'B');
console.log('B) bindTools([getTime])    -> tool_calls:', JSON.stringify(names(b)));

// --- C: controprova di isolamento: chiedo il METEO ma ho solo getTime bound ---
const c = await retryOnce(() => withTime.invoke('Che tempo fa a Roma? Usa un tool se puoi.'), 'C');
console.log('C) solo getTime bound, domanda meteo -> tool_calls:', JSON.stringify(names(c)),
            '| getWeather trapelato?', names(c).includes('getWeather'));

// --- D: entrambi i tool ---
const both = model.bindTools([getWeather, getTime]);
const d = await retryOnce(() => both.invoke('Che tempo fa e che ore sono a Roma?'), 'D');
console.log('D) bindTools([entrambi])   -> tool_calls:', JSON.stringify(names(d)));

// --- E: tool_choice "auto" ---
try {
  const e = await retryOnce(() => model.bindTools([getWeather, getTime], { tool_choice: 'auto' })
    .invoke('Che tempo fa a Roma?'), 'E');
  console.log('E) tool_choice:"auto"      -> tool_calls:', JSON.stringify(names(e)));
} catch (err) { console.log('E) tool_choice:"auto" ERRORE:', err?.cause?.response?.data?.error?.message ?? err.message); }

// --- F: tool_choice forzato per nome, su una domanda che NON lo richiederebbe ---
try {
  const f = await retryOnce(() => model.bindTools([getWeather, getTime], { tool_choice: 'getTime' })
    .invoke('Ciao, come stai?'), 'F');
  console.log('F) tool_choice:"getTime" su domanda non pertinente -> tool_calls:', JSON.stringify(names(f)),
              '| forzatura rispettata?', names(f).length === 1 && names(f)[0] === 'getTime');
} catch (err) { console.log('F) tool_choice forzato ERRORE:', err?.cause?.response?.data?.error?.message ?? err.message); }

// --- G: tool_choice "required"/"any" ---
for (const tc of ['required', 'any', 'none']) {
  try {
    const g = await retryOnce(() => model.bindTools([getWeather, getTime], { tool_choice: tc })
      .invoke('Ciao, come stai?'), 'G-' + tc);
    console.log(`G) tool_choice:"${tc}" -> tool_calls:`, JSON.stringify(names(g)));
  } catch (err) { console.log(`G) tool_choice:"${tc}" ERRORE:`, err?.cause?.response?.data?.error?.message ?? err.message); }
}
