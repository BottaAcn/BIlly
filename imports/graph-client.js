'use strict';

require('dotenv').config();
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);

function getGraphClient() {
  const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Mancano TENANT_ID, CLIENT_ID o CLIENT_SECRET nel .env');
  }
  const credential = new ClientSecretCredential(TENANT_ID, CLIENT_ID, CLIENT_SECRET);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  return Client.initWithMiddleware({ authProvider });
}

/**
 * Risolve il Site ID di SharePoint dall'URL del sito.
 * Formato URL accettato: https://<tenant>.sharepoint.com/sites/<nome>
 * Restituisce l'ID nel formato usato dalle Graph API.
 */
async function getSiteId(client, siteUrl) {
  const url = new URL(siteUrl);
  const host = url.hostname;                         // accenture.sharepoint.com
  const path = url.pathname.replace(/\/$/, '');      // /sites/BillyCatalog
  const site = await client.api(`/sites/${host}:${path}`).get();
  return site.id;
}

/**
 * Retry con exponential backoff per gestire errori 429 (rate limit) e 503.
 */
async function withRetry(fn, maxAttempts = 5) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err.statusCode || err.code;
      const retryable = status === 429 || status === 503 || status === 'ECONNRESET';
      attempt++;
      if (!retryable || attempt >= maxAttempts) throw err;
      const retryAfter = parseInt(err.responseHeaders?.['retry-after'] || '0', 10);
      const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
      console.warn(`  ⏳ Rate limit / transient error (${status}), retry ${attempt}/${maxAttempts} tra ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

module.exports = { getGraphClient, getSiteId, withRetry };
