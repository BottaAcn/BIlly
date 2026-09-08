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
  askBilly: (question) => request('/rest/billy/askBilly', { method: 'POST', body: { question } }),

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

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
