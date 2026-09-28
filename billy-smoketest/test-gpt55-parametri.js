// Vincoli di API di gpt-5.5: quali parametri accetta/rifiuta.
import { RESOURCE_GROUP } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
for (const [label, opts] of [
  ['temperature: 0.2', { temperature: 0.2 }],
  ['temperature: 1', { temperature: 1 }],
  ['top_p: 0.9', { top_p: 0.9 }],
  ['max_tokens: 200', { max_tokens: 200 }],
  ['reasoning_effort: low', { reasoning_effort: 'low' }]
]) {
  try {
    const m = new AzureOpenAiChatClient({ modelName: 'gpt-5.5', resourceGroup: RESOURCE_GROUP, ...opts });
    const r = await m.invoke('Rispondi solo: OK');
    console.log(`OK   ${label} ->`, JSON.stringify(String(r.content).slice(0, 20)));
  } catch (e) {
    const msg = e?.cause?.response?.data?.error?.message ?? e.message;
    console.log(`400  ${label} -> ${msg}`);
  }
}
