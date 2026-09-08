using { billy as db } from '../db/schema';

// XSUAA preparata ma NON attiva (D15 — ultimissimo step). L'app resta
// accessibile a tutti; isCertifier/isAdmin sono controlli applicativi
// provvisori, non vera sicurezza (architecture.md §3.1/§9).
service CatalogService @(path: 'catalog', protocol: 'rest') {

  entity Asset as projection on db.Asset where published = true;

  action uploadAsset(
    title        : String,
    description  : String,
    type         : String,
    content      : String,
    externalLink : String,
    // Fase 5 — upload file reale, alternativo/aggiuntivo al testo incollato
    // (uno dei due va fornito). fileContent è base64, decodificato lato
    // server. Storage su HANA (kind "db"), niente Object Store.
    fileContent  : LargeString,
    fileName     : String,
    fileMimeType : String
  ) returns Asset;

  action editAsset(
    assetId      : UUID,
    title        : String,
    description  : String,
    content      : String,
    type         : String,
    externalLink : String,
    fileContent  : LargeString,
    fileName     : String,
    fileMimeType : String
  ) returns { revisionId : UUID };

  function listReviewQueue() returns array of {
    kind        : String;
    revisionId  : UUID;
    assetId     : UUID;
    title       : String;
    type        : String;
    submittedBy : String;
    submittedAt : Timestamp;
  };

  // Anteprima di sola lettura per la coda di revisione: un certificatore deve
  // poter vedere cosa sta approvando/rifiutando prima di decidere, non solo
  // il titolo. Bypassa di proposito il filtro published=true dell'entity
  // Asset qui sopra (il contenuto vive su AssetRevision, gli allegati su
  // Asset.attachments — letti entrambi indipendentemente dallo stato di
  // pubblicazione, stesso approccio di onDownloadAttachment/onDeleteAsset).
  function getRevisionDetail(revisionId: UUID) returns {
    revisionId   : UUID;
    assetId      : UUID;
    title        : String;
    description  : String;
    content      : LargeString;
    type         : String;
    externalLink : String;
    submittedBy  : String;
    submittedAt  : Timestamp;
    attachments  : array of {
      ID       : UUID;
      filename : String;
      mimeType : String;
    };
  };

  action reviewRevision(
    revisionId     : UUID,
    approve        : Boolean,
    validityMonths : Integer,
    pointsPct      : Integer,
    reason         : String
  ) returns Asset;

  action setCertificationLevel(
    assetId            : UUID,
    certificationLevel : String,
    validityMonths     : Integer
  ) returns Asset;

  action deleteAsset(assetId: UUID) returns Boolean;

  // Fase 5 — download dell'allegato originale. Bypassa di proposito
  // l'endpoint auto-generato da @cap-js/attachments su Asset.attachments/*/content:
  // quell'endpoint assume richieste OData (req.params popolato in un certo modo)
  // e con protocol:'rest' crasha l'intero processo (vedi registro deviazioni,
  // fase5-checklist.md). Risposta scritta direttamente su req.res, non via `returns`.
  function downloadAttachment(assetId: UUID, attachmentId: UUID) returns Boolean;

  function searchAssets(query: String) returns array of Asset;

  function deepSearch(query: String) returns array of {
    assetId    : UUID;
    title      : String;
    similarity : Double;
  };

  action expireCertifications() returns { expiredCount: Integer };
}

// Fase 7 — espone CatalogService come server MCP (@cap-js/mcp), tool per
// tool grazie a cds.mcp.per_action_tool (package.json). Decisione esplicita:
// tutto il servizio, non un sottoinsieme (architecture.md §8).
// NOTA: il servizio dichiara già `protocol: 'rest'` inline nel suo header
// (v0.0.1). @sap/cds usa SOLO quel valore quando è già presente, ignorando
// del tutto un'annotazione @mcp separata (letto in
// node_modules/@sap/cds/lib/srv/protocols/index.js, endpoints4()) — serve
// sovrascrivere @protocol con un array esplicito per servire entrambi.
annotate CatalogService with @protocol: ['rest', 'mcp'];
annotate CatalogService with @mcp.instructions: 'Usa searchAssets per una ricerca full-text istantanea su titolo/descrizione degli asset pubblicati. Usa deepSearch per una ricerca semantica (RAG/similarity) quando la domanda non corrisponde a parole esatte nel catalogo. Le altre action gestiscono il ciclo di vita degli asset (upload, revisione, certificazione).';
