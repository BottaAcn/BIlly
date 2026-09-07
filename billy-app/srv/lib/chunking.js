// Chunking a caratteri, deliberatamente semplice: da rivedere quando si
// avranno documenti reali della practice da usare per misurare la qualità
// del retrieval (architecture.md §4, D8 — non assumere, misurare).
const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 100;

function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

module.exports = { chunkText, CHUNK_SIZE, CHUNK_OVERLAP };
