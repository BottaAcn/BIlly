import { readFileSync } from 'fs';
import { OrchestrationClient } from '@sap-ai-sdk/orchestration';

const serviceKey = JSON.parse(readFileSync('./service-key.local.json', 'utf-8'));
process.env.AICORE_SERVICE_KEY = JSON.stringify(serviceKey);

const client = new OrchestrationClient(
  {
    promptTemplating: {
      model: { name: 'anthropic--claude-4.6-sonnet' }
    }
  },
  { resourceGroup: 'team-ai-contest-3' }
);

const res = await client.chatCompletion({
  messages: [{ role: 'user', content: 'Rispondi solo: OK' }]
});
console.log('RISPOSTA:', res.getContent());
