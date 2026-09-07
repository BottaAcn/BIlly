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
    externalLink : String
  ) returns Asset;

  action editAsset(
    assetId      : UUID,
    title        : String,
    description  : String,
    content      : String,
    type         : String,
    externalLink : String
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

  function searchAssets(query: String) returns array of Asset;

  function deepSearch(query: String) returns array of {
    assetId    : UUID;
    title      : String;
    similarity : Double;
  };

  action expireCertifications() returns { expiredCount: Integer };
}
