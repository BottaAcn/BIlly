# Architettura Billy v1 — documento di riferimento completo

> Questo documento definisce **tutto** ciò che serve per passare dal walking skeleton (v0.0.1, vedi `doc/V0.0.1/`) all'applicazione completa. È la fonte di verità per il modello dati, i servizi, la pipeline RAG, il frontend, la sicurezza e il deploy. Le decisioni architetturali di fondo restano quelle di [HANDOFF.md](../V0.0.1/HANDOFF.md) §2 (D1-D15) — qui le sviluppiamo in dettaglio implementativo.

> **Due vincoli espliciti dell'utente da rispettare sempre in questo documento e nell'implementazione:**
> 1. **Un solo modello LLM, sempre**: Claude Sonnet 4.6 via `OrchestrationClient`. Niente routing multi-modello (D9 revocata).
> 2. **XSUAA è l'ultima cosa da implementare**, dopo tutto il resto (D15). Fino ad allora l'app resta aperta (`auth: kind: dummy`, pattern già validato in v0.0.1).

---

## 1. Vista d'insieme

Billy è composto da due macro-aree che condividono lo stesso backend CAP e lo stesso database:

- **Billy (chatbot RAG)**: risponde a domande sulla documentazione della practice, citando le fonti con link cliccabili nel marketplace. In futuro esposto anche come tool MCP.
- **Marketplace**: catalogo dove i colleghi caricano asset (documenti, skill, tool, applicazioni, interfacce), li certificano, e guadagnano punti in un sistema di stagioni (gamification).

I due lati condividono l'entità `Asset`/`Chunk` (il contenuto che Billy usa per rispondere È il contenuto del catalogo) — non sono due database separati.

```
                    ┌─────────────────────────────────────┐
                    │      Frontend React + UI5 WC          │
                    │  (Chat Billy | Catalogo | Upload |    │
                    │   Dettaglio Asset | Leaderboard)      │
                    └───────────────┬───────────────────────┘
                                    │ HTML5 App Repo + Approuter (XSUAA — ultimo step)
                                    ▼
                    ┌─────────────────────────────────────┐
                    │           CAP Service Layer           │
                    │  CatalogService | BillyService |      │
                    │  GamificationService                  │
                    └───────┬───────────────────┬───────────┘
                            │                    │
                 ┌──────────▼─────────┐  ┌───────▼──────────────┐
                 │   HANA Cloud        │  │   SAP AI Core         │
                 │ Asset/Chunk/Player/ │  │ (subaccount separato) │
                 │ Season/PointEvent   │  │ Embedding + Claude    │
                 │ Vector(3072)        │  │ via env var credenziali│
                 └─────────────────────┘  └───────────────────────┘
                            │
                 (file allegati: BLOB su HANA, stesso DB sopra —
                  Object Store NON usato, vedi §6)
                            │
                 ┌──────────▼─────────┐
                 │ Malware Scanning    │
                 │ Service (BTP,       │
                 │ entitlement a sé,   │
                 │ non serve Object    │
                 │ Store — vedi §6)    │
                 └─────────────────────┘
```

---

## 2. Modello dati completo

Estende (non sostituisce) `db/schema.cds` di `billy-app/`. L'entità `Document` della v0.0.1 viene **rimossa** e sostituita da `Asset`+`Chunk`.

```cds
namespace billy;
using { cuid, managed } from '@sap/cds/common';

// -----------------------------------------------------------------
// Stato di certificazione — usato sia su Asset che (denormalizzato) su Chunk
// -----------------------------------------------------------------
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
  other;   // categoria generica, nessun campo obbligatorio — vedi §3.1
}

type RevisionStatus : String enum {
  pending;
  approved;
  rejected;
}

// -----------------------------------------------------------------
entity Asset : cuid, managed {
  title                    : String(200) not null;
  description              : String(2000);
  type                     : AssetType not null;
  certificationLevel       : CertificationLevel default #community;
  published                : Boolean default false;    // true solo dopo la prima revisione approvata — vedi §3.1
  certifiedAt              : Timestamp;
  certificationExpiresAt   : Timestamp;
  uploadedBy               : Association to Player not null;
  certifiedBy              : Association to Player;
  externalLink             : String(500);              // per skill/tool ospitati altrove
  attachments              : Composition of many Attachments; // @cap-js/attachments, storage kind "db" (BLOB su HANA, non Object Store — §6)
  chunks                   : Composition of many Chunk on chunks.asset = $self;
  revisions                : Composition of many AssetRevision on revisions.asset = $self;
  pointEvents              : Association to many PointEvent on pointEvents.asset = $self;
}

// -----------------------------------------------------------------
// OGNI pubblicazione di contenuto — la primissima creazione E ogni modifica
// successiva, a QUALUNQUE certificationLevel, `community` incluso — passa da
// qui prima di diventare live. Decisione esplicita dell'utente: l'affidabilità
// del contenuto conta più della velocità di pubblicazione, anche al livello
// base (nota: questo è un cambio deliberato rispetto all'intento originario
// di D10 di evitare la "morte per coda" — qui si accetta il trade-off).
// -----------------------------------------------------------------
entity AssetRevision : cuid, managed {
  asset          : Association to Asset not null;
  title          : String(200);
  description    : String(2000);
  content        : LargeString;                  // testo proposto, prima del chunking
  type           : AssetType;
  externalLink   : String(500);
  status         : RevisionStatus default #pending;
  submittedBy    : Association to Player not null;
  reviewedBy     : Association to Player;
  reviewedAt     : Timestamp;
  pointsPct      : Integer default 100;           // scelto dal certificatore in approvazione (100 = prima certificazione, <100 per revisioni successive)
  validityMonths : Integer;                       // scelto dal certificatore in approvazione
}

// -----------------------------------------------------------------
// Il contenuto vettorizzato. certificationLevel è DENORMALIZZATO da Asset
// di proposito (HANDOFF §2, requisito derivato): il retrieval filtra/pesa
// per certificazione senza dover fare join con Asset ad ogni query.
// -----------------------------------------------------------------
entity Chunk : cuid {
  asset               : Association to Asset not null;
  text                : LargeString not null;
  embedding           : Vector(3072) not null;
  certificationLevel  : CertificationLevel not null; // sync da Asset a ogni scrittura/certificazione
  chunkIndex          : Integer not null;             // posizione nel documento originale
}

// -----------------------------------------------------------------
type SeniorityLevel : String enum {
  analyst;
  senior;
  manager;   // valore del livello — non confondere con il campo `manager` sotto (il capo di questa persona)
}

entity Player : cuid {
  userId          : String(255) not null;   // subject/email da SAP ID Service (poi IAS)
  displayName     : String(200);
  department      : String(100);            // D13: nullo finché non c'è IAS, schema già pronto
  manager         : String(200);            // riferimento al capo di questa persona (non il livello)
  seniorityLevel  : SeniorityLevel;          // analyst | senior | manager
  isCertifier     : Boolean default false;   // assegnato a mano dall'admin — provvisorio, enforcement reale solo con XSUAA (D15)
  isAdmin         : Boolean default false;   // idem, per le azioni riservate ad Admin (eliminazione reale, ecc.)
  pointEvents     : Association to many PointEvent on pointEvents.player = $self;
  totalPoints     : Integer default 0;      // denormalizzato per leaderboard veloce, ricalcolato da PointEvent
}

// -----------------------------------------------------------------
entity Season : cuid {
  name       : String(100) not null;
  startDate  : Date not null;
  endDate    : Date not null;
  status     : String(20) default 'active'; // active | closed
  winner     : Association to Player;
  pointEvents: Association to many PointEvent on pointEvents.season = $self;
}

// -----------------------------------------------------------------
type PointReason : String enum {
  upload;
  certify;
  use;        // D12: punti anche a chi certifica, non solo a chi carica
}

entity PointEvent : cuid, managed {
  player  : Association to Player not null;
  season  : Association to Season not null;
  asset   : Association to Asset;
  points  : Integer not null;
  reason  : PointReason not null;
}
```

**Note di design:**
- `certificationLevel` su `Chunk` viene aggiornato in una singola operazione batch quando l'Asset cambia stato (es. alla certificazione, tutti i chunk di quell'asset vengono aggiornati). Non è un trigger DB, è responsabilità del service layer (CAP non ha trigger nativi cross-entity puliti in Node.js).
- `totalPoints` su `Player` è denormalizzato per performance della leaderboard; va ricalcolato (o incrementato atomicamente) ad ogni `PointEvent` creato.
- Alla scadenza (`certificationExpiresAt` superato), un job schedulato transiziona `certified` → `certifiedOutdated`.
- **Transizioni di stato libere**: un `Certifier`/`Admin` può portare un Asset da **qualsiasi** stato a **qualsiasi** altro stato, sempre (nessuna state machine vincolata) — decisione esplicita dell'utente. Questo include la deprecazione (reversibile) e la ri-approvazione manuale in qualunque momento.
- **Eliminazione reale**: possibile, ma riservata solo ad `Admin` (`isAdmin=true`) — i certificatori possono deprecare/certificare ma non eliminare in modo definitivo.
- I chunk **non esistono/non sono ricercabili** finché `Asset.published = false` — vengono generati solo alla prima `AssetRevision` approvata (rigenerati ad ogni revisione successiva approvata).

---

## 3. Servizi backend

### 3.1 `CatalogService` (marketplace)

**Ruoli (provvisori, enforcement reale solo con XSUAA — D15):** `isCertifier`/`isAdmin` su `Player`, assegnati a mano dall'admin del progetto. Fino ad allora nessuna vera sicurezza server-side su queste azioni — solo logica applicativa.

**Flusso di pubblicazione (vale per la prima creazione E per ogni modifica successiva, a qualunque `certificationLevel`):**

```
uploadAsset / editAsset
        │  crea una AssetRevision(status: pending)
        ▼
   Coda di revisione (listReviewQueue) — visibile ai Certifier/Admin
        │
        ├── reviewRevision(revisionId, approve: true, validityMonths, pointsPct)
        │      → Asset.title/description/type/externalLink = revisione approvata
        │      → rigenera Chunk (chunking + embedding) dal nuovo content
        │      → Asset.published = true, certificationLevel = certified,
        │        certifiedBy, certifiedAt = now, certificationExpiresAt = now + validityMonths
        │      → PointEvent uploader (pointsPct% dei punti pieni), PointEvent certificatore (D12)
        │
        └── reviewRevision(revisionId, approve: false, reason)
               → status = rejected, Asset resta come prima (o non pubblicato se era il primo invio)
```

| Operazione | Tipo | Descrizione |
|---|---|---|
| `Asset` (query) | entity | Lista, dettaglio. Filtri per `type`, `certificationLevel`. Solo asset con `published=true` compaiono nel catalogo/RAG |
| `uploadAsset(title, description, type, content?, file?, externalLink?)` | action | Crea l'`Asset` (non pubblicato) + una `AssetRevision(status: pending, pointsPct: 100)` — **non** genera ancora chunk/embedding, quello avviene solo all'approvazione |
| `editAsset(assetId, title?, description?, content?, ...)` | action | Crea una nuova `AssetRevision(status: pending)` sull'asset esistente — il contenuto live/pubblicato **non cambia** finché non è approvata |
| `listReviewQueue()` | function | Per `Certifier`/`Admin`: unione di due liste — `AssetRevision` in stato `pending` (prime pubblicazioni o modifiche con nuovo contenuto) **e** `Asset` con `certificationLevel = certifiedOutdated` (scaduti, da ri-validare anche senza nuovo contenuto — in quel caso la ri-approvazione richiama `reviewRevision`-like logic sull'ultima revisione approvata, senza crearne una nuova) |
| `reviewRevision(revisionId, approve, validityMonths?, pointsPct?, reason?)` | action | Approva (→ certifica, rigenera chunk, assegna punti) o rifiuta una revisione. Solo `Certifier`/`Admin` |
| `deprecateAsset(assetId)` / `certifyAsset(assetId)` / qualunque altra transizione di stato diretta | action | Solo `Certifier`/`Admin` — transizioni libere, qualsiasi stato → qualsiasi stato (vedi note di design §2) |
| `deleteAsset(assetId)` | action | Eliminazione reale, **solo `Admin`** |
| Ricerca full-text (default) | function | `LIKE`/`CONTAINS` su `title`/`description` — istantanea, nessuna chiamata AI |
| `deepSearch(query)` | function | Pulsante **"Ricerca approfondita"** — ricerca semantica: embedding della query, `COSINE_SIMILARITY` sui `Chunk` esistenti (riusa gli embedding già calcolati, nessun embedding aggiuntivo da creare), risale agli `Asset` distinti trovati. Opt-in, non sostituisce la ricerca di default |
| Job schedulato `expireCertifications` | job | Ogni notte: `certified` con `certificationExpiresAt < now` → `certifiedOutdated` (compare automaticamente in `listReviewQueue`, vedi sopra) |

### 3.2 `BillyService` (RAG, estende v0.0.1)

| Operazione | Tipo | Descrizione |
|---|---|---|
| `askBilly(question)` | action | Vedi pipeline RAG dettagliata in §4. Ritorna `answer` + `sources` (array di `{ assetId, assetTitle, chunkText, similarity, link }`) |
| Streaming | — | La stessa action, ma esposta anche via `stream()` dell'SDK (già confermato funzionante nello smoke test) per l'esperienza chat in tempo reale |

### 3.3 `GamificationService`

| Operazione | Tipo | Descrizione |
|---|---|---|
| `leaderboard(seasonId?)` | function | Classifica giocatori per punti nella stagione (default: stagione attiva) |
| `currentSeason()` | function | Stagione attiva corrente |
| `closeSeason(seasonId)` | action | Calcola il vincitore, marca `closed`, crea la stagione successiva |

**Nota implementativa:** `CatalogService` e `GamificationService` possono vivere nello stesso file/servizio CDS in pratica (sono logicamente distinti ma non serve la separazione fisica in v1) — la separazione qui è concettuale, per chiarezza di responsabilità.

---

## 4. Pipeline RAG dettagliata

```
Upload asset (testo o file)
        │
        ▼
┌───────────────────┐
│ Estrazione testo    │  (solo per file: PDF/docx → testo semplice)
└─────────┬──────────┘
          ▼
┌───────────────────┐
│ Chunking            │  split in chunk da ~500-800 caratteri con overlap ~100
│                     │  (default iniziale — DA MISURARE, non assumere, vedi D8)
└─────────┬──────────┘
          ▼
┌───────────────────┐
│ Embedding           │  AzureOpenAiEmbeddingClient, text-embedding-3-large, 3072 dim
│ (1 chiamata/chunk,  │  già validato in v0.0.1
│  batchabile)        │
└─────────┬──────────┘
          ▼
┌───────────────────┐
│ Storage HANA        │  Chunk.embedding = Vector(3072), certificationLevel denormalizzato
└─────────────────────┘


Domanda utente
        │
        ▼
┌───────────────────┐
│ Embedding domanda   │  stesso modello embedding
└─────────┬──────────┘
          ▼
┌───────────────────┐
│ COSINE_SIMILARITY   │  SELECT TOP k ... ORDER BY similarity DESC
│ su Chunk            │  — pattern SQL raw già validato in v0.0.1
│ (k default 5, D8)   │  Filtro/peso per certificationLevel:
│                     │   - deprecated: escluso dalla query
│                     │   - certifiedOutdated: incluso, peso ridotto, Billy lo segnala (D10)
│                     │   - community: incluso, peso ridotto, Billy lo dichiara (D10)
│                     │   - certified: peso pieno, priorità (D10)
└─────────┬──────────┘
          ▼
┌───────────────────┐
│ Generazione          │  UN SOLO MODELLO: OrchestrationClient, anthropic--claude-4.6-sonnet
│                     │  Niente routing multi-modello (D9 revocata)
│                     │  Prompt di sistema include: contesto + istruzione di dichiarare
│                     │  lo stato di certificazione delle fonti usate
└─────────┬──────────┘
          ▼
┌───────────────────┐
│ Risposta + sources   │  ogni source ha link cliccabile verso l'Asset nel marketplace
│                     │  (motivazione originaria di D1: RAG proprietario = link utili,
│                     │   non un black box SAP)
└─────────────────────┘
```

**Chunking — da misurare, non assumere (D8):** dimensione di partenza 500-800 caratteri con overlap 100, ma va validato empiricamente con documenti reali della practice (ancora da caricare, vedi HANDOFF §8) prima di considerarlo definitivo.

**Retrieval — pesatura per certificazione:** implementazione minima v1: query SQL con `WHERE certificationLevel != 'deprecated'`, poi in applicazione moltiplicare la similarity per un peso (`certified`: **1.0**, `certifiedOutdated`: **0.75**, `community`: **0.35** — salto netto tra `certifiedOutdated` e `community`, per esplicita richiesta) prima di riordinare e prendere il top-k finale. Il peso è **dinamico**: applicato ad ogni singola query in base allo stato *attuale* dell'asset in quel momento, non un valore fissato una tantum — se lo stato cambia, il peso cambia automaticamente dalla query successiva senza bisogno di ricalcoli.

---

## 5. Frontend

**Stack:** React + UI5 Web Components (decisione già presa, HANDOFF §3). Servito da HTML5 Application Repository + Approuter (D4) — **non** più dalla serving statica di CAP usata in v0.0.1 (quello era solo per il test rapido).

**Pagine:**

| Pagina | Contenuto | Priorità |
|---|---|---|
| **Chat Billy** | Landing, tipo ChatGPT, streaming, citazioni cliccabili con badge di certificazione | Alta — è il valore percepito principale |
| **Catalogo** | Grid/lista asset, filtri per tipo e certificazione, ricerca | Alta — serve per popolare e navigare |
| **Dettaglio asset** | Metadati, badge stato, pulsante certifica (per ruoli abilitati), download/link | Media |
| **Upload** | Form: titolo, descrizione, tipo, file o link esterno | Alta — senza questo non entra contenuto |
| **Leaderboard/Profilo** | Punti, classifica stagione, storico contributi personali | Bassa — rifinitura, non blocca l'uso |

---

## 6. File storage e allegati

**Decisione (08/09/2026, dopo verifica tecnica approfondita — non un'assunzione): storage su HANA Cloud, non Object Store.** Riccardo (admin subaccount) ha indicato di andare su HANA quando gli è stata posta la domanda "Object Store o BLOB su HANA?". Prima di accettarlo abbiamo verificato se questo comporta la rinuncia al malware scanning (requisito non negoziabile, D3) — **non è così**, vedi sotto.

### Cosa abbiamo verificato (leggendo il codice sorgente di `@cap-js/attachments`, non solo la doc)

- **`@cap-js/attachments`** supporta nativamente lo storage **"db" (database)** come modalità di storage — non è solo un fallback per test locali come suggerisce una prima lettura della doc, è una modalità di storage riconosciuta a tutti gli effetti. I file vengono salvati come `LargeBinary` (BLOB) su HANA.
- **Il malware scanning è un servizio separato e indipendente dallo storage.** Non è "incluso in Object Store" come pensavamo inizialmente: è **SAP Malware Scanning Service**, un entitlement BTP a sé stante (piani `clamav`/`standard`), bindato con un comando `cds bind` proprio, distinto dal binding dello storage.
- **Conferma definitiva dal codice sorgente del plugin** (`lib/plugin.js`, commento originale): *"Calls next() to persist the request, then synchronously scans the uploaded content via the malware scanner service (**no outbox — db-kind scanner runs in-process**)"*. Il plugin ha un percorso di codice dedicato proprio al caso "storage = db" che esegue comunque lo scan — non è un caso trascurato o non supportato, è previsto esplicitamente.

**Conclusione pratica: possiamo avere sia lo storage gratuito su HANA (già disponibile) sia il vero malware scanning, senza bisogno di Object Store.** L'unico entitlement da richiedere è **SAP Malware Scanning Service** (separato da Object Store), verosimilmente a costo minore/nullo rispetto a quest'ultimo (piano `clamav` = probabile integrazione dell'antivirus open source ClamAV).

### Verifica tecnica su HANA come storage per file (efficienza/qualità)

- **Limite dimensione**: 2GB per LOB su HANA Cloud — ampiamente sufficiente per documenti e pacchetti/tool in zip di uso pratico
- **Nessuna perdita di qualità**: è storage binario lossless, identico byte-per-byte al file originale (non è una compressione con perdita)
- **Efficienza**: HANA usa "Hybrid LOB" — i file di dimensioni sopra una soglia vengono spostati automaticamente su disco (non restano in RAM), quindi non gonfiano la memoria del database anche con molti file caricati
- **Compromesso onesto da tenere presente**: ogni download passa comunque attraverso il motore del database invece che uno storage dedicato — per un uso interno con ~200 persone non è un problema atteso, ma va monitorato se il volume di file/download crescesse molto in futuro. Non è un limite bloccante oggi, è un'osservazione per il futuro.

### Cosa resta da fare in Fase 5

- **`@cap-js/attachments`** in composition su `Asset`, configurato con storage `kind: "db"` (nessun binding Object Store necessario)
- Bind del **SAP Malware Scanning Service** (nuovo entitlement da richiedere — vedi messaggio pronto per l'admin più sotto in questo documento o nella conversazione)
- Estrazione testo da file (PDF/docx) per l'ingestion: libreria da scegliere in fase di implementazione (es. `pdf-parse` per PDF, `mammoth` per docx) — non ancora scelta, va valutata quando si arriva a questa fase

---

## 7. Gamification — logica di dettaglio

| Evento | Punti a chi carica | Punti a chi certifica | Note |
|---|---|---|---|
| Upload asset (revisione creata, ancora `pending`) | Nessuno ancora | — | Niente punti finché non è approvata — coerente con "ogni pubblicazione va approvata" |
| Approvazione prima revisione (→ `certified`) | Punti pieni (`pointsPct=100`) | Punti pieni | D12 — incentivo esplicito ai senior a certificare |
| Approvazione revisione successiva (modifica di un asset già esistente) | `pointsPct`% dei punti pieni, **scelto dal certificatore** (non necessariamente 100%) | Punti pieni per il lavoro di revisione (fisso, non scalato) | Una modifica minore vale meno di una certificazione da zero — a discrezione del certificatore caso per caso |
| Uso (Billy cita l'asset in una risposta) | Punti ridotti, opzionale | — | Da validare se ha senso ai fini del progetto — impatto su Player poco chiaro finché non c'è un caso d'uso concreto |
| Scadenza → `certifiedOutdated` | Mantenuti | Mantenuti | D11 — nessuna penalità retroattiva |
| Ri-approvazione dopo scadenza | Come "revisione successiva" sopra | Punti pieni | Torna a `certified` con nuova `certificationExpiresAt` |

**Stagioni:** durata da definire (mensile? trimestrale?) — non ancora deciso, va discusso prima di implementare `Season`. Alla chiusura, il vincitore riceve un premio (meccanismo di premiazione fuori dallo scope tecnico di questo documento).

---

## 8. MCP (fase avanzata)

`@cap-js/mcp` espone `CatalogService` (e potenzialmente `BillyService`) come tool MCP, permettendo ad altri agenti (incluso Claude Code stesso, o altri assistenti aziendali) di interrogare il catalogo. **Esplicitamente posticipato** (HANDOFF §3): si implementa dopo che il catalogo e Billy sono stabili, perché espone via tool la stessa superficie API già costruita — è un moltiplicatore da aggiungere, non un prerequisito.

---

## 9. Sicurezza — XSUAA (ULTIMO STEP, D15)

Struttura già pronta da v0.0.1 (`billy-app/xs-security.json`), con ruoli `Member`/`Admin`. Da estendere quando si attiva (non prima):

- **`Member`**: uso normale (chat, upload, browse) — ruolo di default per ogni utente autenticato
- **`Certifier`**: può certificare asset — da aggiungere come nuovo ruolo/scope quando si attiva XSUAA (non esiste ancora nel file attuale, va aggiunto in quel momento)
- **`Admin`**: gestione completa, deprecazione asset, chiusura stagioni

**Fino all'attivazione**: `auth: kind: dummy` (pattern validato in v0.0.1), nessuna verifica di ruolo lato server — qualunque logica di ruolo (es. "solo i certificatori possono certificare") **non va implementata come enforcement reale finché XSUAA non c'è**: si può semmai mostrare/nascondere UI, ma non è sicurezza.

---

## 10. Deployment — MTA completo

Estende l'MTA minimo di v0.0.1 (2 moduli: `billy-srv` + `billy-db-deployer`) aggiungendo, **nell'ordine in cui diventano necessari** (non tutti insieme):

| Modulo/risorsa | Quando serve | Tipo |
|---|---|---|
| `billy-srv`, `billy-db-deployer`, `billy-hdi-container` | Già esistenti da v0.0.1 | — |
| `billy-malware-scanner` (SAP Malware Scanning Service) | Quando si implementa upload file reale (§6) — Object Store **non** usato, storage su HANA | resource |
| `billy-ui` (build React) | Quando il frontend React sostituisce l'HTML di test | module (`html5`) |
| `billy-app-deployer` | Insieme a `billy-ui` | module (`com.sap.html5.application-content`) |
| `html5-repo-host` / `html5-repo-runtime` | Insieme a `billy-ui` | resource |
| `billy-approuter` | Quando XSUAA si attiva (D15 — quindi per ultimo) | module (`approuter.nodejs`) |
| `billy-uaa` (XSUAA) | **Ultimo**, D15 | resource — già scritta commentata in `mta.yaml`, va scommentata |
| `destination` | Insieme all'approuter | resource |

---

## 11. Aspetti non funzionali

- **Logging**: SAP Cloud Logging (non Application Logging, in deprecazione — preflight §7.5)
- **Costo**: monitorare consumo token AI Core (dominato dall'input, da cui D8) e costo del piano SAP Malware Scanning Service richiesto (§6) — Object Store non è più nello scope, quindi il suo costo non si applica
- **CI/CD**: non nello scope di questo documento, da affrontare quando il ritmo di rilascio lo giustifica

---

## 12. Cosa NON è ancora deciso (da chiarire prima di implementare quella parte)

- Formato/volume reale dei documenti della practice (determina la strategia di chunking definitiva)
- Durata delle stagioni (mensile/trimestrale/altro)
- Se/quando migrare da SAP ID Service a IAS (non urgente, HANDOFF §8)
- Meccanismo di premiazione a fine stagione (fuori scope tecnico)
- Libreria di estrazione testo da PDF/docx
