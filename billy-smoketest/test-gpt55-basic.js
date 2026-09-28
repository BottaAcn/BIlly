// PREREQUISITO: gpt-5.5 risponde via AzureOpenAiChatClient (NO Orchestration)?
import { RESOURCE_GROUP, retryOnce } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';

const model = new AzureOpenAiChatClient({
  modelName: 'gpt-5.5',
  resourceGroup: RESOURCE_GROUP
});

try {
  const res = await retryOnce(() => model.invoke('Rispondi solo: OK'), 'gpt-5.5 invoke');
  console.log('CONTENT:', JSON.stringify(res.content));
  console.log('MODEL:', res.response_metadata?.model_name ?? res.response_metadata?.model);
  console.log('USAGE:', JSON.stringify(res.usage_metadata));
  console.log('RISULTATO: gpt-5.5 RAGGIUNGIBILE via AzureOpenAiChatClient');
} catch (e) {
  console.error('ERRORE STATUS:', e?.cause?.status ?? e?.status);
  console.error('ERRORE MESSAGGIO TESTUALE:', JSON.stringify(e?.cause?.response?.data ?? e?.message, null, 2));
}
