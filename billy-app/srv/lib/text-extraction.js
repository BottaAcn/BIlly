const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Limite applicativo, non del plugin (i default di @cap-js/attachments non
// si applicano comunque alla nostra chiamata diretta AttachmentsSrv.put(),
// vedi fase5-checklist.md §1.7). Scelta ragionevole per documenti interni.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function isPdf(mimeType, fileName) {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(fileName || '');
}

function isDocx(mimeType, fileName) {
  return mimeType === DOCX_MIME || /\.docx$/i.test(fileName || '');
}

async function extractText(buffer, mimeType, fileName) {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File troppo grande (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`);
    err.code = 400;
    err.status = 400;
    throw err;
  }

  if (isPdf(mimeType, fileName)) {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  if (isDocx(mimeType, fileName)) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Fallback: testo semplice (.txt o tipo sconosciuto) — nessun errore
  // bloccante, si tenta comunque la decodifica UTF-8.
  return buffer.toString('utf-8');
}

module.exports = { extractText, isPdf, isDocx, MAX_FILE_SIZE_BYTES };
