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
                 ┌──────────▼─────────┐
                 │   Object Store      │
                 │ (file allegati,     │
                 │  malware scan)      │
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
}

// -----------------------------------------------------------------
entity Asset : cuid, managed {
  title                    : String(200) not null;
  description              : String(2000);
  type                     : AssetType not null;
  certificationLevel       : CertificationLevel default #community;
  certifiedAt              : Timestamp;
  certificationExpiresAt   : Timestamp;
  uploadedBy               : Association to Player not null;
  certifiedBy              : Association to Player;
  externalLink             : String(500);              // per skill/tool ospitati altrove
  attachments              : Composition of many Attachments; // @cap-js/attachments (D3)
  chunks                   : Composition of many Chunk on chunks.asset = $self;
  pointEvents              : Association to many PointEvent on pointEvents.asset = $self;
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
entity Player : cuid {
  userId       : String(255) not null;   // subject/email da SAP ID Service (poi IAS)
  displayName  : String(200);
  department   : String(100);            // D13: nullo finché non c'è IAS, schema già pronto
  manager      : String(200);
  seniority    : String(50);
  pointEvents  : Association to many PointEvent on pointEvents.player = $self;
  totalPoints  : Integer default 0;      // denormalizzato per leaderboard veloce, ricalcolato da PointEvent
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
- Alla scadenza (`certificationExpiresAt` superato), un job schedulato transiziona `certified` → `certifiedOutdated` (D11) — mai indietro a `community`.

---

## 3. Servizi backend

### 3.1 `CatalogService` (marketplace)

| Operazione | Tipo | Descrizione |
|---|---|---|
| `Asset` (CRUD) | entity | Lista, dettaglio, creazione, modifica. Filtri per `type`, `certificationLevel`, ricerca testuale su `title`/`description` |
| `uploadAsset(title, description, type, content?, file?, externalLink?)` | action | Crea l'Asset, salva l'allegato (se presente), **triggera l'ingestion** (chunking + embedding, vedi §4) |
| `certifyAsset(assetId, validityMonths)` | action | Solo per ruolo `Certifier`/`Admin` (post-XSUAA; senza auth, per ora aperta). Imposta `certificationLevel=certified`, `certifiedBy`, `certifiedAt`, `certificationExpiresAt = now + validityMonths`. Sincronizza i chunk. Crea `PointEvent` per uploader **e** certificatore (D12) |
| `deprecateAsset(assetId)` | action | Imposta `deprecated`, esclude dal retrieval RAG (D10, tabella stati) |
| Job schedulato `expireCertifications` | job | Ogni notte: `certified` con `certificationExpiresAt < now` → `certifiedOutdated` |

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

**Retrieval — pesatura per certificazione:** implementazione minima v1: query SQL con `WHERE certificationLevel != 'deprecated'`, poi in applicazione moltiplicare la similarity per un peso (`certified`: 1.0, `certifiedOutdated`: 0.8, `community`: 0.6) prima di riordinare e prendere il top-k finale.

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

- **Object Store** (BTP, piano `standard`) — **entitlement a pagamento**, verificarne la disponibilità prima di iniziare questa parte (preflight §7.2: se non c'è nel piano attuale, fallback temporaneo = testo/LargeString in HANA, migrazione dopo)
- **`@cap-js/attachments`** in composition su `Asset` — gestisce upload, download, e include gratuitamente il **malware scanning** (D3, non negoziabile: chiunque in azienda può caricare file)
- Estrazione testo da file (PDF/docx) per l'ingestion: libreria da scegliere in fase di implementazione (es. `pdf-parse` per PDF, `mammoth` per docx) — non ancora scelta, va valutata quando si arriva a questa fase

---

## 7. Gamification — logica di dettaglio

| Evento | Punti a chi carica | Punti a chi certifica | Note |
|---|---|---|---|
| Upload asset | Punti pieni | — | Stato iniziale `community` |
| Certificazione | Mantenuti | Punti pieni | D12 — incentivo esplicito ai senior a certificare |
| Uso (Billy cita l'asset in una risposta) | Punti ridotti, opzionale | — | Da validare se ha senso ai fini del progetto — impatto su Player poco chiaro finché non c'è un caso d'uso concreto |
| Scadenza → `certifiedOutdated` | Mantenuti | Mantenuti | D11 — nessuna penalità retroattiva |

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
| Object Store | Quando si implementa upload file reale (§6) | resource |
| `billy-ui` (build React) | Quando il frontend React sostituisce l'HTML di test | module (`html5`) |
| `billy-app-deployer` | Insieme a `billy-ui` | module (`com.sap.html5.application-content`) |
| `html5-repo-host` / `html5-repo-runtime` | Insieme a `billy-ui` | resource |
| `billy-approuter` | Quando XSUAA si attiva (D15 — quindi per ultimo) | module (`approuter.nodejs`) |
| `billy-uaa` (XSUAA) | **Ultimo**, D15 | resource — già scritta commentata in `mta.yaml`, va scommentata |
| `destination` | Insieme all'approuter | resource |

---

## 11. Aspetti non funzionali

- **Logging**: SAP Cloud Logging (non Application Logging, in deprecazione — preflight §7.5)
- **Costo**: monitorare consumo token AI Core (dominato dall'input, da cui D8) e costo Object Store (a pagamento, non nel free tier)
- **CI/CD**: non nello scope di questo documento, da affrontare quando il ritmo di rilascio lo giustifica

---

## 12. Cosa NON è ancora deciso (da chiarire prima di implementare quella parte)

- Formato/volume reale dei documenti della practice (determina la strategia di chunking definitiva)
- Durata delle stagioni (mensile/trimestrale/altro)
- Se/quando migrare da SAP ID Service a IAS (non urgente, HANDOFF §8)
- Meccanismo di premiazione a fine stagione (fuori scope tecnico)
- Libreria di estrazione testo da PDF/docx
