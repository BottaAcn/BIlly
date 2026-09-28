// DOMANDA 3 (seguito): forzare un tool PER NOME usando la forma oggetto OpenAI
// {type:'function', function:{name}} — la stessa che l'SDK usa internamente.
import { RESOURCE_GROUP, retryOnce } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const getWeather = tool(async ({ city }) => `A ${city} 22 gradi.`, {
  name: 'getWeather', description: 'Meteo di una città.',
  schema: z.object({ city: z.string() })
});
const getTime = tool(async ({ city }) => `A ${city} sono le 14:30.`, {
  name: 'getTime', description: "Ora di una città.",
  schema: z.object({ city: z.string() })
});

const model = new AzureOpenAiChatClient({ modelName: 'gpt-5.5', resourceGroup: RESOURCE_GROUP });
const names = r => (r.tool_calls ?? []).map(t => t.name);

const forced = model.bindTools([getWeather, getTime], {
  tool_choice: { type: 'function', function: { name: 'getTime' } }
});
// Domanda di METEO, ma forzo getTime: se la forzatura funziona deve uscire getTime.
const r = await retryOnce(() => forced.invoke('Che tempo fa a Roma?'), 'forced');
console.log('tool_choice={function:getTime} su domanda METEO -> tool_calls:', JSON.stringify(names(r)));
console.log('FORZATURA PER NOME RISPETTATA?', names(r).length === 1 && names(r)[0] === 'getTime');
