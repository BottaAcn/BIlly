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
