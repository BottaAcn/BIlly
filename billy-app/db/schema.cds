namespace billy;

using { cuid, managed } from '@sap/cds/common';
using { Attachments } from '@cap-js/attachments';

type CertificationLevel : String enum {
  community;
  certified;
  certifiedOutdated;
  deprecated;
}

type AssetType : String enum {
  document;
  skill;
  tool;
  application;
  interface;
  other;
}

type RevisionStatus : String enum {
  pending;
  approved;
  rejected;
}

type SeniorityLevel : String enum {
  analyst;
  senior;
  manager;
}

type PointReason : String enum {
  upload;
  certify;
  use;
}

entity Asset : cuid, managed {
  title                  : String(200) not null;
  description            : String(2000);
  type                   : AssetType not null default #document;
  certificationLevel     : CertificationLevel not null default #community;
  published              : Boolean default false;
  certifiedAt            : Timestamp;
  certificationExpiresAt : Timestamp;
  uploadedBy             : Association to Player not null;
  certifiedBy            : Association to Player;
  externalLink           : String(500);
  // Storage kind "db" su HANA (nessun Object Store), scan disattivato
  // (placeholder "Unscanned" visibile, non silenzio — architecture.md §6).
  // Nota: vive sull'Asset, non su AssetRevision — un editAsset con nuovo
  // file lo allega prima dell'approvazione della revisione (limite noto,
  // non bloccante per il flusso principale di prima pubblicazione).
  attachments            : Composition of many Attachments;
  chunks                 : Composition of many Chunk on chunks.asset = $self;
  revisions              : Composition of many AssetRevision on revisions.asset = $self;
  pointEvents            : Association to many PointEvent on pointEvents.asset = $self;
}

// Ogni pubblicazione di contenuto — la primissima creazione E ogni modifica
// successiva, a qualunque certificationLevel, community incluso — passa da
// qui prima di diventare live (architecture.md §2/§3.1).
entity AssetRevision : cuid, managed {
  asset          : Association to Asset not null;
  title          : String(200);
  description    : String(2000);
  content        : LargeString;
  type           : AssetType;
  externalLink   : String(500);
  status         : RevisionStatus not null default #pending;
  submittedBy    : Association to Player not null;
  reviewedBy     : Association to Player;
  reviewedAt     : Timestamp;
  pointsPct      : Integer default 100;
  validityMonths : Integer;
}

// certificationLevel è denormalizzato da Asset di proposito: il retrieval
// filtra/pesa per certificazione senza join ad ogni query RAG. I chunk
// esistono solo per asset con published=true (generati alla prima
// AssetRevision approvata, rigenerati ad ogni revisione successiva approvata).
entity Chunk : cuid {
  asset              : Association to Asset not null;
  text               : LargeString not null;
  embedding          : Vector(3072) not null;
  certificationLevel : CertificationLevel not null;
  chunkIndex         : Integer not null default 0;
}

entity Player : cuid {
  userId         : String(255) not null;
  displayName    : String(200);
  department     : String(100);
  manager        : String(200);
  seniorityLevel : SeniorityLevel;
  isCertifier    : Boolean default false;
  isAdmin        : Boolean default false;
  totalPoints    : Integer default 0;
  pointEvents    : Association to many PointEvent on pointEvents.player = $self;
}

entity Season : cuid {
  name        : String(100) not null;
  startDate   : Date not null;
  endDate     : Date not null;
  status      : String(20) default 'active';
  winner      : Association to Player;
  pointEvents : Association to many PointEvent on pointEvents.season = $self;
}

entity PointEvent : cuid, managed {
  player : Association to Player not null;
  season : Association to Season not null;
  asset  : Association to Asset;
  points : Integer not null;
  reason : PointReason not null;
}
