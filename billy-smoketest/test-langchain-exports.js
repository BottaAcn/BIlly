// DOMANDA 1: quali client espone @sap-ai-sdk/langchain? Claude è raggiungibile
// solo via Orchestration, o esiste un client Bedrock/Anthropic diretto?
import './auth.js';

const lc = await import('@sap-ai-sdk/langchain');
const fm = await import('@sap-ai-sdk/foundation-models');

console.log('@sap-ai-sdk/langchain exports:');
for (const k of Object.keys(lc).sort()) console.log('  -', k, typeof lc[k]);

console.log('\n@sap-ai-sdk/foundation-models exports (solo classi client):');
for (const k of Object.keys(fm).sort()) if (/Client$/.test(k)) console.log('  -', k);

const anthropicish = Object.keys(lc).concat(Object.keys(fm))
  .filter(k => /bedrock|anthropic|claude/i.test(k));
console.log('\nClient Bedrock/Anthropic/Claude trovati:', anthropicish.length ? anthropicish : 'NESSUNO');
