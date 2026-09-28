# Billy: CAP, ibrido o LangGraph — confronto con i numeri

Analisi del 28/09/2026. Misure prese su `C:\code\billy-marketplace` (commit `1db5f33`) e
su `C:\code\Joule-ProCode` (progetto LangGraph in produzione dello stesso utente).
Le verifiche su librerie e versioni sono state fatte sulla documentazione e sui registry
(npm / PyPI) alla data di oggi, non a memoria.

---

## 1. Raccomandazione in cinque righe

**Nessuna delle tre. La strada giusta è una quarta: LangGraph *in JavaScript*, come libreria
dentro il processo CAP che già esiste.** `@langchain/langgraph` 1.4.18, `deepagents` 1.14.1 e
`@langchain/mcp-adapters` 1.1.4 esistono, sono mantenuti, e — dato controintuitivo — il pacchetto
deep-agents JS è a **1.14** mentre quello Python è a **0.7.19 in beta**. Si ottengono sotto-agenti,
filesystem virtuale, planning, checkpointer e client MCP **senza un secondo deploy, senza un
secondo runtime, senza riscrivere nulla del marketplace**. Il motivo principale è il rapporto
misurato: **il loop agentico è 363 righe su ~5.930, cioè il 6,1% del codice**; le strade B e C
spostano o riscrivono il 94% per migliorare il 6%.

---

## 2. I numeri

### 2.1 Massa di codice di Billy per area

Misurato su `billy-app`, esclusi `node_modules`, `gen/`, `mta_archives`, `package-lock.json`
e la cartella `reference/`.

| Area | Dove | Righe | % |
|---|---|---:|---:|
| **Frontend** (JS + CSS + HTML) | `app/` | **4.021** | 67,8% |
| **Dominio marketplace** | `db/schema.cds` 124, `srv/catalog-service.cds` 117, `srv/catalog-service.js` ~370 | **611** | 10,3% |
| **Config / deploy** | `mta.yaml` 159, `package.json` 63, `xs-security.json` 28, `router/` 35, `scripts/` 229, `db/undeploy.json` 3 | **517** | 8,7% |
| **Loop agentico** | `srv/lib/agent.js` | **363** | **6,1%** |
| **RAG** | `srv/lib/ai.js` 46, `chunking.js` 19, `text-extraction.js` 67, ~66 dentro `catalog-service.js` | **198** | 3,3% |
| **SSE (backend)** | `srv/server.js` | **99** | 1,7% |
| **Esposizione Billy** | `srv/billy-service.cds` 40, `srv/billy-service.js` 17 | **57** | 1,0% |
| **Altro** | `srv/lib/default-player.js` 42, eslint config | ~64 | 1,1% |
| **Totale** | | **~5.930** | 100% |

Dentro queste cifre, due sotto-numeri che contano più del totale:

- **Il server MCP (Fase 7) è 23 righe di codice reale.** `git show --stat ff5554a`:
  `package.json` +5, `billy-service.cds` +7, `catalog-service.cds` +11. Con quelle 23 righe
  sono esposti come tool MCP **12 action/function** (11 di `CatalogService` + `askBilly`),
  grazie a `cds.mcp.per_action_tool`. Sono **~2 righe per tool**.
- **Il consumo SSE lato frontend è ~59 righe** (`app/js/api.js`, `askBillyStream`) ed è
  **agnostico rispetto al backend**: POST JSON su `/rest/billy/askBillyStream`, eventi
  tipizzati `tool` / `result` / `delta` / `answer` / `error`. Qualunque backend che
  riemetta quella forma lo riusa intatto.

**Il rapporto agente/applicazione è quindi 6,1%.** Anche contando tutto ciò che è
"superficie agentica" (loop + SSE + servizio Billy) si arriva a 519 righe, **8,8%**.
La stima di 354 righe era giusta; il denominatore è ~5.930.

### 2.2 Joule-ProCode, per confronto

| Area | Righe |
|---|---:|
| `app/*.py` + `app/nodes/` + `app/prompts/`, **escluso** `test_graph_offline.py` | **12.345** |
| di cui `app/nodes/` (prepare, compute, format, render, plan, numbers) | 6.501 |
| di cui `app/graph.py` | 1.422 |
| di cui `app/datasphere_tools.py` — **adapter verso CAP** | **1.143** |
| di cui `app/prompts/` | 1.684 |
| di cui `app/telemetry.py` | 530 |
| `service.cds` — l'app **CAP separata** che espone i dati | 819 (23 action) |
| `app/test_graph_offline.py` | 8.531 |

**LangGraph non ha ridotto il codice: l'ha moltiplicato.** Il progetto LangGraph in
produzione dello stesso utente è 12.345 righe di Python. Billy intero è 5.930.

### 2.3 Riusa / butta, per strada

Legenda: ✅ riusato intatto · ⚠️ riusato con lavoro · ❌ da riscrivere

| Asset esistente | Righe | A (status quo) | B (ibrido) | C (riscrittura) | **D (LangGraph.js)** |
|---|---:|:--:|:--:|:--:|:--:|
| Frontend | 4.021 | ✅ | ✅ | ⚠️ `api.js` + 3 view | ✅ |
| Dominio marketplace (schema + 11 action) | 611 | ✅ | ✅ | ❌ | ✅ |
| RAG (Vector 3072 + COSINE_SIMILARITY pesata) | 198 | ✅ | ⚠️ diventa remoto | ❌ | ✅ |
| Loop agentico `agent.js` | 363 | ⚠️ da estendere | ❌ | ❌ | ❌ (sostituito da libreria) |
| SSE backend `server.js` | 99 | ✅ | ❌ (rifatto in Python, più corto) | ❌ (idem) | ✅ |
| SSE frontend `api.js` | 59 | ✅ | ✅ | ✅ | ✅ |
| **Server MCP (Fase 7)** | **23** | ✅ | ✅ **interamente** | ❌ | ✅ |
| `@cap-js/attachments` (BLOB su HANA) | 7 di config | ✅ | ✅ | ❌ nessun equivalente Python | ✅ |
| HDI + migrazioni automatiche | `mta.yaml` | ✅ | ✅ | ❌ | ✅ |
| XSUAA dichiarativo (Fase 8, da fare) | — | ✅ nativo | ⚠️ doppio: CAP + Python | ❌ `sap-xssec` a mano | ✅ nativo |
| **Totale da riscrivere** | | **~363** | **~500** | **~5.400** | **~460** |

---

## 3. Cosa insegna Joule-ProCode

**È già la strada B, in produzione.** E il confine è documentato nero su bianco nel suo README.

**Dove passa la linea:**

- **Di là (CAP, app separata su CF):** tutta la connessione a Datasphere, le destination,
  le 23 action di `service.cds`. Il CAP è ridotto a **API proxy** — una sola entità,
  23 action, zero persistenza propria.
- **Di qua (Python su CF, `python_buildpack`, `manifest.yaml` da 30 righe,
  `Procfile` con `uvicorn app:app`):** grafo LangGraph, prompt, telemetria, rendering.
- **Come si attraversa:** `httpx` POST su `/odata/v4/datasphere-query/<action>`, token
  OAuth **client-credentials cacheato** (`app/security.py`, 83 righe), pool da 20
  connessioni, retry sui timeout, timeout 60s.

**Tre lezioni misurabili, e tutte e tre pesano sulla decisione:**

1. **Il confine costa 1.143 righe di adapter scritto a mano.** 23 action CAP →
   23 `@tool` + 22 schemi Pydantic in `datasphere_tools.py`. Sono **~50 righe per tool**.
   Billy con `@cap-js/mcp` fa lo stesso lavoro a **~2 righe per tool**. Questa è la cosa
   più preziosa emersa dall'analisi: **Fase 7 ha già azzerato il costo che Joule paga a
   mano, ed è costata 23 righe.** Joule **non usa MCP** — zero occorrenze nel codice.

2. **Lo stato "persistente" di LangGraph in produzione non persiste.** `app/agent.py:22` e
   `app/graph.py:66` usano entrambi `MemorySaver()`, il checkpointer in-memory. Il
   `contextId` A2A fa da `thread_id`, ma lo stato muore al restart dell'app e non è
   condiviso fra istanze CF. **Il beneficio "stato fra turni" che si attribuisce a
   LangGraph, nel progetto reale dell'utente, non c'è.** E non è pigrizia: non esiste un
   checkpointer HANA ufficiale (solo uno community Python, `langgraph-checkpoint-hana`,
   un solo maintainer, non endorsed; in JS non esiste affatto).

3. **L'identità dell'utente non attraversa il confine.** Dal README: *"calls the CAP
   application with a cached OAuth client-credentials token; it does not propagate the
   bearer token from the incoming A2A request."* Per Joule è accettabile. **Per Billy no:**
   `Player`, punti, `isCertifier`, `isAdmin`, la coda di revisione — tutto il dominio è
   per-utente, e Fase 8 (XSUAA) esiste proprio per questo.

**Streaming e MCP in Joule:** usa `graph.astream(stream_mode="values"/"updates")` incapsulato
nell'A2A SDK (`sse-starlette` arriva come dipendenza transitiva di `a2a-sdk`, non usato
direttamente). Non ha frontend proprio — il client è Joule di SAP. **Non ha nessun client MCP.**

---

## 4. Le quattro strade

### Strada A — tutto a mano dentro `agent.js`

| Primitiva | Cosa dà LangGraph | Cosa costa a mano in CAP | gg |
|---|---|---|---:|
| Stato fra turni | checkpointer — ma su HANA non ne esiste uno ufficiale, e in Joule si usa `MemorySaver` (non persiste) | entità `AgentThread` + LargeString JSON, letta/scritta in `runAgent`. CAP **ha già** la persistenza che a LangGraph manca | 1-2 |
| Sotto-agenti | tool `task` di deepagents, contesto isolato | `runSubAgent` = ricorsione su `runAgent` con prompt e sottoinsieme di tool + budget iterazioni | 2-3 |
| Filesystem virtuale | `ls/read_file/write_file/edit_file/glob/grep` | 5-6 tool su un'entità; Billy ha già `Asset` + `Chunk` + attachments come store | 2-3 |
| Planning / todo | `write_todos` | 1 tool + stato | 1 |
| Streaming | `stream_mode: "messages"` + ~30 righe di glue | **già fatto**, 99 + 59 righe | 0 |
| Categoria asset `agent` | niente di pronto | enum + `loadAgent` + manifesto — **lavoro di dominio, uguale in tutte le strade** | 3-5 |
| **Totale** | | | **9-14** |

**Rischio: qualità.** Sono ~500 righe in più di runtime agentico proprietario da mantenere
per sempre, senza i test, la community e le regressioni fixate a monte di una libreria.
Il tool loop scritto a mano è la parte più fragile di un agente (retry, parallelismo delle
tool call, troncamento del contesto, interrupt): `agent.js` oggi gestisce già più tool call
per turno e gli errori dei tool, ma non ha interrupt né compattazione del contesto.

### Strada B — ibrido CAP + Python

**Costo di costruzione: 9-15 gg.**

- App Python su CF (buildpack, `manifest.yaml`, `Procfile`): **1 gg** — Joule è la prova, sono 30 righe.
- Client MCP verso `/mcp/catalog` e `/mcp/billy`: **1-2 gg**. Con `langchain[mcp]` (il vecchio
  `langchain-mcp-adapters` è **archiviato dal 17/09/2026**, confluito in `langchain.mcp`)
  i tool si generano da `tools/list`: **~10 righe contro le 1.143 di Joule.**
- Auth client-credentials verso CAP: **1 gg** (copiare `security.py`).
- Grafo + `deepagents` (0.7.19, **beta**) + checkpointer: **3-6 gg**. Il checkpointer è il
  punto dolente — o `MemorySaver` (non persiste), o il community HANA (un maintainer),
  o 5 coppie di metodi `BaseCheckpointSaver` da scrivere (300-600 righe).
- Endpoint SSE + destination nell'approuter verso il nuovo host: **2-3 gg**.
- XSUAA doppio (CAP + validazione `sap-xssec` lato Python, senza middleware né filtri
  instance-based): **+3-5 gg in Fase 8.**

**Costo ricorrente, che è la parte che si sottovaluta:**

- Due deploy, due alberi di dipendenze (npm + pip), due binding ad AI Core, due set di log.
- **Ogni chiamata a `searchKnowledge` attraversa il confine.** Oggi è una `SELECT` in-process
  sul pool HANA di CAP: ~10-50 ms. In B diventa Python → HTTPS → approuter/token → CAP →
  HANA → JSON → Python: +100-300 ms per chiamata, più la serializzazione del testo dei chunk.
  Con `MAX_ITERATIONS = 5` e 1-3 tool call per giro sono **3-10 attraversamenti per singola
  domanda utente**. In Joule questo costo è visibile nel codice: `_post_with_retry`, pool
  `httpx` da 20 connessioni, timeout 60s — infrastruttura che esiste **solo** perché c'è il confine.
- Il JWT dell'utente va propagato (Joule non lo fa), altrimenti tutto il dominio per-utente
  di Billy collassa su un utente tecnico.

**Dove metterei il confine, se si scegliesse B:** di qua (CAP) **tutto ciò che tocca il
database o l'identità** — entità, ciclo di vita, allegati, punteggi, embedding e query
vettoriale, XSUAA; di là (Python) **solo ciò che è stato di conversazione** — il grafo,
i prompt, la scelta dei tool, i sotto-agenti. Nessuna tabella, nessun file, nessun segreto
sul lato Python. `askBilly` resta in CAP come tool MCP per le domande semplici e per gli
altri consumatori MCP.

### Strada C — riscrittura totale in Python

| Cosa si butta | Oggi | Cosa la sostituisce | gg |
|---|---|---|---:|
| `schema.cds` + HDI + migrazioni automatiche (la colonna `content` è passata da sola come `ALTER TABLE`) | 124 righe CDS | `hdbcli` + SQLAlchemy/Alembic, oppure DDL a mano. **Nota: `@sap/hdi-deploy` è Node — o si tiene un modulo Node nel deploy, o si abbandona HDI** | 5-8 |
| `catalog-service` (11 action + `askBilly`, revisioni, punteggi, certificazioni, scadenze) | 553 righe CDS+JS | FastAPI + Pydantic + query a mano. Nessun ORM Python dà composizioni, CQL e handler dichiarativi | 8-12 |
| `@cap-js/attachments` (BLOB su HANA, upload/download in streaming, hook di scan, Hybrid LOB) | 7 righe di config | **Nessun equivalente.** Tabella + endpoint + streaming + gestione MIME a mano | 4-6 |
| RAG | 198 righe | **`langchain-hana` 1.2.0 esiste ed è mantenuto da SAP** (`HanaDB`, COSINE_SIMILARITY, `HanaInternalEmbeddings`). Il ranking pesato per certificazione resta SQL custom. **Il pezzo meno costoso** | 2-3 |
| **Server MCP (Fase 7)** | **23 righe** | FastMCP: **ogni tool a mano**, funzione decorata con type hints. Nulla genera tool MCP da uno schema DB in Python. La via `FastMCP.from_openapi()` esiste — ma l'OpenAPI lo generava CAP | 3-5 |
| SSE | 99 righe | `sse-starlette`: ~30 righe. **Unico punto in cui C guadagna** | −0,5 |
| Frontend | 4.021 righe | Sopravvive solo replicando esattamente URL e payload di `/rest/...`; altrimenti `api.js` + 3 view | 3-5 |
| Deploy (MTA, approuter, HTML5 repo, destination, HDI) | `mta.yaml` 159 | `manifest.yaml` Python + approuter (**resta Node**) + HTML5 repo (**resta**) + HDI deployer (**resta Node**). **Il Node non sparisce comunque** | 3-5 |
| XSUAA (Fase 8) | `@requires` / `@restrict` dichiarativi, filtri instance-based nel SQL generato | `sap-xssec` 4.5.0 valida **solo il token**: nessun middleware FastAPI, nessun decoratore, nessun filtro per riga. Guard per rotta e restrizioni per istanza a mano | +3-5 |
| **Totale** | | | **~32-49 gg** |

Al termine di 32-49 giorni si ha **esattamente ciò che c'è oggi**, più il loop LangGraph, meno
HDI, meno gli attachments, meno XSUAA dichiarativo, e con un Node comunque in piedi per
approuter e HDI. **C non è una riscrittura: è una migrazione del 94% per un guadagno sul 6%.**

### Strada D — LangGraph **in JavaScript**, dentro CAP (la strada mancante)

Verificato sul registry npm e sulla documentazione, oggi:

| Pacchetto | Versione JS | Versione Python | Note |
|---|---|---|---|
| `@langchain/langgraph` | **1.4.18** | 1.x | `StateGraph`, `createAgent`, subgraph, `interrupt()`, Store API |
| `deepagents` | **1.14.1** | **0.7.19 (beta)** | **il JS è più avanti**: VFS, `task` (sotto-agenti), `write_todos`, skill |
| `@langchain/mcp-adapters` | **1.1.4, attivo** | **archiviato 17/09/2026** | client MCP, zero codice per tool, streamable HTTP |
| `@sap-ai-sdk/langchain` | **2.16.0** | `gen-ai-hub` | SAP ufficiale, allineato a LangChain 1.x, `bindTools()` |
| checkpointer | Memory / Postgres 1.0.5 / SQLite 1.0.4 | idem + HANA community | **nessun HANA in JS** |

`@langchain/langgraph` è una **libreria**: nessuna dipendenza da LangGraph Platform,
nessun LangSmith, nessun servizio contattato all'import. Si compila il grafo una volta
al bootstrap di CAP e lo si chiama dentro `server.js` — che resta com'è.

**Effort:**

- Sostituire il loop a mano con `createDeepAgent()` + `AzureOpenAiChatClient`, riscrivendo
  `searchKnowledge` e `loadSkill` come tool LangChain con Zod: **2-4 gg**, ~363 righe → ~120.
- Checkpointer: `MemorySaver` subito (come fa Joule in produzione), oppure
  `BaseCheckpointSaver` su un'entità CAP — 5 coppie di metodi, ma sopra `cds.run`,
  non sopra un driver grezzo: **2-4 gg**, e **si ottiene la persistenza vera che Joule non ha**.
- Sotto-agenti, filesystem virtuale, planning: **0-1 gg**, sono configurazione di `deepagents`.
- Streaming: `stream({ streamMode: "messages" })` riemesso nella forma di evento già
  esistente — `server.js` e `api.js` **non cambiano**: **1 gg**.
- Categoria asset `agent`: **3-5 gg** (lavoro di dominio, identico in ogni strada).
- **Totale: 8-14 gg**, cioè lo stesso di A, ma con una libreria 1.x mantenuta al posto
  di 500 righe proprietarie.

**Rischi di D:**

1. **Il vincolo dell'Orchestration Service.** `agent.js` dichiara: *"limite dell'Orchestration
   Service: `tools` non è per-richiesta"* e *"`tool_choice` non è supportato"*. È **confermato**
   per il client `@sap-ai-sdk/orchestration` grezzo (i tool stanno in
   `promptTemplating.prompt.tools`, alla costruzione) e `tool_choice` non compare in tutta la
   documentazione né nelle release notes. **Non è confermato** per `@sap-ai-sdk/langchain`,
   che espone `bindTools()` su entrambi i client. **Da verificare con uno smoke test su CF
   prima di impegnarsi** — `billy-smoketest/` esiste già per questo. Se `bindTools()` sull'
   `AzureOpenAiChatClient` regge `tool_choice` e i tool per-richiesta, D è sbloccata del tutto.
2. JS insegue Python di settimane-mesi sulle novità, la documentazione è più sottile.
3. Nessun checkpointer HANA in JS (ma nemmeno in Python ce n'è uno ufficiale).
4. `deepagents` 1.x è comunque giovane: va pinnato duro.

---

## 5. Risposte alle sei domande

**1. Qual è il rapporto reale fra parte agentica e parte applicativa?**
**363 righe su ~5.930, il 6,1%.** Con SSE e servizio Billy inclusi, 519 su 5.930, **8,8%**.
Il frontend da solo è il 67,8%. La cifra regge l'obiezione contro C senza margine di dubbio:
si riscriverebbe il 94% per rifare il 6%.

**2. In C, cosa si butta esattamente?**
Vedi §4.C. In sintesi: 611 righe di dominio (8-12 gg), 198 di RAG (2-3 gg, il meno caro
perché `langchain-hana` esiste), 23 righe di Fase 7 che tornano a essere 12 tool a mano
(3-5 gg), gli attachments su HANA senza alcun equivalente (4-6 gg), HDI e le migrazioni
automatiche (5-8 gg), il deploy (3-5 gg), XSUAA dichiarativo (+3-5 gg), `api.js` e tre
view (3-5 gg). **32-49 giorni** per tornare al punto di partenza. L'unica voce in attivo
è l'SSE, che in Python costa mezza giornata in meno.

**3. In B, dove passa il confine?**
Come in §4.B: di qua database e identità, di là solo stato di conversazione. Joule-ProCode
dimostra che la linea è **praticabile** — è in produzione — e allo stesso tempo ne mostra
i tre prezzi: 1.143 righe di adapter (che Billy ha già azzerato con 23 righe di MCP),
`MemorySaver` al posto di uno stato davvero persistente, e l'identità utente che non
attraversa il confine. I primi due Billy li ha già risolti meglio; il terzo, per Billy,
è bloccante.

**4. La strada A quanto costa davvero?**
**9-14 giorni** (§4.A). Non è un problema di tempo — è un problema di qualità: si finisce
con ~500 righe di runtime agentico proprietario in più da mantenere, quando la stessa cosa
è una dipendenza npm. **A e D costano uguale; D consegna di più.** Con un'eccezione a favore
di A: lo stato persistente fatto su un'entità CAP è **migliore** del default LangGraph,
perché vive su HANA e sopravvive al restart.

**5. Quale strada tiene aperte più opzioni, quale è irreversibile?**

- **D è la più reversibile**: è una dipendenza npm dentro un file. Se non convince, si torna
  ad `agent.js` in un giorno. E **non preclude B**: se un giorno servisse una libreria che
  esiste solo in Python, il server MCP di Fase 7 è già lì e il confine si apre in 2-3 giorni.
- **A è reversibile ma sterile**: ogni giorno speso è codice proprietario in più.
- **B è semi-reversibile**: un secondo deploy si spegne, ma nel frattempo si è pagato il
  costo ricorrente e si è duplicata l'auth.
- **C è irreversibile.** Dopo aver buttato HDI, gli attachments e il modello CDS non si
  torna indietro, e si eredita per sempre l'auth a mano.

**6. Il fattore che nessuna delle tre considera.**
Due, in ordine di peso.

- **LangGraph esiste in JavaScript**, il suo `deepagents` è a **1.14.1** contro lo **0.7.19 beta**
  del Python, e il suo adapter MCP è **vivo** mentre quello Python è **archiviato**. Tutta la
  discussione ha dato per scontato che "LangGraph" significhi "Python", e quindi "secondo
  runtime" oppure "riscrittura". Non è così. È la strada D, e cambia la decisione.
- **Il vero collo di bottiglia della qualità del loop non è CAP: è l'Orchestration Service.**
  I `tools` fissati alla costruzione del client e l'assenza di `tool_choice` sono esattamente
  ciò che rende difficili i sotto-agenti e i set di tool variabili (che è il presupposto della
  categoria di asset `agent`). Quel muro **resta identico anche in B e in C**, se si passa
  dall'Orchestration — e infatti Joule **non** ci passa: usa `ChatBedrockConverse` sul proxy
  gen-ai-hub. Cambiare framework senza cambiare il client del modello non risolverebbe nulla.
  **Un solo smoke test su `@sap-ai-sdk/langchain` + `AzureOpenAiChatClient` vale più di
  settimane di riscrittura**, e va fatto prima di qualsiasi decisione architetturale.

---

## 6. Cosa resta incerto

1. **`tool_choice` e i tool per-richiesta su `@sap-ai-sdk/langchain`.** La documentazione
   espone `bindTools()` su entrambi i client ma non dice se l'`OrchestrationClient` LangChain
   ricostruisca la config a ogni chiamata. **È l'unica cosa che i documenti non risolvono e
   l'unica che va misurata.** Costo: mezza giornata con `billy-smoketest/`.
2. **Le stime in giorni** sono ordini di grandezza calibrati sulla massa di codice misurata
   e sul precedente Joule, non su un piano di task. L'incertezza è ±40%; i **rapporti** fra le
   strade (D ≈ A ≈ 10 gg, B ≈ 12 gg, C ≈ 40 gg) sono più affidabili dei valori assoluti.
3. **Il costo del checkpointer su HANA** (nessuna implementazione JS esistente): stimato
   2-4 gg per analogia con il pacchetto community Python, che implementa 5 coppie di metodi
   su due tabelle. Sopra `cds.run` dovrebbe essere più semplice, ma non è stato prototipato.
4. **La latenza reale del confine in B** (+100-300 ms per chiamata) è una stima su round-trip
   HTTPS intra-landscape CF, non una misura. Il numero di attraversamenti per domanda
   (3-10) invece è derivato dal codice: `MAX_ITERATIONS = 5` e tool call multiple per turno.
5. **`deepagents` in JS a 1.14.1 non è stato provato** in questo contesto. La sua maturità
   rispetto al Python è dedotta da versione e repository ufficiale, non da uso diretto.
6. **Non è stato valutato** quanto della categoria di asset `agent` (prompt + skill + tool MCP
   pubblicati come asset certificabili) sia realmente nuovo: è lavoro di dominio, quindi
   costa uguale in tutte e quattro le strade e non discrimina fra loro — ma è probabilmente
   la cosa di maggior valore da fare, in qualunque strada.
