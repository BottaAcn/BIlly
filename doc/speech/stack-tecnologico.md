# Billy — stack tecnologico: cosa è SAP e cosa no

Documento di supporto alla presentazione ([discorsi-billy-v3-tecnico.md](discorsi-billy-v3-tecnico.md)): serve a rispondere in modo preciso alla domanda *"e questo com'è fatto?"*.

Tutto ciò che segue è ricavato dai file reali del repository (`package.json`, `mta.yaml`, `db/schema.cds`, `srv/`), non dalla documentazione di progetto. Versione aggiornata alla migrazione LangGraph JS (settembre 2026).

---

## La risposta in una frase

> **Il cuore di Billy è per la maggior parte SAP**: piattaforma, database, motore vettoriale, modelli AI, protocolli di integrazione e hosting sono tutti servizi SAP BTP. **Il ciclo agentico usa ora LangGraph JS** come orchestratore — tre nuove dipendenze — mentre le uniche dipendenze non-AI restano le quattro librerie per leggere PDF, Word e PowerPoint.

---

## 1. Tabella principale — tecnologia per ogni aspetto

Legenda colonna "Natura": 🟦 **SAP** · 🟧 **Open source (AI ecosystem)** · ⬜ **Esterna / utility** · 🟩 **Scritta da noi**

| Aspetto / logica | Tecnologia adottata | Natura | Note |
|---|---|---|---|
| **Framework applicativo backend** | SAP CAP — `@sap/cds` 10.1.0, Node.js 22 | 🟦 SAP | Definisce servizi, modello dati, protocolli. Ossatura di tutto il backend |
| **Database** | SAP HANA Cloud (HDI container) — `@cap-js/hana` 3.0.2 | 🟦 SAP | Un solo database per catalogo, utenti, contenuti e vettori |
| **Database di sviluppo locale** | SQLite — `@cap-js/sqlite` 3.0.2 | 🟦 SAP | Plugin CAP ufficiale, solo in locale |
| **Ricerca semantica / RAG** | Vector Engine di SAP HANA Cloud — colonna `Vector(3072)`, `COSINE_SIMILARITY` + `TO_REAL_VECTOR` | 🟦 SAP | Nessun database vettoriale esterno (niente Pinecone, Weaviate, Chroma) |
| **Generazione embedding** | `text-embedding-3-large` (3.072 dimensioni) via SAP AI Core — `@sap-ai-sdk/foundation-models` 2.15 | 🟦 SAP | Consumato attraverso il Generative AI Hub SAP |
| **Modello linguistico (LLM)** | `gpt-5.5` via SAP AI Core — `@sap-ai-sdk/langchain` 2.16.0 (`AzureOpenAiChatClient`) | 🟦 SAP | Reasoning model Azure OpenAI, deployato nel resource group `team-ai-contest-3`. Sostituisce Claude via Orchestration perché l'Orchestration Service fissa i tool alla costruzione del client |
| **Framework agentico** | LangGraph JS — `@langchain/langgraph` 1.4.18 + `@langchain/core` | 🟧 Open source | `createReactAgent`, ciclo modello→tool automatico. Sostituisce il tool loop scritto a mano (rimasto come fallback `BILLY_ENGINE=legacy`) |
| **Selettore del motore** | `srv/lib/engine.js` — flag `BILLY_ENGINE=graph\|legacy` | 🟩 nostro | Fallback automatico su agent.js se graph.js non carica. I due motori espongono la stessa firma `runAgent` |
| **Strumenti dell'agente** | `searchKnowledge` (RAG sul catalogo) e `loadSkill` (carica ed esegue una skill certificata) | 🟩 nostro | Definiti come LangChain `tool()` con schema JSON; corpo richiama le stesse funzioni SQL di agent.js |
| **Ciclo di ragionamento** | `createReactAgent` di LangGraph con `recursionLimit = MAX_ITERATIONS * 2 + 1` | 🟧 + 🟩 | Logica di stop (iterazioni, abort, guasto transitorio) scritta da noi in `graph.js` |
| **Streaming delle risposte** | Server-Sent Events + `agent.streamEvents({}, {version:'v2'})` di LangGraph | 🟧 + 🟩 | Evento `on_tool_start/end` → evento SSE `tool/result`; `on_chat_model_end` → `answer`. Nota: il modello è creato con `streaming:false` a causa di un bug in `@sap-ai-sdk/foundation-models` sui chunk finali |
| **MCP client (applicazioni esterne)** | `@langchain/mcp-adapters` 1.1.4 — `srv/lib/mcp-client.js` | 🟧 + 🟩 | Discovery tool a runtime da `Asset.externalLink`, cache 5 min. Anti-tool-poisoning: risultati avvolti in delimitatori `<<<MCP_RESULT>>>` |
| **Sotto-agenti (tipo `agent`)** | `srv/lib/subagent.js` + `WorkSession` su HANA | 🟩 nostro | Asset di tipo `agent` = prompt + lista di skill/applicazioni. Invocabili come sotto-agente con set di strumenti isolato |
| **Chunking dei documenti** | Finestre da 700 caratteri, 100 di sovrapposizione — `srv/lib/chunking.js` | 🟩 nostro | ~20 righe, zero dipendenze. Skill e agenti esclusi dal chunking |
| **Pesatura per certificazione** | `COSINE_SIMILARITY * peso` in SQL: certificato ×1.0, scaduto ×0.75, community ×0.35, deprecato escluso | 🟩 nostro | È la logica di fiducia di Billy; nessun prodotto la fornisce |
| **Caricamento progressivo delle skill** | Manifesto (titolo+descrizione) nel system prompt; corpo intero via `loadSkill` | 🟩 nostro | ~22 skill = ~2.000 token di manifesto; corpo fino a 60.000 caratteri caricato solo se servono |
| **Archiviazione file** | BLOB dentro SAP HANA — `@cap-js/attachments` 4.0.0, `kind: "db"` | 🟦 SAP | Object Store non usato: scelta deliberata |
| **Estrazione testo da PDF** | `pdf-parse` 2.4.5 | ⬜ Esterna | |
| **Estrazione testo da Word** | `mammoth` 1.12.2 | ⬜ Esterna | |
| **Estrazione testo da PowerPoint** | `officeparser` 7.8.0 | ⬜ Esterna | |
| **Esposizione MCP (Billy come server)** | `@cap-js/mcp` 1.4.3 — `/mcp/catalog` e `/mcp/billy` | 🟦 SAP | Billy è consumabile da dentro altri assistenti AI |
| **Frontend** | Web Components nativi + ES modules | 🟩 nostro | Nessun framework, nessun bundler, nessuno step di build |
| **Memoria conversazione nel browser** | `localStorage` — chiave `billy-chat-history`, max 200 messaggi / 400 KB | 🟩 nostro | Persistenza tra sessioni; al server vanno solo gli ultimi 16 messaggi |
| **Rendering Markdown in chat** | `marked` (CDN pubblico) | ⬜ Esterna | Unica dipendenza runtime non versionata |
| **Font** | Inter + JetBrains Mono (Google Fonts) | ⬜ Esterna | Puramente estetica |
| **Hosting frontend** | SAP HTML5 Application Repository (`app-host` + `app-runtime`) | 🟦 SAP | |
| **Reverse proxy** | SAP Application Router — `@sap/approuter` 19 | 🟦 SAP | |
| **Collegamento frontend ↔ backend** | SAP BTP Destination Service (`lite`) | 🟦 SAP | |
| **Deploy** | SAP MTA — `mta.yaml`, `mbt build`, `cf deploy` | 🟦 SAP | 4 moduli. `billy-srv`: 1024 MB RAM (era 256; l'albero LangChain pesa ~90 MB extra) |
| **Build zip frontend** | `jszip` 3.10.1 | ⬜ Esterna | Solo build |
| **Log** | SAP Application Logging (`lite`) | 🟦 SAP | Rilevato automaticamente da CAP |
| **Autenticazione** | SAP XSUAA — `xs-security.json` pronto, risorsa MTA **commentata** | 🟦 SAP | ⚠️ Non ancora attiva (ultimo passo previsto) |
| **Scadenza certificazioni** | Timer in-process ogni 6 ore (`setInterval`) | 🟩 nostro | Ripiego dichiarato; un vero SAP Job Scheduling service è fuori scope |

---

## 2. Riepilogo dipendenze

### Pacchetti SAP (8)

| Pacchetto | Versione | A cosa serve |
|---|---|---|
| `@sap/cds` | 10.1.0 | Framework CAP |
| `@cap-js/hana` | 3.0.2 | HANA Cloud |
| `@cap-js/sqlite` | 3.0.2 | DB locale |
| `@cap-js/attachments` | 4.0.0 | Allegati BLOB |
| `@cap-js/mcp` | 1.4.3 | MCP server |
| `@sap-ai-sdk/foundation-models` | 2.15 | Embedding |
| `@sap-ai-sdk/langchain` | 2.16.0 | LLM gpt-5.5 via LangChain |
| `@sap/approuter` | 19 | Application Router |

### Pacchetti AI ecosystem — nuovi con LangGraph (3)

| Pacchetto | Versione | A cosa serve |
|---|---|---|
| `@langchain/langgraph` | 1.4.18 | Framework agentico |
| `@langchain/core` | (transitiva) | Primitivi LangChain (tool, message, stream) |
| `@langchain/mcp-adapters` | 1.1.4 | Bridge LangChain ↔ MCP client |

### Dipendenze esterne utility (6, di cui 3 solo per aprire file)

| Dipendenza | Versione | Quando |
|---|---|---|
| `pdf-parse` | 2.4.5 | Runtime |
| `mammoth` | 1.12.2 | Runtime |
| `officeparser` | 7.8.0 | Runtime |
| `jszip` | 3.10.1 | Solo build |
| `marked` | non fissata (CDN) | Runtime, browser |
| Google Fonts | — | Runtime, browser |

> **Come dirlo a voce:** *"Il cuore è SAP. Per l'orchestrazione agentica usiamo LangGraph JS — tre pacchetti open source. Per leggere PDF, Word e PowerPoint tre librerie di utilità. Tutto il resto è piattaforma SAP."*

---

## 3. Servizi SAP BTP effettivamente in uso

| Servizio | Piano | Stato |
|---|---|---|
| SAP HANA Cloud (HDI container) | — | ✅ Attivo |
| SAP AI Core / Generative AI Hub | — | ✅ Attivo (`gpt-5.5` + `text-embedding-3-large`) |
| SAP HTML5 Application Repository | `app-host` + `app-runtime` | ✅ Attivo |
| SAP Destination Service | `lite` | ✅ Attivo |
| SAP Application Logging | `lite` | ✅ Attivo |
| SAP XSUAA | `application` | ⚠️ Preparato, disattivato |
| SAP Malware Scanning | — | ❌ Non attivato |
| SAP Object Store | — | ❌ Non usato (allegati su HANA) |
| SAP Job Scheduling | — | ❌ Non usato (timer in-process) |

---

## 4. Cosa abbiamo valutato e deliberatamente NON usato

| Alternativa | Perché scartata |
|---|---|
| **Database vettoriale esterno** | HANA Cloud ha già il motore vettoriale: i vettori stanno accanto ai dati di business, con chiave esterna verso l'asset |
| **SAP AI Core Document Grounding** | Non permette di ricondurre ogni risposta alla riga esatta del catalogo; la pesatura per certificazione è logica nostra che nessun retrieval generico conosce |
| **SAP Object Store** | Un servizio in più; i file BLOB su HANA bastano |
| **React / Angular / Vue** | Zero build, zero bundler, zero dipendenze: Web Components nativi |
| **Orchestration Service per il tool calling** | Fissa i `tool` alla costruzione del client e non supporta `tool_choice` per-richiesta — è il motivo principale per passare a `AzureOpenAiChatClient` + LangGraph |
| **Tool loop scritto a mano (agent.js)** | Rimasto come fallback `BILLY_ENGINE=legacy`; sostituito da LangGraph per: `bindTools` dinamico, checkpointer persistente, sotto-agenti con set di strumenti isolati |
| **Claude come LLM principale** | Non raggiungibile da Node.js via `@sap-ai-sdk/langchain` (il bridge Bedrock esiste solo in Python). `gpt-5.5` è deployato nel resource group e supporta tool calling streaming |
| **Più modelli LLM con routing** | Un solo modello, sempre: più semplice da ragionare, testare e spiegare |

---

## 5. Architettura del motore agentico (LangGraph)

```
domanda utente
      │
      ▼
engine.js  ──── BILLY_ENGINE=graph ──▶  graph.js (createReactAgent)
               BILLY_ENGINE=legacy ──▶  agent.js (tool loop a mano)
                    ↕ stessa firma runAgent({question, history, onEvent, signal})
                    ↕ stesso contratto eventi SSE (tool/result/delta/answer/error)

graph.js:
  createReactAgent({
    llm: AzureOpenAiChatClient(gpt-5.5, streaming:false),  ← bug SDK workaround
    tools: [searchKnowledge, loadSkill],
    prompt: buildSystemPrompt(skills)   ← stesso di agent.js, non riscritto
  })
  agent.streamEvents({messages}, {version:'v2'})
    on_tool_start  →  emit({type:'tool',   name, args})
    on_tool_end    →  emit({type:'result', name, ok, summary})
    on_chat_model_end → emit({type:'answer', answer, sources})
```

---

## 6. Numeri utili da citare

| Dato | Valore |
|---|---|
| Dimensioni vettori | 3.072 |
| Dimensione chunk | 700 caratteri, 100 di sovrapposizione |
| Fonti recuperate per domanda | le 3 più pertinenti |
| Iterazioni massime agente | 5 (= `recursionLimit` 11 passi LangGraph) |
| Memoria conversazione (server) | ultimi 20 messaggi |
| Memoria conversazione (browser) | ultimi 200 messaggi / 400 KB (`localStorage`) |
| Messaggi inviati al modello per turno | ultimi 16 |
| Dimensione massima file caricabile | 10 MB |
| Formati accettati | PDF, DOCX, PPTX, TXT |
| RAM `billy-srv` su CF | 1.024 MB (era 256; +768 per LangGraph) |
| Moduli MTA | 4 |
| Pacchetti SAP / AI ecosystem / utility | 8 / 3 / 6 |
| Benchmark routing (35 casi) | 27/35 legacy · 28/35 LangGraph (differenza = rumore) |

---

## 7. Il benchmark dei 35 casi

Il routing delle skill si misura con `billy-app/test/run-35.js` — 35 domande verbatim con la skill attesa, eseguito prima e dopo qualunque modifica al system prompt, ai tool o al modello.

```bash
node test/run-35.js --base <host-cf>
node test/run-35.js --base <host> --only 7,10,11-13
```

**Risultato chiave**: cambiare framework (LangGraph vs loop a mano) o modello non sposta significativamente l'accuratezza. I 6 fallimenti duri (casi 7, 10, 11, 12, 13, 30) sono identici in tutte le configurazioni: il problema è nelle descrizioni delle skill, non nel runtime.

---

## 8. Debiti tecnici dichiarati

| Debito | Stato |
|---|---|
| **Autenticazione XSUAA** | Configurazione pronta, non attiva. Scelta esplicita (ultimo passo) |
| **Scadenza certificazioni** | Timer in-process; con più istanze CF gira più volte |
| **Scansione antivirus** | Simulata, non reale |
| **`marked` da CDN senza versione** | Non riproducibile; da fissare |
| **Streaming token-by-token** | Disabilitato (bug `@sap-ai-sdk/foundation-models` su chunk finale); la risposta arriva intera invece che carattere per carattere |
| **Checkpointer HANA** | Tabelle create, logica `BaseCheckpointSaver` non ancora implementata |
| **Tipo `interface` e `application`** | Decisi nell'architettura, non ancora implementati nel wizard di caricamento |
