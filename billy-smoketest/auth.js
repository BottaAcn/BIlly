// Shared auth helper: replica il meccanismo di billy-app/srv/lib/ai.js
// (AICORE_SERVICE_KEY letto da service-key.local.json se non già in env).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.AICORE_SERVICE_KEY) {
  process.env.AICORE_SERVICE_KEY = readFileSync(
    path.join(__dirname, 'service-key.local.json'), 'utf-8'
  );
}

export const RESOURCE_GROUP = 'team-ai-contest-3';
export const CLAUDE = 'anthropic--claude-4.6-sonnet';

/** Ritenta una volta: la DNS verso SAP da questa macchina è intermittente (EAI_AGAIN). */
export async function retryOnce(fn, label = 'call') {
  try {
    return await fn();
  } catch (e) {
    const msg = String(e?.cause?.code || e?.code || e?.message || '');
    console.error(`[${label}] primo tentativo fallito (${msg}) — ritento una volta...`);
    return await fn();
  }
}
