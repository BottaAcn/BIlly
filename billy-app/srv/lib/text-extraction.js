const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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

function isPptx(mimeType, fileName) {
  return mimeType === PPTX_MIME || /\.pptx$/i.test(fileName || '');
}

function isTxt(mimeType, fileName) {
  return mimeType === 'text/plain' || /\.txt$/i.test(fileName || '');
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

  if (isPptx(mimeType, fileName)) {
    const officeParser = require('officeparser');
    const ast = await officeParser.parseOffice(buffer, { fileType: 'pptx' });
    const { value } = await ast.to('text');
    return value;
  }

  if (isTxt(mimeType, fileName)) {
    return buffer.toString('utf-8');
  }

  // Nessun fallback silenzioso: un formato non riconosciuto (es. immagini)
  // non va decodificato "a caso" come UTF-8 — produrrebbe testo spazzatura
  // indicizzato come se fosse contenuto vero (bug scoperto in analisi,
  // non solo teorico: PPT/immagini finivano qui prima di questo fix).
  const err = new Error(`Formato file non supportato (${fileName || mimeType || 'sconosciuto'}). Formati accettati: PDF, DOCX, PPTX, TXT.`);
  err.code = 400;
  err.status = 400;
  throw err;
}

module.exports = { extractText, isPdf, isDocx, isPptx, isTxt, MAX_FILE_SIZE_BYTES };
