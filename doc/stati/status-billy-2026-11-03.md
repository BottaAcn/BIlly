# Status integrazioni Billy — 3 novembre 2026

Data di ricognizione: **03/11/2026**, fuso Europe/Rome. Aggiornamento di [status-billy-2026-10-20.md](status-billy-2026-10-20.md): la struttura tecnica è invariata; questo documento certifica lo stato dopo 5 settimane di pausa, aggiunge verifiche live e aggiorna la checklist.

---

## 1. Sintesi: cosa è cambiato dal 20 ottobre

**Nulla nel codice.** L'HEAD è ancora **`0e1a182`** (28 settembre 2026). Il branch `feat/langgraph-js` non ha ricevuto commit né è stato mergiato su `dev` o `master`. Le altre sessioni Claude attive in questo periodo lavoravano su progetti diversi (AribaDocsA2A, Joule-ProCode, ticket AMS) — nessuna ha toccato billy-marketplace.

| Aspetto | 20 ottobre | 3 novembre |
|---|---|---|
| HEAD git | `0e1a182` | `0e1a182` — invariato |
| Branch | `feat/langgraph-js` | `feat/langgraph-js` — non mergiato |
| CF deployment | Storico (non verificato live) | ✅ **Verificato live oggi** |
| Modifiche locali | `doc/BIlly_Logo.png` + untracked `doc/speech/` | Identiche + `doc/stati/` non tracciato |
| Sessioni parallele su Billy | Non verificato | Nessuna (verificato via `ListAgents`) |

---

## 2. Verifiche eseguite oggi (3 novembre)

### CF live — Billy risponde

```
POST /rest/billy/askBilly
{"question":"Ciao Billy, dimmi quante skill hai nel manifesto oggi"}

→ {"answer": "Ciao! Nel manifesto disponibile oggi conto 22 skill.", ...}
```

**22 skill nel manifesto** — stesso numero del 28 settembre. Le fonti restituite erano documenti certificati (similarity ~0.32), non skill: comportamento corretto (la domanda non richiede una skill, Billy ha risposto direttamente).

Il motore in produzione è LangGraph JS (`BILLY_ENGINE=graph` default, engine `0e1a182`). La risposta arriva intera (nessun token streaming, workaround ancora attivo).

### Sessioni parallele

Interpellate le sessioni Claude attive sulla macchina. Nessuna lavora su billy-marketplace:
- `ciao sbelo, dovrò fare si che`: lavora su AribaDocsA2A (`C:\code\AribaDocsA2A`)
- `code-99`: lettura screenshot webapp SAP BTP + ticket AMS — nessun codice Billy toccato

---

## 3. Stato componenti — aggiornato al 3 novembre

La valutazione tecnica del 20 ottobre resta valida. Riepilogo compresso con stato confermato oggi.

### Integrato e attivo in produzione

| Componente | Dettaglio |
|---|---|
| LangGraph JS (`graph.js`) | `createReactAgent`, gpt-5.5 via `AzureOpenAiChatClient`, max 5 iterazioni (recursionLimit 11) |
| Tool `searchKnowledge` | RAG HANA Vector, top 3 chunk, COSINE_SIMILARITY × peso certificazione |
| Tool `loadSkill` | Manifesto 22 skill nel prompt; corpo intero (fino a 60.000 char) su chiamata |
| SSE streaming | Eventi `tool`/`result`/`answer` funzionanti; **token-by-token assente** (workaround `streaming:false`) |
| Fallback `legacy` | `BILLY_ENGINE=legacy` riattiva il tool loop di `agent.js` senza deploy |
| Billy come MCP server | `@cap-js/mcp` v1.4.3, `/mcp/catalog` + `/mcp/billy`, `askBilly` tool MCP |
| RAG documenti | Chunk 700/100 char, embedding `text-embedding-3-large` 3072 dim., pesi 1.0/0.75/0.35 |
| Storico conversazione | localStorage 200 msg / 400 KB; server accetta max 20 msg, 8.000 char/msg |

### Preparato ma scollegato dal grafo

| Componente | File | Cosa manca |
|---|---|---|
| Billy client MCP (app esterne) | `srv/lib/mcp-client.js` | `@langchain/mcp-adapters` assente da `package.json`; `graph.js` non lo importa; `externalLink` ambiguo (URL umano vs endpoint MCP) |
| Sotto-agenti | `srv/lib/subagent.js` | `graph.js` non chiama `runSubAgent`; nessun tool di delega registrato; `invoke` non fornito |
| Tipo `agent` | `db/schema.cds`, `AgentCapability` | Nessun wizard UI; nessun tool di delega nel grafo |
| WorkSession / checkpointer | Tabelle HANA create | `BaseCheckpointSaver` (5 metodi) non implementato; grafo stateless — nessun `thread_id` passato |

### Assente o solo discusso

| Funzionalità | Note |
|---|---|
| Token streaming | Bug in `@sap-ai-sdk/foundation-models` sui chunk senza `delta` — workaround attivo. Da riprovare su versione SDK più recente |
| Tipo `interface` (mini-app HTML) | Nessun serving `viewAsset/<id>/<path>`; HTML/ZIP non accettati dall'upload; rotta non scritta |
| Deploy automatico `application` | `reviewRevision` pubblica contenuto, non deploya su CF |
| Merge `feat/langgraph-js` → `dev`/`master` | Non fatto |
| Skill problematiche fix | Casi 7,10,11,12,13,30 ancora falliscono — descrizioni da riscrivere (`02-orchestratore`, `17-render-excel`) |

---

## 4. Contesto tecnico di riferimento rapido

Per i dettagli completi su parametri RAG, architettura SSE, war story bug SDK, confronto misure benchmark, vedi [status-billy-2026-10-20.md §§3-9](status-billy-2026-10-20.md). I valori non sono cambiati.

Valori chiave da avere pronti:

| Dato | Valore |
|---|---|
| HEAD / branch | `0e1a182` / `feat/langgraph-js` |
| Skill nel manifesto | **22** (verificato live oggi) |
| Benchmark routing | 27/35 legacy · 28/35 LangGraph (differenza = rumore, gpt-5.5 non deterministico) |
| Casi falliti (hard) | 7, 10, 11, 12, 13, 30 |
| RAM billy-srv CF | 1.024 MB |
| Modello LLM | gpt-5.5, resource group `team-ai-contest-3` |
| Auth | dummy (XSUAA preparata, non attiva) |
| Antivirus allegati | disattivato |

---

## 5. Checklist di ripresa — aggiornata al 3 novembre

Rispetto alla checklist del 20 ottobre, aggiunto stato e priorità suggerita. Ordine: prima ciò che sblocca le capacità più visibili senza dipendenze circolari.

### P0 — Precondizioni / igiene Git

- [ ] **Merger `feat/langgraph-js` → `dev`**: 5 settimane di lavoro principale in un branch laterale. Risolvere prima di qualunque altra modifica.
- [ ] **Verificare remoti**: `git fetch` e controllare se `origin/dev` è già avanzato rispetto al locale.

### P1 — Fix immediati a alto impatto (senza nuove architetture)

- [ ] **Riscrivere/spubblicare skill problematiche**: casi 7 (`02-orchestratore`), 10, 11, 12, 13 (problemi di routing/descrizione), 30 (`17-render-excel` — richiede Python non disponibile). Rimisurare con `node test/run-35.js --base <host-cf>` dopo. Questa è la leva più alta per migliorare le risposte.
- [ ] **Ripristinare token streaming**: verificare la versione corrente di `@sap-ai-sdk/foundation-models` in produzione; se il bug è fixato, rimuovere `streaming: false` in `graph.js` e testare fine-to-fine su CF.

### P2 — Collegare i componenti già scritti

- [ ] **MCP client (applicazioni esterne)**:
  1. Aggiungere `@langchain/mcp-adapters` alle dipendenze applicative
  2. Chiarire contratto `externalLink` (URL umano del catalogo vs endpoint MCP dell'app)
  3. Importare `mcp-client.js` in `graph.js` e registrare i tool scoperti per gli asset `application` pubblicati
  4. Testare una chiamata reale contro almeno un'applicazione esterna verificabile

- [ ] **Tipo `agent` e sotto-agenti**:
  1. Aggiungere wizard UI per creare asset di tipo `agent`
  2. Esporre un tool di delega nel grafo (`runSubAgent` con `invoke` fornito da `graph.js`)
  3. Costruire il sotto-grafo con set di tool isolato (capacità dell'agente, non tutto il manifesto)
  4. Collegare `WorkSession` / `upsertWorkSession` al grafo per lo stato persistente del lavoro

### P3 — Infrastruttura (necessaria per la SAC Design Factory e scenari multi-turno lunghi)

- [ ] **Checkpointer HANA**: implementare i 5 metodi di `BaseCheckpointSaver` (`getTuple`, `list`, `put`, `putWrites`, `getNextConfig`) usando le tabelle `WorkCheckpoint`/`WorkCheckpointWrite`. Testare ripresa da processo nuovo (non solo `MemorySaver`).

### P4 — Tipi asset ancora da definire / discutere

- [ ] **Tipo `interface` (mini-app HTML)**: decidere se è una mini-app HTML/JS ospitata da Billy (richiede rotta `viewAsset/<id>/<path>`, upload ZIP, serving inline con MIME corretto) o una descrizione di API (solo testo indicizzabile + link esterno). Sono due cose diverse: la seconda è già possibile oggi.
- [ ] **Deploy automatico `application`**: se si vuole che l'approvazione di un asset `application` triggeri un deploy su CF, serve una pipeline separata (fuori da `reviewRevision`).

### Riferimento benchmark

Prima e dopo qualunque modifica a system prompt, tool o modello:
```bash
node billy-app/test/run-35.js --base accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com
```
Baseline: 27/35 (legacy) · 28/35 (LangGraph). Un punteggio che sale con regressioni non è un miglioramento.

---

## 6. Da dove ripartire in una nuova chat

> Leggi `doc/stati/status-billy-2026-11-03.md`. HEAD `0e1a182`, branch `feat/langgraph-js`, nessun codice cambiato dal 28 settembre. CF live con 22 skill, motore LangGraph, nessun token streaming. MCP client e sotto-agenti scritti ma scollegati dal grafo. Priorità: (1) merger branch, (2) fix skill problematiche e rimisura 35 casi, (3) collegare MCP client o tipo agent secondo il caso scelto.

---

## 7. Note su questa ricognizione

- Verifiche eseguite: `git log`, `git status`, chiamata live a `/rest/billy/askBilly`, lettura di tutti i file `doc/stati/`, interrogazione sessioni Claude parallele via `ListAgents` + `SendMessage`.
- Non eseguite: deploy, nuovi benchmark AI, modifica al runtime, lettura delle chat ChatGPT precedenti.
- Limite: l'ambiente CF è raggiungibile e risponde, ma lo schema HANA deployato, le variabili d'ambiente e il contenuto esatto del catalogo non sono stati verificati oltre la risposta di askBilly.
