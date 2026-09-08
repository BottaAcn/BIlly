const cds = require('@sap/cds');
const { pipeline } = require('node:stream/promises');
const { embed } = require('./lib/ai');
const { chunkText } = require('./lib/chunking');
const { getOrCreateDefaultPlayer } = require('./lib/default-player');
const { extractText } = require('./lib/text-extraction');

function addMonthsISO(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + (months || 12));
  return d.toISOString();
}

// Fase 5: risolve il contenuto testuale di una revisione da uno dei due
// input supportati (testo incollato o file). Uno dei due è obbligatorio.
async function resolveContent({ content, fileContent, fileName, fileMimeType }) {
  if (fileContent) {
    const buffer = Buffer.from(fileContent, 'base64');
    const text = await extractText(buffer, fileMimeType, fileName);
    return { text, fileBuffer: buffer };
  }
  if (content) {
    return { text: content, fileBuffer: null };
  }
  const err = new Error('Fornire almeno uno tra "content" (testo incollato) e "fileContent" (file, base64)');
  err.code = 400;
  err.status = 400;
  throw err;
}

// Fase 5: allega il file originale all'Asset (storage "db" su HANA, scan
// disattivato — architecture.md §6). Non blocca la pipeline di ingestion:
// il testo estratto è già stato usato altrove, questo serve solo per poter
// riscaricare il file originale in futuro.
async function attachFile(assetsAttachmentsEntity, assetId, buffer, fileName, mimeType) {
  const AttachmentsSrv = await cds.connect.to('attachments');
  await AttachmentsSrv.put(assetsAttachmentsEntity, {
    ID: crypto.randomUUID(),
    up__ID: assetId,
    content: buffer,
    filename: fileName || 'file',
    mimeType: mimeType || 'application/octet-stream'
  });
}

async function regenerateChunks(assetId, content, certificationLevel) {
  await DELETE.from('billy.Chunk').where({ asset_ID: assetId });
  const segments = chunkText(content || '');
  for (let i = 0; i < segments.length; i++) {
    const embedding = await embed(segments[i]);
    await INSERT.into('billy.Chunk').entries({
      ID: crypto.randomUUID(),
      asset_ID: assetId,
      text: segments[i],
      embedding: `[${embedding.join(',')}]`,
      certificationLevel,
      chunkIndex: i
    });
  }
}

async function syncChunkCertification(assetId, level) {
  await UPDATE('billy.Chunk').set({ certificationLevel: level }).where({ asset_ID: assetId });
}

module.exports = class CatalogService extends cds.ApplicationService {
  async init() {
    // Migrazione dati una tantum: gli asset creati in Fase 0/1 esistevano
    // prima che la colonna `published` fosse aggiunta allo schema — restano
    // con `published = NULL`, non `TRUE`, quindi invisibili a questo
    // servizio (Asset è filtrato `where published = true`) pur essendo
    // ancora citati da BillyService (che non controlla `published`).
    // Bug reale osservato in test: `searchAssets` non trovava un asset di
    // Fase 1 esistente. Idempotente: dopo il primo run, `WHERE ... IS NULL`
    // non trova più righe da aggiornare.
    await cds.run(`
      UPDATE "BILLY_ASSET" SET "PUBLISHED" = TRUE
      WHERE "PUBLISHED" = FALSE
        AND "ID" IN (SELECT DISTINCT "ASSET_ID" FROM "BILLY_CHUNK")
    `).catch((e) => console.error('Migrazione published fallita:', e.message));

    this.on('uploadAsset', this.onUploadAsset);
    this.on('editAsset', this.onEditAsset);
    this.on('listReviewQueue', this.onListReviewQueue);
    this.on('getRevisionDetail', this.onGetRevisionDetail);
    this.on('reviewRevision', this.onReviewRevision);
    this.on('setCertificationLevel', this.onSetCertificationLevel);
    this.on('deleteAsset', this.onDeleteAsset);
    this.on('downloadAttachment', this.onDownloadAttachment);
    this.on('searchAssets', this.onSearchAssets);
    this.on('deepSearch', this.onDeepSearch);
    this.on('expireCertifications', this.onExpireCertifications);

    // Automazione provvisoria: un vero job scheduler BTP (Job Scheduling
    // service) è infrastruttura di produzione fuori scope in questa fase.
    // Controlla la scadenza ogni 6 ore mentre il processo resta attivo.
    setInterval(() => {
      this.onExpireCertifications().catch((e) => console.error('expireCertifications fallita:', e.message));
    }, 6 * 60 * 60 * 1000);

    return super.init();
  }

  onUploadAsset = async (req) => {
    const { title, description, type, content, externalLink, fileContent, fileName, fileMimeType } = req.data;
    const { text, fileBuffer } = await resolveContent({ content, fileContent, fileName, fileMimeType });

    const player = await getOrCreateDefaultPlayer();
    const assetID = crypto.randomUUID();

    // Nessun chunking/embedding qui: avviene solo all'approvazione
    // (onReviewRevision), non alla creazione (architecture.md §3.1).
    await INSERT.into('billy.Asset').entries({
      ID: assetID,
      title,
      description,
      type: type || 'document',
      certificationLevel: 'community',
      published: false,
      uploadedBy_ID: player.ID,
      externalLink
    });

    await INSERT.into('billy.AssetRevision').entries({
      ID: crypto.randomUUID(),
      asset_ID: assetID,
      title,
      description,
      content: text,
      type: type || 'document',
      externalLink,
      status: 'pending',
      submittedBy_ID: player.ID
    });

    if (fileBuffer) {
      await attachFile(this.entities['Asset.attachments'], assetID, fileBuffer, fileName, fileMimeType);
    }

    return { ID: assetID, title, description, type: type || 'document', certificationLevel: 'community', published: false };
  };

  onEditAsset = async (req) => {
    const { assetId, title, description, content, type, externalLink, fileContent, fileName, fileMimeType } = req.data;
    const asset = await SELECT.one.from('billy.Asset').where({ ID: assetId });
    if (!asset) return req.error(404, `Asset ${assetId} non trovato`);

    const { text, fileBuffer } = await resolveContent({ content, fileContent, fileName, fileMimeType });

    const player = await getOrCreateDefaultPlayer();
    const revisionID = crypto.randomUUID();
    // Il contenuto live/pubblicato non cambia finché la revisione non è
    // approvata (architecture.md §3.1). Un eventuale nuovo file viene
    // comunque allegato subito all'Asset (limite noto, vedi db/schema.cds).
    await INSERT.into('billy.AssetRevision').entries({
      ID: revisionID,
      asset_ID: assetId,
      title,
      description,
      content: text,
      type,
      externalLink,
      status: 'pending',
      submittedBy_ID: player.ID
    });

    if (fileBuffer) {
      await attachFile(this.entities['Asset.attachments'], assetId, fileBuffer, fileName, fileMimeType);
    }

    return { revisionId: revisionID };
  };

  onListReviewQueue = async () => {
    const pending = await cds.run(`
      SELECT r."ID" as "REVISIONID", r."ASSET_ID" as "ASSETID", a."TITLE" as "TITLE",
             COALESCE(r."TYPE", a."TYPE") as "TYPE",
             p."DISPLAYNAME" as "SUBMITTEDBY", r."CREATEDAT" as "SUBMITTEDAT"
      FROM "BILLY_ASSETREVISION" r
      JOIN "BILLY_ASSET" a ON a."ID" = r."ASSET_ID"
      LEFT JOIN "BILLY_PLAYER" p ON p."ID" = r."SUBMITTEDBY_ID"
      WHERE r."STATUS" = 'pending'
    `);

    // Rinnovo: nessuna nuova revisione da creare, si riusa l'ultima
    // approvata (architecture.md §3.1) — cercata qui per dare al chiamante
    // il revisionId giusto da passare a reviewRevision. Window function
    // invece di subquery correlata con ORDER BY/LIMIT: HANA la rifiuta
    // esplicitamente ("correlated subquery cannot have TOP or ORDER BY").
    const outdated = await cds.run(`
      SELECT a."ID" as "ASSETID", a."TITLE" as "TITLE", a."TYPE" as "TYPE", lr."ID" as "REVISIONID"
      FROM "BILLY_ASSET" a
      LEFT JOIN (
        SELECT "ID", "ASSET_ID",
               ROW_NUMBER() OVER (PARTITION BY "ASSET_ID" ORDER BY "REVIEWEDAT" DESC) as "RN"
        FROM "BILLY_ASSETREVISION"
        WHERE "STATUS" = 'approved'
      ) lr ON lr."ASSET_ID" = a."ID" AND lr."RN" = 1
      WHERE a."CERTIFICATIONLEVEL" = 'certifiedOutdated'
    `);

    return [
      ...pending.map((r) => ({
        kind: 'revision', revisionId: r.REVISIONID, assetId: r.ASSETID,
        title: r.TITLE, type: r.TYPE, submittedBy: r.SUBMITTEDBY, submittedAt: r.SUBMITTEDAT
      })),
      ...outdated.map((a) => ({
        kind: 'renewal', revisionId: a.REVISIONID, assetId: a.ASSETID,
        title: a.TITLE, type: a.TYPE, submittedBy: null, submittedAt: null
      }))
    ];
  };

  // Sola lettura, nessuna scrittura: usata dalla coda di revisione per
  // mostrare cosa c'è dietro un titolo prima di approvare/rifiutare.
  onGetRevisionDetail = async (req) => {
    const { revisionId } = req.data;
    const revision = await SELECT.one.from('billy.AssetRevision').where({ ID: revisionId });
    if (!revision) return req.error(404, `Revisione ${revisionId} non trovata`);

    const submitter = revision.submittedBy_ID
      ? await SELECT.one.from('billy.Player').where({ ID: revision.submittedBy_ID }).columns('displayName')
      : null;

    const attachments = await SELECT.from(this.entities['Asset.attachments'])
      .where({ up__ID: revision.asset_ID })
      .columns('ID', 'filename', 'mimeType');

    return {
      revisionId: revision.ID,
      assetId: revision.asset_ID,
      title: revision.title,
      description: revision.description,
      content: revision.content,
      type: revision.type,
      externalLink: revision.externalLink,
      submittedBy: submitter ? submitter.displayName : null,
      submittedAt: revision.createdAt,
      attachments
    };
  };

  onReviewRevision = async (req) => {
    const { revisionId, approve, validityMonths, pointsPct } = req.data;
    const player = await getOrCreateDefaultPlayer();
    if (!player.isCertifier && !player.isAdmin) {
      return req.error(403, 'Solo Certifier o Admin possono revisionare');
    }

    const revision = await SELECT.one.from('billy.AssetRevision').where({ ID: revisionId });
    if (!revision) return req.error(404, `Revisione ${revisionId} non trovata`);

    const pct = pointsPct != null ? pointsPct : 100;

    if (revision.status === 'pending') {
      if (approve) {
        await UPDATE('billy.Asset', revision.asset_ID).with({
          title: revision.title,
          description: revision.description,
          type: revision.type,
          externalLink: revision.externalLink,
          published: true,
          certificationLevel: 'certified',
          certifiedBy_ID: player.ID,
          certifiedAt: new Date().toISOString(),
          certificationExpiresAt: addMonthsISO(validityMonths)
        });
        await regenerateChunks(revision.asset_ID, revision.content, 'certified');
        await UPDATE('billy.AssetRevision', revisionId).with({
          status: 'approved',
          reviewedBy_ID: player.ID,
          reviewedAt: new Date().toISOString(),
          pointsPct: pct,
          validityMonths: validityMonths || 12
        });
        // TODO(Fase 3): creare PointEvent per uploader (pct% dei punti
        // pieni) e per il certificatore (punti pieni) — richiede Season,
        // non ancora implementata (D12, architecture.md §7).
      } else {
        await UPDATE('billy.AssetRevision', revisionId).with({
          status: 'rejected',
          reviewedBy_ID: player.ID,
          reviewedAt: new Date().toISOString()
        });
        // Asset invariato: se era la prima revisione, resta unpublished.
      }
    } else if (revision.status === 'approved') {
      // Caso B: rinnovo di un asset certifiedOutdated, stesso contenuto —
      // nessuna rigenerazione chunk (architecture.md §3.1).
      if (!approve) {
        return req.error(400, 'Una revisione già approvata (rinnovo) non può essere "rifiutata" — usa setCertificationLevel per deprecare esplicitamente');
      }
      await UPDATE('billy.Asset', revision.asset_ID).with({
        certificationLevel: 'certified',
        certifiedBy_ID: player.ID,
        certifiedAt: new Date().toISOString(),
        certificationExpiresAt: addMonthsISO(validityMonths)
      });
      await syncChunkCertification(revision.asset_ID, 'certified');
      // TODO(Fase 3): PointEvent pieno per il certificatore (rinnovo).
    } else {
      return req.error(400, `Revisione già in stato ${revision.status}, nulla da fare`);
    }

    return await SELECT.one.from('billy.Asset').where({ ID: revision.asset_ID });
  };

  onSetCertificationLevel = async (req) => {
    const { assetId, certificationLevel, validityMonths } = req.data;
    const player = await getOrCreateDefaultPlayer();
    if (!player.isCertifier && !player.isAdmin) {
      return req.error(403, 'Solo Certifier o Admin possono cambiare lo stato di certificazione');
    }

    // Transizioni libere: qualsiasi stato a qualsiasi altro stato, sempre
    // (nessuna state machine vincolata — decisione esplicita, architecture.md §2).
    const updates = { certificationLevel };
    if (certificationLevel === 'certified') {
      updates.certifiedBy_ID = player.ID;
      updates.certifiedAt = new Date().toISOString();
      updates.certificationExpiresAt = addMonthsISO(validityMonths);
    }
    await UPDATE('billy.Asset', assetId).with(updates);
    await syncChunkCertification(assetId, certificationLevel);

    return await SELECT.one.from('billy.Asset').where({ ID: assetId });
  };

  onDeleteAsset = async (req) => {
    const { assetId } = req.data;
    const player = await getOrCreateDefaultPlayer();
    if (!player.isAdmin) {
      return req.error(403, 'Solo Admin può eliminare un asset in modo definitivo');
    }
    // Fase 5: elimina anche gli allegati, altrimenti resterebbero BLOB
    // orfani su HANA (stesso problema già affrontato per billy.Document
    // in Fase 0, stavolta prevenuto invece di scoperto a posteriori).
    await DELETE.from('billy.Asset.attachments').where({ up__ID: assetId });
    await DELETE.from('billy.Chunk').where({ asset_ID: assetId });
    await DELETE.from('billy.AssetRevision').where({ asset_ID: assetId });
    await DELETE.from('billy.Asset').where({ ID: assetId });
    return true;
  };

  // Bypassa l'endpoint auto-generato da @cap-js/attachments (buggato con
  // protocol: 'rest', vedi catalog-service.cds): legge il BLOB direttamente
  // e scrive la risposta HTTP a mano, senza passare dall'evento READ su cui
  // il plugin registra i suoi hook before/after.
  onDownloadAttachment = async (req) => {
    const { assetId, attachmentId } = req.data;
    const attachmentsEntity = this.entities['Asset.attachments'];

    const attachment = await SELECT.one.from(attachmentsEntity)
      .where({ ID: attachmentId, up__ID: assetId })
      .columns('filename', 'mimeType');
    if (!attachment) return req.error(404, `Allegato ${attachmentId} non trovato per l'asset ${assetId}`);

    const AttachmentsSrv = await cds.connect.to('attachments');
    const content = await AttachmentsSrv.get(attachmentsEntity, { ID: attachmentId });
    if (!content) return req.error(404, 'Nessun contenuto disponibile per questo allegato');

    req.res.set('Content-Type', attachment.mimeType || 'application/octet-stream');
    req.res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename || 'file')}"`);

    // Su HANA il driver restituisce le colonne LargeBinary come stream
    // leggibile, non come Buffer (a differenza di sqlite in locale) — va
    // quindi inoltrato con pipe(), non passato a res.send().
    if (typeof content.pipe === 'function') {
      await pipeline(content, req.res);
    } else {
      req.res.send(content);
    }
  };

  onSearchAssets = async (req) => {
    const { query } = req.data;
    // Ricerca full-text istantanea, nessuna chiamata AI. "PUBLISHED" è
    // BOOLEAN nativo HANA (confermato dal DDL) — confronto diretto con TRUE.
    const rows = await cds.run(
      `SELECT "ID", "TITLE", "DESCRIPTION", "TYPE", "CERTIFICATIONLEVEL", "PUBLISHED"
       FROM "BILLY_ASSET"
       WHERE "PUBLISHED" = TRUE AND ("TITLE" LIKE ? OR "DESCRIPTION" LIKE ?)`,
      [`%${query}%`, `%${query}%`]
    );
    return rows.map((r) => ({
      ID: r.ID,
      title: r.TITLE,
      description: r.DESCRIPTION,
      type: r.TYPE,
      certificationLevel: r.CERTIFICATIONLEVEL,
      published: Boolean(r.PUBLISHED)
    }));
  };

  onDeepSearch = async (req) => {
    const { query } = req.data;
    const qEmbedding = await embed(query);
    // Riusa gli embedding già calcolati sui chunk, nessun embedding
    // aggiuntivo da creare oltre a quello della query stessa. Un asset può
    // avere più chunk: prende la similarity massima per asset.
    const rows = await cds.run(
      `SELECT a."ID" as "ASSETID", a."TITLE" as "TITLE",
              MAX(COSINE_SIMILARITY(c."EMBEDDING", TO_REAL_VECTOR(?))) as "SIMILARITY"
       FROM "BILLY_CHUNK" c
       JOIN "BILLY_ASSET" a ON a."ID" = c."ASSET_ID"
       WHERE c."CERTIFICATIONLEVEL" != 'deprecated'
       GROUP BY a."ID", a."TITLE"
       ORDER BY "SIMILARITY" DESC`,
      [`[${qEmbedding.join(',')}]`]
    );
    return rows.map((r) => ({ assetId: r.ASSETID, title: r.TITLE, similarity: r.SIMILARITY }));
  };

  onExpireCertifications = async () => {
    const rows = await cds.run(
      `SELECT "ID" FROM "BILLY_ASSET" WHERE "CERTIFICATIONLEVEL" = 'certified' AND "CERTIFICATIONEXPIRESAT" < CURRENT_TIMESTAMP`
    );
    for (const row of rows) {
      await UPDATE('billy.Asset', row.ID).with({ certificationLevel: 'certifiedOutdated' });
      await syncChunkCertification(row.ID, 'certifiedOutdated');
    }
    return { expiredCount: rows.length };
  };
};
