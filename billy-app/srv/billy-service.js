const cds = require('@sap/cds');
const { embed, askClaude } = require('./lib/ai');

// Peso applicato alla similarity grezza in base allo stato di certificazione
// (architecture.md §4 / D10). 'deprecated' non compare qui: è escluso a
// monte dalla query, non solo penalizzato. Valori aggiornati in Fase 2
// (salto netto tra certifiedOutdated e community, richiesta esplicita).
const CERTIFICATION_WEIGHT_SQL = `
  CASE c."CERTIFICATIONLEVEL"
    WHEN 'certified' THEN 1.0
    WHEN 'certifiedOutdated' THEN 0.75
    WHEN 'community' THEN 0.35
    ELSE 0.35
  END`;

module.exports = class BillyService extends cds.ApplicationService {
  async init() {
    this.on('askBilly', this.onAskBilly);
    return super.init();
  }

  onAskBilly = async (req) => {
    const { question } = req.data;
    const qEmbedding = await embed(question);

    // "TEXT" va quotata: è parola riservata in SQL HANA. Esclude i chunk
    // di asset 'deprecated' (WHERE, non solo penalizzati) e pesa la
    // similarity per certificationLevel (architecture.md §4, D10). I chunk
    // esistono solo per asset pubblicati (Fase 2 — invariante applicativa,
    // vedi CatalogService.onUploadAsset/onReviewRevision), nessun filtro
    // aggiuntivo su published necessario qui.
    const rows = await cds.run(
      `SELECT TOP 3 a."ID" as "ASSETID", a."TITLE" as "TITLE", c."TEXT" as "TEXT",
              c."CERTIFICATIONLEVEL" as "CERTIFICATIONLEVEL",
              COSINE_SIMILARITY(c."EMBEDDING", TO_REAL_VECTOR(?)) * ${CERTIFICATION_WEIGHT_SQL} AS "SIMILARITY"
       FROM "BILLY_CHUNK" as c
       JOIN "BILLY_ASSET" as a ON a."ID" = c."ASSET_ID"
       WHERE c."CERTIFICATIONLEVEL" != 'deprecated'
       ORDER BY "SIMILARITY" DESC`,
      [`[${qEmbedding.join(',')}]`]
    );

    const context = rows.length
      ? rows.map((r) => `- [${r.CERTIFICATIONLEVEL}] ${r.TITLE}: ${r.TEXT}`).join('\n')
      : '(nessun documento in archivio)';

    const answer = await askClaude(
      `Rispondi usando solo questo contesto. Ogni fonte è preceduta dal suo stato di certificazione tra parentesi quadre. Se una fonte usata per la risposta non è "certified", avvisa esplicitamente l'utente che l'informazione non è (ancora) certificata.\n${context}`,
      question
    );

    return {
      answer,
      // Link placeholder: non è una route reale finché il frontend/catalogo
      // (Fase 4) non esiste. È il contratto che il frontend implementerà.
      sources: rows.map((r) => ({
        assetId: r.ASSETID,
        title: r.TITLE,
        similarity: r.SIMILARITY,
        certificationLevel: r.CERTIFICATIONLEVEL,
        link: `/catalog/asset/${r.ASSETID}`
      }))
    };
  };
};
