import { readFileSync } from 'fs';
import { OrchestrationClient } from '@sap-ai-sdk/orchestration';

const serviceKey = JSON.parse(readFileSync('./service-key.local.json', 'utf-8'));
process.env.AICORE_SERVICE_KEY = JSON.stringify(serviceKey);

const client = new OrchestrationClient(
  {
    promptTemplating: {
      model: { name: 'anthropic--claude-4.6-sonnet', params: { max_tokens: 300 } }
    }
  },
  { resourceGroup: 'team-ai-contest-3' }
);

const response = await client.stream({
  messages: [{ role: 'user', content: 'In un\'unica risposta, scrivi i numeri da 1 a 20 separati da uno spazio.' }]
});

let chunkCount = 0;
let lastChunk;
for await (const chunk of response.stream) {
  chunkCount++;
  lastChunk = chunk;
  process.stdout.write(`[chunk ${chunkCount}] ${chunk.getDeltaContent() ?? ''}\n`);
}
console.log('TOTALE CHUNK RICEVUTI:', chunkCount);
console.log('FINISH REASON:', lastChunk?.getFinishReason());
