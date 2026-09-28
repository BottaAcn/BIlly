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
  // Un prompt + l'elenco di skill e tool MCP che puo' usare, invocabile
  // come sotto-agente dal grafo. Come le skill non viene mai chunkato.
  agent;
  other;
}

// Che cosa un asset di tipo `agent` ha il permesso di usare.
type CapabilityKind : String enum {
  skill;        // -> Asset di tipo skill, caricata intera
  application;  // -> Asset di tipo application, tool MCP via externalLink
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
  // Copia del contenuto dell'ultima revisione approvata. Denormalizzato di
  // proposito (stesso precedente di Chunk.certificationLevel): il tool
  // loadSkill dell'agente è sul percorso caldo e deve leggere il corpo con
  // una sola SELECT, senza risalire all'ultima AssetRevision approvata.
  content                : LargeString;
  // Storage kind "db" su HANA (nessun Object Store), scan disattivato
  // (placeholder "Unscanned" visibile, non silenzio — architecture.md §6).
  // Nota: vive sull'Asset, non su AssetRevision — un editAsset con nuovo
  // file lo allega prima dell'approvazione della revisione (limite noto,
  // non bloccante per il flusso principale di prima pubblicazione).
  attachments            : Composition of many Attachments;
  chunks                 : Composition of many Chunk on chunks.asset = $self;
  // Popolato solo per type = agent (vedi AgentCapability).
  capabilities           : Composition of many AgentCapability on capabilities.agent = $self;
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

// SCELTA DI MODELLAZIONE (agente -> skill/tool).
// La definizione autorevole dell'agente è testo dentro `content`: il prompt
// più un blocco ```json con gli ID (o i titoli) delle skill e delle
// application che può usare. Motivo: `content` è già l'unica cosa che passa
// da AssetRevision -> reviewRevision -> Asset, quindi le capacità vengono
// revisionate e certificate insieme al prompt, con un diff leggibile dal
// certificatore; una composizione scritta a parte sfuggirebbe al flusso di
// revisione (si potrebbe cambiare a chi l'agente ha accesso senza passare
// da un certificatore, che è esattamente il buco da evitare).
// Questa entità è la *materializzazione* di quel blocco, riscritta a ogni
// approvazione (syncAgentCapabilities in catalog-service.js): serve perché
// a runtime il grafo deve sapere in una SELECT cosa può usare l'agente,
// senza riparsare JSON, e perché così il legame è interrogabile (chi usa
// questa skill? quali agenti rompo se deprecò questa application?).
entity AgentCapability : cuid {
  agent      : Association to Asset not null;  // l'asset di tipo `agent`
  capability : Association to Asset not null;  // la skill o l'application usata
  kind       : CapabilityKind not null;
  position   : Integer not null default 0;     // ordine dichiarato nel prompt
}

// Stato di lavoro condiviso fra turni: una pipeline multi-passo (es. "SAC
// Design Factory") ha ogni passo che riempie un pezzo dello stesso artefatto
// JSON, e un turno di chat non basta a contenerla.
// PROPRIETA' E CICLO DI VITA: la possiede un Player (owner) — non una
// conversazione, così la si può riprendere da un'altra chat — ed è legata a
// un `threadId` LangGraph. Muore per scadenza (`expiresAt`, default 30
// giorni dall'ultimo aggiornamento) o quando l'owner la chiude
// (status = closed); la pulizia gira insieme a expireCertifications.
entity WorkSession : cuid, managed {
  owner     : Association to Player;
  threadId  : String(100);              // thread_id LangGraph, se collegata a una chat
  title     : String(200);
  status    : String(20) default 'open'; // open | closed
  // L'artefatto che si accumula. LargeString e non un tipo strutturato:
  // la forma del JSON la decide la skill che lo riempie, non lo schema.
  spec      : LargeString;
  expiresAt : Timestamp;
  checkpoints : Composition of many WorkCheckpoint on checkpoints.session = $self;
}

// Base per un BaseCheckpointSaver HANA (in JS non ne esiste uno): le colonne
// sono quelle che i 5 metodi astratti (getTuple, list, put, putWrites,
// deleteThread) devono leggere/scrivere. MANCA la classe saver vera e
// propria — vedi srv/lib/subagent.js, nota in fondo.
entity WorkCheckpoint : cuid {
  session      : Association to WorkSession;
  threadId     : String(100) not null;
  checkpointNs : String(200) not null default '';
  checkpointId : String(100) not null;
  parentId     : String(100);
  type         : String(50);
  checkpoint   : LargeString;  // serializzato dal SerializerProtocol
  metadata     : LargeString;
  writes       : Composition of many WorkCheckpointWrite on writes.checkpoint = $self;
  savedAt      : Timestamp;
}

// putWrites: le scritture pendenti di un canale, per checkpoint+task.
entity WorkCheckpointWrite : cuid {
  checkpoint : Association to WorkCheckpoint not null;
  taskId     : String(100) not null;
  idx        : Integer not null default 0;
  channel    : String(200) not null;
  type       : String(50);
  value      : LargeString;
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
