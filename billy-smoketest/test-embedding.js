import { readFileSync } from 'fs';
import { AzureOpenAiEmbeddingClient } from '@sap-ai-sdk/foundation-models';

const serviceKey = JSON.parse(readFileSync('./service-key.local.json', 'utf-8'));
process.env.AICORE_SERVICE_KEY = JSON.stringify(serviceKey);

const client = new AzureOpenAiEmbeddingClient({
  modelName: 'text-embedding-3-large',
  resourceGroup: 'team-ai-contest-3'
});

const response = await client.run({ input: ['Frase di prova per Billy.'] });
const embedding = response.getEmbedding();
console.log('DIMENSIONE EMBEDDING:', embedding.length);
console.log('Primi 5 valori:', embedding.slice(0, 5));
