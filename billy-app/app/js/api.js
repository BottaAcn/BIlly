// Unico punto di chiamata verso il backend. Rispecchia esattamente
// doc/V1/external-brief/API-CONTRACT.md — nessun componente in components/
// importa questo modulo direttamente, solo le viste in views/.

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* risposta non-JSON (es. download binario) */ }
  if (!res.ok) {
    const msg = data?.error?.message || `Errore ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  // `history` sono i turni precedenti [{role:'user'|'assistant', content}]:
  // senza, Billy risponde come se ogni domanda fosse la prima.
  askBilly: (question, history = []) =>
    request('/rest/billy/askBilly', { method: 'POST', body: { question, history } }),

  listAssets: () => request('/rest/catalog/Asset'),
  getAsset: (assetId) => request(`/rest/catalog/Asset/${assetId}`),
  getAttachments: (assetId) => request(`/rest/catalog/Asset/${assetId}/attachments`).catch(() => []),
  searchAssets: (query) => request(`/rest/catalog/searchAssets?query=${encodeURIComponent(query)}`),
  deepSearch: (query) => request(`/rest/catalog/deepSearch?query=${encodeURIComponent(query)}`),

  uploadAsset: (body) => request('/rest/catalog/uploadAsset', { method: 'POST', body }),
  editAsset: (body) => request('/rest/catalog/editAsset', { method: 'POST', body }),

  listReviewQueue: () => request('/rest/catalog/listReviewQueue'),
  getRevisionDetail: (revisionId) => request(`/rest/catalog/getRevisionDetail?revisionId=${revisionId}`),
  reviewRevision: (body) => request('/rest/catalog/reviewRevision', { method: 'POST', body }),
  setCertificationLevel: (body) => request('/rest/catalog/setCertificationLevel', { method: 'POST', body }),
  deleteAsset: (assetId) => request('/rest/catalog/deleteAsset', { method: 'POST', body: { assetId } }),

  downloadAttachmentUrl: (assetId, attachmentId) =>
    `/rest/catalog/downloadAttachment?assetId=${assetId}&attachmentId=${attachmentId}`
};

// Variante in streaming di askBilly (SSE su POST — EventSource supporta
// solo GET, quindi si legge il body di fetch a pezzi). `onEvent` riceve gli
// eventi documentati in API-CONTRACT.md §1.2: 'tool', 'result', 'delta',
// 'answer', 'error'. Ritorna l'evento 'answer' finale, così il chiamante
// può trattarla come una normale promise se gli basta il risultato.
export async function askBillyStream(question, history, onEvent, signal) {
  const res = await fetch('/rest/billy/askBillyStream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history: history || [] }),
    signal
  });
  if (!res.ok || !res.body) {
    let msg = `Errore ${res.status}`;
    try { msg = (await res.json())?.error?.message || msg; } catch (e) { /* risposta non-JSON */ }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Un messaggio SSE finisce con una riga vuota; un chunk di rete può
    // spezzarlo a metà, quindi si processa solo ciò che è completo.
    const messages = buffer.split('\n\n');
    buffer = messages.pop();
    for (const raw of messages) {
      const data = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      let event;
      try { event = JSON.parse(data); } catch (e) { continue; }
      if (event.type === 'answer') final = event;
      if (event.type === 'error') throw new Error(event.message || 'Errore interno');
      onEvent?.(event);
    }
  }

  if (!final) throw new Error('Risposta interrotta prima del completamento');
  return final;
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
