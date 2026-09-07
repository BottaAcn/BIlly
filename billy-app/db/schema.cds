namespace billy;

using { cuid, managed } from '@sap/cds/common';

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
  certifiedAt            : Timestamp;
  certificationExpiresAt : Timestamp;
  uploadedBy             : Association to Player not null;
  certifiedBy            : Association to Player;
  externalLink           : String(500);
  chunks                 : Composition of many Chunk on chunks.asset = $self;
  pointEvents            : Association to many PointEvent on pointEvents.asset = $self;
}

// certificationLevel è denormalizzato da Asset di proposito: il retrieval
// (Fase 1) filtra/pesa per certificazione senza join ad ogni query RAG.
entity Chunk : cuid {
  asset              : Association to Asset not null;
  text               : LargeString not null;
  embedding          : Vector(3072) not null;
  certificationLevel : CertificationLevel not null;
  chunkIndex         : Integer not null default 0;
}

entity Player : cuid {
  userId      : String(255) not null;
  displayName : String(200);
  department  : String(100);
  manager     : String(200);
  seniority   : String(50);
  totalPoints : Integer default 0;
  pointEvents : Association to many PointEvent on pointEvents.player = $self;
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
