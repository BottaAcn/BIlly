# Billy × Copilot Studio — Migrazione completa da SAP BTP

**Data:** novembre 2026  
**Decisione:** migrare Billy da SAP BTP Cloud Foundry a Microsoft Copilot Studio, usando esclusivamente ciò che è incluso nella licenza M365 Copilot di Accenture — zero costi aggiuntivi, zero Azure subscription personale.  
**Stato BTP:** rimane attivo fino a conferma esplicita che il nuovo Billy funziona su Copilot Studio.

---

## Indice

1. [Perché migrare](#1-perché-migrare)
2. [Vincoli fermi](#2-vincoli-fermi)
3. [Billy su BTP — stato attuale](#3-billy-su-btp--stato-attuale)
4. [Ecosistema target: Copilot Studio](#4-ecosistema-target-copilot-studio)
5. [Il GitHub Copilot harness — cuore del nuovo Billy](#5-il-github-copilot-harness--cuore-del-nuovo-billy)
6. [Architettura target completa](#6-architettura-target-completa)
7. [Mapping feature per feature](#7-mapping-feature-per-feature)
8. [Schema SharePoint — Billy Catalog](#8-schema-sharepoint--billy-catalog)
9. [Actions del nuovo Billy](#9-actions-del-nuovo-billy)
10. [Power Automate flows](#10-power-automate-flows)
11. [Sub-agenti (Connected Agents)](#11-sub-agenti-connected-agents)
12. [Distribuzione e canali](#12-distribuzione-e-canali)
13. [Cosa non è replicabile senza Azure](#13-cosa-non-è-replicabile-senza-azure)
14. [Piano di migrazione step-by-step](#14-piano-di-migrazione-step-by-step)
15. [Export dati da BTP](#15-export-dati-da-btp)
16. [Testing e criteri di go-live](#16-testing-e-criteri-di-go-live)
17. [Cosa fare ora senza IT](#17-cosa-fare-ora-senza-it)
18. [Dipendenze IT — per dopo](#18-dipendenze-it--per-dopo)
19. [Criteri per spegnere BTP](#19-criteri-per-spegnere-btp)

---

## 1. Perché migrare

Il management ha comunicato che SAP BTP è **troppo costoso, inaccessibile e difficile da integrare** nell'ecosistema Accenture. La piattaforma target è Microsoft Copilot Studio, che:

- È già inclusa nella licenza M365 Copilot di Accenture (costo zero)
- Si integra nativamente con Teams, SharePoint, Power Platform
- Supporta la distribuzione come agente in M365 Copilot chat (sidebar di Copilot)
- Ha un'infrastruttura SSO già in place via Entra ID (zero friction per gli utenti Accenture)
- Non richiede VPN, accesso CF, deployment pipeline SAP — accessibile da browser

---

## 2. Vincoli fermi

| Vincolo | Dettaglio |
|---|---|
| **Zero costo aggiuntivo** | Usare solo ciò che è incluso in M365 Copilot license |
| **No Azure subscription** | L'account `l.botta@accenture.com` non ha una subscription Azure personale |
| **No Azure OpenAI separato** | Non si compra Azure OpenAI a parte — si usa il modello Microsoft incluso |
| **No LangGraph** | Custom Engine Agent (che permette LangGraph) richiede Azure OpenAI → fuori scope |
| **BTP rimane acceso** | Fino a conferma esplicita dell'utente, BTP non va spento |
| **Backup locale prima di tutto** | Prima di qualsiasi migrazione, export completo dei dati da HANA su JSON locale |

---

## 3. Billy su BTP — stato attuale

### Componenti attivi in produzione

| Componente | Dettaglio |
|---|---|
| **Runtime** | SAP CAP Node.js su Cloud Foundry, `accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com` |
| **Branch / HEAD** | `feat/langgraph-js` / `0e1a182` (28 settembre 2026, invariato) |
| **Motore agentico** | LangGraph JS `createReactAgent` in `graph.js` |
| **Modello LLM** | `gpt-5.5` via `AzureOpenAiChatClient` (`@sap-ai-sdk/langchain`), resource group `team-ai-contest-3` |
| **Tool loop** | `searchKnowledge` + `loadSkill`, max 5 iterazioni (recursionLimit 11) |
| **RAG** | HANA Vector Engine, chunk 700/100 char, `text-embedding-3-large` 3072 dim |
| **Pesi certificazione** | `COSINE_SIMILARITY × peso`: certified=1.0, certifiedOutdated=0.75, community=0.35, deprecated=escluso |
| **Skill nel manifesto** | 22 (verificato live il 03/11/2026) |
| **Streaming** | `streaming: false` (workaround bug `@sap-ai-sdk/foundation-models` su chunk finale senza `delta`) |
| **Billy come MCP server** | `@cap-js/mcp` v1.4.3, `/mcp/catalog` + `/mcp/billy` |
| **Auth** | Dummy (XSUAA preparata ma non attiva) |
| **RAM** | 1.024 MB (`billy-srv`) |

### Componenti scritti ma non collegati

| Componente | File | Problema |
|---|---|---|
| MCP client (app esterne) | `srv/lib/mcp-client.js` | `@langchain/mcp-adapters` non in package.json; non importato da graph.js |
| Sotto-agenti | `srv/lib/subagent.js` | Nessun tool di delega nel grafo; `invoke` non fornito |
| Checkpointer HANA | Tabelle create | `BaseCheckpointSaver` 5 metodi non implementati |

### Benchmark qualità routing

| Configurazione | Punteggio |
|---|---|
| LangGraph JS + gpt-5.5 | 28/35 |
| Tool loop a mano + gpt-5.5 | 27/35 |
| Tool loop a mano + Claude | 27/35 |

Casi falliti (hard routing failures): 7, 10, 11, 12, 13, 30 — tutti legati a descrizioni skill sbagliate (`02-orchestratore`, `17-render-excel`), non al runtime.

---

## 4. Ecosistema target: Copilot Studio

### Cos'è Copilot Studio

Microsoft Copilot Studio è una piattaforma low-code per costruire agenti AI distribuibili in Teams, M365 Copilot chat, SharePoint, web. Include:

- Editor grafico per il comportamento dell'agente
- Knowledge sources (RAG su SharePoint, siti web, documenti)
- Actions (chiamate a Power Automate flows o REST API)
- Connected Agents (sub-agenti)
- MCP consumption nativa (da luglio 2026)
- Due modalità di orchestrazione (harness): Standard e GitHub Copilot

### Billing con licenza M365 Copilot

Con licenza M365 Copilot attiva nel tenant:
- Risposte generative: **gratis** (nessun contatore di messaggi)
- Chiamate a tool/actions: **gratis**
- Grounding su Microsoft Graph (Teams, SharePoint, email): **gratis**
- Connected Agents: **gratis**

Senza licenza M365 Copilot: si paga a consumo (~$0.01/messaggio). Accenture ha la licenza → tutto incluso.

### Componenti della Power Platform inclusi in M365

| Componente | Uso in Billy | Note |
|---|---|---|
| **Copilot Studio** | L'agente Billy | Editor agente, knowledge sources, actions |
| **Power Automate** | Approval flow, LoadSkill, PublishAsset | Flow automatici e agentici |
| **Power Apps** | Wizard upload, catalogo, review queue | Canvas app embedded in Teams |
| **SharePoint** | Storage catalogo (documenti + skill + metadati) | Include versioning nativo |
| **Teams** | Distribuzione, tab catalogo, notifiche approvazione | Bot + tab + Adaptive Cards |
| **Entra ID** | SSO, autorizzazioni per ruolo | Già nel tenant Accenture |
| **Power Platform Environments** | Dev / Test / Prod | Admin richiesto per ambienti non-default |

---

## 5. Il GitHub Copilot harness — cuore del nuovo Billy

### Attenzione alla nomenclatura

**GitHub Copilot harness** ≠ GitHub Copilot (il tool per scrivere codice).
È una **modalità avanzata di orchestrazione** dentro Copilot Studio, disponibile da giugno 2026 in production-ready preview. Non ha nulla a che fare con repository GitHub.

### Differenze tra harness

| | Standard harness | **GitHub Copilot harness** |
|---|---|---|
| Tipo di ragionamento | Q&A + regole statiche | Multi-step reasoning, sceglie da solo |
| Uso delle actions | Una action per volta | Catena di actions in sequenza autonoma |
| Autonomia | Risponde → fine | Ragiona → chiama tool → ragiona → chiama altro tool → risponde |
| Complessità task | Semplice | Complessa, multi-step |
| Analogia con BTP | RAG base | Vicino a `createReactAgent` di LangGraph |
| Costo con M365 Copilot | Gratis | Gratis |
| Disponibilità | GA | Production-ready preview (giugno 2026) |

### Perché GitHub Copilot harness è quello giusto per Billy

Billy non è un chatbot Q&A. Deve:
1. Ricevere una domanda
2. Decidere se esiste una skill pertinente nel manifesto
3. Caricare la skill per intero (LoadSkill)
4. Eventualmente delegare a un sotto-agente
5. Usare i risultati per comporre la risposta

Questa è una sequenza multi-step con decisioni autonome — esattamente il caso d'uso del GitHub Copilot harness. Con lo standard harness non è possibile: userebbe il knowledge source direttamente senza il ciclo di ragionamento su quale skill caricare.

---

## 6. Architettura target completa

```
╔══════════════════════════════════════════════════════════════════╗
║             CANALI DI DISTRIBUZIONE                              ║
║  Teams chat │ M365 Copilot sidebar │ Teams tab │ SharePoint web  ║
╚══════════════════════════╤═══════════════════════════════════════╝
                           │
╔══════════════════════════▼═══════════════════════════════════════╗
║                    BILLY AGENT                                   ║
║          Copilot Studio — GitHub Copilot harness                 ║
║                                                                  ║
║  System instructions (istruzioni numerate Billy)                 ║
║                                                                  ║
║  Knowledge sources:                                              ║
║  ├─ SP Library "Certified Docs"   → documenti certified          ║
║  ├─ SP Library "Community Docs"   → documenti community          ║
║  └─ SP Library "Skill Index"      → solo Title + Description     ║
║        (NO corpo skill — solo per scoperta)                      ║
║                                                                  ║
║  Actions (tool loop):                                            ║
║  ├─ LoadSkill(skillId)            → carica corpo intero skill    ║
║  ├─ SearchCatalog(query, filter)  → ricerca avanzata con cert    ║
║  ├─ PublishAsset(assetId)         → deploya/pubblica un asset    ║
║  └─ RunSubAgent(agentId, task)    → delega a sotto-agente        ║
╚══════════════════════════╤═══════════════════════════════════════╝
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
╔══════════════╗  ╔════════════════╗  ╔═══════════════════╗
║  SharePoint  ║  ║ Power Automate ║  ║  Connected Agents ║
║  Billy       ║  ║ Flows          ║  ║  (sotto-agenti)   ║
║  Catalog     ║  ║                ║  ║                   ║
║              ║  ║ ├─ LoadSkill   ║  ║  Ogni asset tipo  ║
║ ├─ Certified ║  ║ ├─ Approval    ║  ║  "agent" = agente ║
║ ├─ Community ║  ║ ├─ Publish     ║  ║  Copilot Studio   ║
║ ├─ Skills    ║  ║ └─ Notify      ║  ║  separato con     ║
║ └─ Agents    ║  ╚════════════════╝  ║  tool set isolato ║
╚══════════════╝                      ╚═══════════════════╝
        │
╔═══════▼══════════════════════════════════════════════════════════╗
║                    POWER APPS                                    ║
║         Wizard upload │ Catalogo │ Review queue │ Admin          ║
║                   (embedded in Teams come tab)                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 7. Mapping feature per feature

### I 4 tipi di asset → Copilot Studio

| Tipo BTP | Descrizione | Equivalente Copilot Studio |
|---|---|---|
| `document` | Documento indicizzato nel RAG | File in SharePoint library + knowledge source |
| `skill` | Procedura con manifesto + corpo | Item in SP "Skill Index" (solo Title+Desc) + corpo in campo Content (caricato via LoadSkill) |
| `interface` | Mini-app HTML/JS | File HTML in SharePoint (hostato nativamente) oppure Power Apps canvas |
| `application` | App esterna con endpoint MCP | Connettore MCP in Copilot Studio (nativo da luglio 2026) |
| `agent` | Sotto-agente con tool set isolato | Connected Agent in Copilot Studio (GA aprile 2026) |

### Funzionalità principali

| Funzionalità BTP | Stato su Copilot Studio | Note |
|---|---|---|
| Tool loop multi-step | ✅ Disponibile | GitHub Copilot harness |
| Manifesto skill (22 titoli+descrizioni) | ✅ Disponibile | Knowledge source su SP "Skill Index" |
| Progressive disclosure (LoadSkill) | ✅ Disponibile | Action Power Automate |
| RAG su documenti | ✅ Disponibile | Knowledge source su SP libraries |
| Pesi certificazione matematici | ⚠️ Approssimato | Knowledge sources separati + istruzioni (vedi §) |
| Workflow upload → revisione → approvazione | ✅ Disponibile | Power Automate approval flow |
| Catalogo navigabile | ✅ Disponibile | Power Apps canvas in Teams |
| Sotto-agenti | ✅ Disponibile | Connected Agents |
| MCP client (app esterne) | ✅ Disponibile | Nativo in Copilot Studio |
| Billy come MCP server | ✅ Mantenibile | Non strettamente necessario su Copilot Studio |
| SSO Accenture | ✅ Migliore | Entra ID già in place, zero friction |
| Storico conversazione | ✅ Disponibile | Nativo in Copilot Studio (session memory) |
| Token-by-token streaming | ❌ Non controllabile | Black box Teams channel |
| Custom chunk size RAG | ❌ Non disponibile | Black box Microsoft |
| Custom embedding model | ❌ Non disponibile | Black box Microsoft |
| Pesi esatti (×1.0/×0.75/×0.35) | ❌ Non disponibile | Richiederebbe Azure AI Search |
| Frontend Web Components custom | ❌ Sostituito | Power Apps (meno flessibile visivamente) |

---

## 8. Schema SharePoint — Billy Catalog

### Struttura sito

```
SharePoint Site: "Billy Catalog"
├── Library: Certified Documents    → documenti certified + certifiedOutdated
├── Library: Community Documents    → documenti community
├── Library: Skill Index            → solo Title + Description (NO corpo)
├── Library: Skill Content          → corpo completo delle skill (campo Content)
├── Library: Agent Configs          → configurazioni sotto-agenti
└── Library: Interfaces             → file HTML/JS hostati
```

> Nota: Skill Index e Skill Content possono essere la stessa library con una view che nasconde il campo Content al knowledge source — così il knowledge source vede solo il manifesto, ma LoadSkill può accedere al corpo dalla stessa lista.

### Colonne custom su tutte le libraries

| Colonna | Tipo | Valori | Note |
|---|---|---|---|
| `AssetType` | Choice | document / skill / interface / application / agent | Tipo asset Billy |
| `CertificationLevel` | Choice | certified / certifiedOutdated / community / deprecated | Livello di certificazione |
| `Status` | Choice | draft / in-review / published / deprecated | Stato nel workflow |
| `Owner` | Person | — | Chi ha caricato l'asset |
| `Description` | Multiline Text | — | Descrizione breve (per manifesto skill) |
| `Content` | Multiline Text (enhanced) | — | Corpo completo skill / prompt agente / link interfaccia |
| `ExternalLink` | Hyperlink | — | URL endpoint MCP per asset application |
| `Version` | Number | — | SharePoint ha versioning nativo, questo è il major |
| `ReviewedBy` | Person | — | Chi ha approvato |
| `ReviewNotes` | Multiline Text | — | Note del revisore |

### Approssimazione certification weighting

Senza poter fare `COSINE_SIMILARITY × 0.75` nella black box di Copilot Studio, la strategia è:

**Knowledge sources separati per livello di certificazione:**
- Source 1: "Certified Documents" → contenuto con massima autorevolezza
- Source 2: "Community Documents" → contenuto non validato

**Istruzioni nel system prompt:**
```
Hai due sorgenti di conoscenza:
1. "Certified Documents" — fonte autorevole, validata da senior. Usala sempre come prima scelta.
2. "Community Documents" — contributi non validati. Usala solo se Certified non ha la risposta;
   avvisa sempre l'utente che la fonte non è stata validata da un senior Accenture.
   
I contenuti deprecated non esistono in nessuna sorgente (rimossi al momento della deprecazione).
Nella risposta indica SEMPRE da quale sorgente hai preso l'informazione e il suo livello di certificazione.
```

Questo non replica la precisione matematica ma produce lo stesso comportamento osservabile: risposte che privilegiano il certificato e avvertono quando usano community.

---

## 9. Actions del nuovo Billy

Le actions sono i "tool" dell'agente Copilot Studio — equivalente ai tool `searchKnowledge` e `loadSkill` di LangGraph.

### `LoadSkill(skillId)`

**Scopo:** carica il corpo completo di una skill (fino a 60.000 char) quando il modello decide che è necessaria per rispondere.

**Implementazione:** Power Automate flow

```
Trigger: HTTP request da Copilot Studio
Input:  { "skillId": "guid-o-titolo-skill" }

Step 1: Get item from SharePoint
  Site: Billy Catalog
  Library: Skill Content
  Filter: ID eq skillId OR Title eq skillId

Step 2: Return response
  Output: {
    "title": item.Title,
    "content": item.Content,
    "certificationLevel": item.CertificationLevel,
    "owner": item.Owner,
    "lastModified": item.Modified
  }
```

**Istruzione corrispondente nel system prompt:**
```
Il knowledge source "Skill Index" contiene l'indice delle procedure disponibili 
(solo titolo e descrizione). NON contiene le procedure complete.
Se identifichi una skill pertinente alla domanda, usa SEMPRE l'action LoadSkill 
prima di rispondere — non rispondere su una skill senza averla caricata per intero.
```

### `SearchCatalog(query, certificationFilter)`

**Scopo:** ricerca avanzata nel catalogo con filtro su tipo asset e certificazione.

**Implementazione:** Power Automate flow → SharePoint Search REST API

```
Trigger: HTTP request da Copilot Studio
Input:  { "query": "stringa ricerca", "certFilter": "certified|community|all" }

Step 1: Compose SharePoint Search query
  URL: /search/query?querytext='query'&refiners='CertificationLevel'
  Con filtro: &refinementfilters='CertificationLevel:certified'

Step 2: Parse results → array di { title, url, excerpt, certLevel, assetType }

Step 3: Return array
```

### `PublishAsset(assetId)`

**Scopo:** Billy può avviare il publish di un asset approvato (cambia Status, notifica, deploya se interfaccia).

**Implementazione:** Power Automate flow

```
Trigger: HTTP request da Copilot Studio
Input:  { "assetId": "guid" }

Step 1: Get item da SharePoint, verifica Status = "approved" e chiamante = Owner o Admin
Step 2: Switch su AssetType
  - document/skill: aggiorna Status → "published", aggiorna knowledge source
  - interface: cambia permessi cartella SharePoint → accessibile, aggiorna ExternalLink
  - application: registra endpoint MCP in Copilot Studio (via API o manuale)
  - agent: crea Connected Agent via Power Platform Management API (se permessi disponibili)
Step 3: Notifica via Teams all'Owner: "Il tuo asset è stato pubblicato"
Step 4: Return { success: true, publicUrl: "..." }
```

### `RunSubAgent(agentId, task)`

**Scopo:** delega una task a un sotto-agente specializzato.

**Implementazione:** Connected Agents (nativo Copilot Studio, no Power Automate)

```
Configurazione in Copilot Studio:
  Connected Agent: { name: agentId, endpoint: internal }
  Input: { task: "descrizione task" }
  Output: risposta del sotto-agente
```

---

## 10. Power Automate flows

### Flow principale: Approval workflow

```
TRIGGER: SharePoint item created/modified
  Condition: Status = "in-review"

STEP 1: Get item metadata (title, type, owner, description)

STEP 2: Start and wait for an approval
  Approval type: "Approve/Reject - First to respond"
  Assigned to: [gruppo revisor senior Accenture]
  Title: "Revisione asset: [Title]"
  Details: "Tipo: [AssetType] | Certificazione richiesta: [RequestedCertLevel]
            Descrizione: [Description]
            Caricato da: [Owner]
            Link: [SharePoint URL]"
  
STEP 3 (if Approved):
  - Update item: Status → "approved", CertificationLevel → [livello scelto dal revisore]
  - Review Notes: commento del revisore
  - Adaptive Card notifica all'Owner in Teams: "Il tuo asset è stato approvato"
  
STEP 4 (if Rejected):
  - Update item: Status → "rejected"
  - Review Notes: motivo del rifiuto
  - Adaptive Card notifica all'Owner in Teams con il commento del revisore
```

### Flow: Notifica nuovi asset alla community

```
TRIGGER: SharePoint item modified
  Condition: Status changed to "published"

STEP 1: Get item details
STEP 2: Post message in Teams channel "Billy Aggiornamenti"
  "Nuovo asset pubblicato: [Title] ([AssetType], [CertificationLevel])
   Caricato da [Owner] | [Link]"
```

### Flow: Pulizia deprecated

```
TRIGGER: Scheduled (mensile)

STEP 1: Get all items with CertificationLevel = "certifiedOutdated" AND Modified < 6 months ago
STEP 2: For each: notifica Owner "Il tuo asset non è stato aggiornato da 6 mesi"
STEP 3: Get all items with Status = "deprecated"
STEP 4: Move to "Archive" library (non eliminare — conserva storico)
```

---

## 11. Sub-agenti (Connected Agents)

### Concetto

Ogni asset di tipo `agent` in Billy diventa un Connected Agent separato in Copilot Studio. Il Billy principale può delegare task specifiche a questi sotto-agenti, ognuno con:
- Le proprie istruzioni di sistema
- I propri knowledge sources (solo le skill/documenti assegnati a quell'agente)
- I propri tool (subset delle actions disponibili)

### Esempio: agente "SAP Analytics Cloud"

```
Nome: Billy-SAC
Sistema prompt: "Sei un esperto di SAP Analytics Cloud. 
                 Hai accesso alle skill e ai documenti relativi a SAC.
                 Non rispondere su argomenti non SAC — rimanda al Billy principale."
Knowledge sources: SP Library filtrata su tag "SAC"
Actions: LoadSkill, SearchCatalog (con filtro SAC)
```

### Come Billy principale delega

Nel system prompt di Billy principale:
```
Hai a disposizione sotto-agenti specializzati. Quando la domanda è chiaramente
nell'ambito di un agente specializzato, usa l'action RunSubAgent.
Agenti disponibili:
- Billy-SAC: esperto di SAP Analytics Cloud e reportistica
- Billy-Ariba: esperto di SAP Ariba e procurement
[lista aggiornata dagli asset "agent" pubblicati nel catalogo]
```

### Creazione automatica di nuovi agenti

Con i giusti permessi nel Power Platform environment:
1. Utente carica asset `agent` con titolo, descrizione, skill assegnate, system prompt
2. Il flow di approvazione viene completato
3. `PublishAsset` chiama Power Platform Management API → crea nuovo Connected Agent
4. Il Billy principale viene aggiornato con il nuovo agente nel system prompt
5. (Step 4 richiede IT per i permessi API la prima volta, poi è automatico)

---

## 12. Distribuzione e canali

| Canale | Come si configura | Limitazioni senza IT |
|---|---|---|
| **Teams — chat personale** | Aggiungi il bot a te stesso da Copilot Studio | Nessuna — disponibile subito |
| **Teams — chat con colleghi** | Condividi il link del bot | Nessuna — disponibile subito |
| **M365 Copilot sidebar** | Abilita "Available in Microsoft 365 Copilot" in Copilot Studio | Nessuna — disponibile subito |
| **Teams — tab catalogo (Power App)** | Power App embedded come tab in un team | Nessuna nel team che crei tu |
| **SharePoint embed** | Iframe in pagina SharePoint | Nessuna |
| **Web** | Direct Line channel, iframe in qualsiasi sito | Nessuna |
| **Teams — distribuzione org-wide** | Richiede Teams admin per approvazione nel tenant | **Richiede IT** |

---

## 13. Cosa non è replicabile senza Azure

Onestà tecnica totale:

| Funzionalità | Perché non replicabile | Impatto |
|---|---|---|
| **Pesi esatti ×1.0/×0.75/×0.35 nel retrieval** | Azure AI Search ha scoring profiles; la black box di Copilot Studio non li espone | Medio — approssimato con knowledge sources separati |
| **Custom chunk size (700/100 char)** | Il chunking è gestito da Microsoft internamente | Basso — Microsoft ottimizza automaticamente |
| **Custom embedding model** | Copilot Studio usa il suo embedding, non `text-embedding-3-large` | Basso — impatto sulla qualità retrieval non misurabile a priori |
| **Token-by-token streaming** | Il canale Teams non espone il controllo dello streaming | Basso — UX leggermente diversa |
| **Controllo esatto del modello** | Si usa il modello Microsoft incluso, non gpt-5.5 specifico | Medio — comportamento del modello potrebbe differire |
| **Frontend custom (Web Components SPA)** | Sostituito da Power Apps (meno flessibile CSS) | Medio — accettabile per uso interno Accenture |

---

## 14. Piano di migrazione step-by-step

### Fase 0 — Backup (PRIMA DI TUTTO)

**Non toccare niente finché il backup non è completato e verificato localmente.**

1. Export da HANA: skill (titolo, descrizione, corpo, certificazione, owner, date)
2. Export da HANA: documenti (titolo, chunk, metadati)
3. Export da HANA: utenti e ruoli
4. Verificare che i file JSON locali siano leggibili e completi
5. Salvare in cartella locale `exports/AAAA-MM-GG/`

Script Node.js per l'export: vedi §15.

### Fase 1 — Fondamenta (1-2 settimane, senza IT)

- [ ] Verificare accesso a `copilotstudio.microsoft.com` con account Accenture
- [ ] Verificare accesso a `make.powerapps.com` (default environment)
- [ ] Creare sito SharePoint "Billy Catalog" con struttura libraries + colonne custom
- [ ] Creare il primo agente Copilot Studio con GitHub Copilot harness e istruzioni base
- [ ] Verificare che l'agente risponda correttamente con knowledge source vuoto

### Fase 2 — Skill e RAG (1-2 settimane)

- [ ] Creare library "Skill Index" su SharePoint con colonne Title + Description (NO Content)
- [ ] Creare library "Skill Content" con colonna Content
- [ ] Importare le 22 skill dal JSON di export (script Node.js → Graph API)
- [ ] Collegare "Skill Index" come knowledge source all'agente
- [ ] Creare Power Automate flow `LoadSkill`
- [ ] Configurare `LoadSkill` come action nell'agente
- [ ] Testare: chiedere a Billy di una skill specifica → deve chiamare LoadSkill → rispondere con il corpo

### Fase 3 — Documenti e RAG certificato (1 settimana)

- [ ] Creare library "Certified Documents"
- [ ] Creare library "Community Documents"
- [ ] Importare documenti dal JSON di export nelle libraries appropriate
- [ ] Collegare entrambe le libraries come knowledge sources
- [ ] Testare: domanda su documento certificato → risposta con fonte certificata
- [ ] Testare: domanda su documento community → risposta con avviso community

### Fase 4 — Workflow catalogo (1-2 settimane)

- [ ] Creare Power Automate approval flow (vedi §10)
- [ ] Creare Power Apps canvas: wizard upload (form con tutti i metadati)
- [ ] Creare Power Apps canvas: catalogo navigabile (filtri per tipo, certificazione, status)
- [ ] Creare Power Apps canvas: review queue (vista filtrata su Status="in-review")
- [ ] Embedded Power App in Teams come tab
- [ ] Testare: upload asset → notifica approvazione in Teams → approvazione inline → pubblicazione

### Fase 5 — Sub-agenti e MCP (1 settimana)

- [ ] Creare il primo Connected Agent (es. specializzato su un dominio specifico)
- [ ] Configurare `RunSubAgent` come action nel Billy principale
- [ ] Testare delega: domanda specifica → Billy principale delega → sotto-agente risponde
- [ ] Testare MCP: configurare un connettore MCP esterno (se disponibile un server MCP)

### Fase 6 — Testing e go-live (1 settimana)

- [ ] Testing manuale con i 35 casi del benchmark (adattati al nuovo endpoint)
- [ ] Confronto qualitativo con Billy su BTP
- [ ] Invitare altri utenti al bot per testing esteso
- [ ] Raccogliere feedback
- [ ] Decisione go-live → BTP shutdown

---

## 15. Export dati da BTP

### Query SQL per export skill da HANA

```sql
-- Export tutte le skill con metadati
SELECT 
  s.ID,
  s.title,
  s.description,
  s.body AS content,
  s.certificationLevel,
  s.status,
  s.createdBy AS owner,
  s.createdAt,
  s.modifiedAt
FROM billyCatalog_Skills s
WHERE s.status != 'deprecated'
ORDER BY s.certificationLevel, s.title;
```

### Query SQL per export documenti (chunk + metadati)

```sql
-- Export chunk documenti con embedding
SELECT 
  d.ID,
  d.documentId,
  d.title,
  d.chunkText,
  d.chunkIndex,
  d.certificationLevel,
  d.status,
  d.createdBy AS owner,
  d.createdAt
FROM billyCatalog_DocumentChunks d
WHERE d.status = 'published'
ORDER BY d.documentId, d.chunkIndex;
```

### Script Node.js export

```js
// exports/export-hana.js
const cds = require('@sap/cds');
const fs = require('fs');

async function exportAll() {
  await cds.connect.to('db');
  
  const skills = await cds.run(
    SELECT.from('billyCatalog.Skills')
      .where({ status: { '!=': 'deprecated' } })
  );
  
  const docs = await cds.run(
    SELECT.from('billyCatalog.DocumentChunks')
      .where({ status: 'published' })
      .orderBy('documentId', 'chunkIndex')
  );
  
  const timestamp = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(`exports/${timestamp}`, { recursive: true });
  
  fs.writeFileSync(
    `exports/${timestamp}/skills.json`,
    JSON.stringify(skills, null, 2)
  );
  fs.writeFileSync(
    `exports/${timestamp}/documents.json`,
    JSON.stringify(docs, null, 2)
  );
  
  console.log(`Exported ${skills.length} skills, ${docs.length} document chunks`);
  console.log(`Saved to exports/${timestamp}/`);
}

exportAll().catch(console.error);
```

### Script Node.js import su SharePoint via Graph API

```js
// imports/import-to-sharepoint.js
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');
const { ClientSecretCredential } = require('@azure/identity');
const skills = require('./exports/AAAA-MM-GG/skills.json');

// Credenziali app registrata in Entra ID (una tantum, fatta dall'admin IT)
const credential = new ClientSecretCredential(
  process.env.TENANT_ID,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

const client = Client.initWithMiddleware({
  authProvider: new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  })
});

const SITE_ID = process.env.SHAREPOINT_SITE_ID;
const SKILL_INDEX_LIST_ID = process.env.SKILL_INDEX_LIST_ID;
const SKILL_CONTENT_LIST_ID = process.env.SKILL_CONTENT_LIST_ID;

async function importSkills() {
  for (const skill of skills) {
    // Crea item in Skill Index (solo Title + Description)
    await client.api(`/sites/${SITE_ID}/lists/${SKILL_INDEX_LIST_ID}/items`).post({
      fields: {
        Title: skill.title,
        Description: skill.description,
        CertificationLevel: skill.certificationLevel,
        Status: skill.status,
        Owner: skill.owner
      }
    });
    
    // Crea item in Skill Content (corpo completo)
    await client.api(`/sites/${SITE_ID}/lists/${SKILL_CONTENT_LIST_ID}/items`).post({
      fields: {
        Title: skill.title,
        Content: skill.content,
        CertificationLevel: skill.certificationLevel
      }
    });
    
    console.log(`Imported skill: ${skill.title}`);
  }
}

importSkills().catch(console.error);
```

> Nota: per lo script di import serve un app registration in Entra ID con permessi `Sites.ReadWrite.All`. Questo richiede consenso di un Global Admin Accenture — da richiedere come singola operazione una-tantum.

---

## 16. Testing e criteri di go-live

### Testing manuale (senza benchmark automatico)

I 35 casi di routing (`billy-app/test/run-35.js`) sono stati progettati per il contratto API di BTP. Sul nuovo Billy il contratto cambia (endpoint Copilot Studio, non SSE). Invece di adattare il runner, si testa manualmente.

**Procedura:**
1. Aprire Billy su Copilot Studio (Teams chat o M365 Copilot sidebar)
2. Per ciascuno dei 35 casi, fare la domanda e verificare se Billy:
   - Trova la skill corretta (o risponde da documento se non serve skill)
   - Carica il corpo della skill (verifica nei log di Copilot Studio se LoadSkill è stato chiamato)
   - Risponde in modo pertinente

**Soglia accettazione:**
- Almeno 28/35 — uguale al punteggio LangGraph su BTP
- I casi 7, 10, 11, 12, 13, 30 (hard failures su BTP) possono ancora fallire — sono problemi di descrizione skill, non di runtime

### Log e debug in Copilot Studio

Copilot Studio ha una sezione "Activity" che mostra:
- Quali knowledge sources sono stati interrogati
- Quali actions sono state chiamate e con quali parametri
- La risposta finale
- Eventuali errori

Utile per verificare che il ciclo "scopri skill → LoadSkill → rispondi" funzioni.

---

## 17. Cosa fare ora senza IT

**Accessi già disponibili con licenza M365 Copilot:**

| Risorsa | URL | Azione |
|---|---|---|
| Copilot Studio | `copilotstudio.microsoft.com` | Verificare accesso, creare agente |
| Power Automate | `make.powerautomate.com` | Creare flows (default environment) |
| Power Apps | `make.powerapps.com` | Creare canvas app (default environment) |
| SharePoint | `accenture.sharepoint.com` | Creare sito "Billy Catalog" |

**Primo passo concreto:**
1. Aprire `copilotstudio.microsoft.com` con account Accenture
2. Verificare se l'opzione "Create agent" è disponibile
3. Se sì: siamo operativi, inizia dalla Fase 0 (backup)
4. Se no: serve un ticket IT per abilitare Copilot Studio maker nel tenant

**Limitazioni senza IT:**
- Il bot è disponibile solo per il creator e chi viene invitato manualmente (non pubblicato org-wide)
- Si usa il Default Power Platform Environment (nessun isolamento Dev/Test/Prod)
- Le API di creazione automatica agenti richiedono permessi da Power Platform admin

---

## 18. Dipendenze IT — per dopo

Da richiedere in un secondo momento, quando il prototipo è validato:

| Richiesta | Perché serve | Priorità |
|---|---|---|
| Approvazione bot Teams org-wide | Per distribuire Billy a tutti gli utenti Accenture senza invito manuale | Alta (post-POC) |
| Power Platform environment dedicato (Dev/Test/Prod) | Isolamento ambienti, governance, no shared Default env | Media |
| App Registration in Entra ID per script import | Permessi Graph API per script import da BTP | Alta (per la migrazione dati) |
| Permessi Power Platform Management API | Per creazione automatica Connected Agents da Billy | Bassa (feature avanzata) |
| Conferma billing M365 Copilot | Verificare che la licenza Accenture copra le generative answers per Copilot Studio | Immediata (da verificare) |

---

## 19. Criteri per spegnere BTP

BTP rimane attivo finché l'utente non dà conferma esplicita. I criteri suggeriti prima di comunicare quella conferma:

- [ ] Il nuovo Billy risponde correttamente ad almeno 28/35 dei casi di test manuali
- [ ] Il workflow upload → approvazione → pubblicazione funziona end-to-end
- [ ] Le 22 skill sono state importate e LoadSkill funziona su tutte
- [ ] I documenti certificati e community sono stati importati e RAG funziona
- [ ] Il bot è accessibile almeno a te e ai tester Accenture
- [ ] È stato fatto un export locale completo e verificato di tutti i dati BTP (Fase 0)

**Nota:** spegnere BTP non significa eliminare il codice. Il repo `billy-marketplace` rimane — è documentazione tecnica, il benchmark, e la storia del progetto.

---

*Documento creato novembre 2026. Aggiornare in questa cartella (`doc/copilot-studio/`) per qualsiasi nuova decisione tecnica.*
