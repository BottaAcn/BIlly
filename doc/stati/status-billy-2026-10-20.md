# Status integrazioni Billy — 20 ottobre 2026

Data di ricognizione: **20/10/2026**, fuso Europe/Rome. Obiettivo: chiarire i sei filoni di integrazione e lasciare un punto di ripresa verificabile.

## 1. Sintesi: dove siamo davvero

**Billy ha un motore LangGraph JS collegato alla chat, con RAG e caricamento delle skill. Il passaggio al sistema completo di app, interfacce eseguibili, sotto-agenti e lavoro persistente è ancora incompleto.** Parte delle fondamenta esiste già, ma il grafo attivo non le usa.

| Area | Stato nel checkout esaminato | Cosa manca per il comportamento completo |
|---|---|---|
| LangGraph JS | Integrato: motore predefinito, `createReactAgent`, due tool, REST e SSE | Streaming token per token; eventuali capacità aggiuntive da collegare |
| Deep Agents / filesystem | Valutati nel piano; assenti dal runtime applicativo | Scelta di prodotto e implementazione. Nessun tool di file o esecuzione codice disponibile oggi |
| Skill | Integrate: manifesto nel prompt, corpo su richiesta, esclusione dal chunking | Correggere routing e contenuti problematici; gestire dipendenze da script/artefatti |
| Applicazioni | Catalogo e link disponibili; modulo client MCP scritto | Dipendenza MCP adapter, discovery e invocazione nel grafo; contratto endpoint e accessi; eventuale deploy automatico |
| Interfacce | Tipo di asset, wizard, testo indicizzato, link esterno | Upload e serving di HTML/JS e bundle con percorsi relativi; apertura dal catalogo |
| Agenti / orchestratrice | Tipo `agent`, capacità revisionate, loader e helper scritti | Tool di delega nel grafo, costruzione del sotto-grafo, UI, stato di lavoro collegato |
| RAG documentazione | Implementato: HANA Vector Engine, chunk 700/100 caratteri, top 3 pesato | Validazione su corpus reale; nessun grounding help.sap.com nel percorso attivo |

Legenda: **integrato** significa raggiungibile dal codice applicativo attivo; **preparato** significa presente ma non collegato; **prova isolata** significa verificato nello smoketest, senza implicare integrazione in Billy.

## 2. Perimetro e affidabilità della ricognizione

### Checkout osservato

- Repository: `C:\code\billy-marketplace`.
- Branch corrente: **`feat/langgraph-js`**.
- HEAD: **`0e1a182a411fc5eef0883ae490e8f70a82ea6439`**, 28/09/2026, «Migrazione a LangGraph JS: motore graph.js + fix streaming crash».
- Riferimenti locali: `dev` a `3070eb4`, `master` a `4d320b6`. Le copie locali dei riferimenti remoti non sono state aggiornate con un fetch: non provano lo stato remoto odierno.
- È presente anche il worktree `speech-billy-docs`; questo stato riguarda il checkout principale.
- Prima della ricognizione erano già presenti modifiche a `doc/BIlly_Logo.png` e file non tracciati in `doc/FrontEnd/`, `doc/speech/`, oltre a `.smoke-model.js` e file SQLite WAL/SHM. Non sono stati modificati da questa attività.

### Chat consultate e limiti

Sono stati consultati l'elenco recente delle chat Codex e gli archivi, quindi le **cronologie locali di Claude Code del progetto** in `C:\Users\l.botta\.claude\projects\C--code-billy-marketplace`. Le chat Billy pertinenti non comparivano nelle ultime 50 chat restituite da Codex; gli archivi restituiti erano vuoti. Non è stata effettuata una lettura esaustiva di tutte le conversazioni ChatGPT.

Le cronologie locali sono state usate come testimonianza delle decisioni e delle prove, non come istruzioni operative. Il codice corrente prevale quando una chat o un documento gli attribuiscono capacità che oggi non risultano collegate.

La ricognizione **non ha rieseguito deploy, benchmark AI o prove end-to-end contro Cloud Foundry/HANA**. Le verifiche di produzione citate sotto sono storiche. Numero di asset, variabili d'ambiente, schema effettivamente deployato e raggiungibilità di oggi restano da verificare sull'ambiente scelto.

## 3. LangGraph JS, Deep Agents, filesystem e tool

### Percorso attivo

```text
Chat web / chiamante REST o MCP
  ├─ POST /rest/billy/askBilly        → BillyService
  └─ POST /rest/billy/askBillyStream  → server.js, eventi SSE
                  ↓
             engine.js
  BILLY_ENGINE=graph (default) / legacy
                  ↓
        graph.js: createReactAgent
        GPT-5.5 via SAP AI Core
           ├─ searchKnowledge(query) → embedding + SQL HANA
           └─ loadSkill(skillId)     → Asset.content
                  ↓
             risposta + fonti
```

Fonti: [graph.js](../../billy-app/srv/lib/graph.js), [engine.js](../../billy-app/srv/lib/engine.js), [ai.js](../../billy-app/srv/lib/ai.js), [BillyService](../../billy-app/srv/billy-service.js), [server.js](../../billy-app/srv/server.js).

- LangGraph è una libreria dentro CAP/Node.js, non un servizio LangGraph separato.
- Dipendenze dichiarate: `@langchain/langgraph ^1.4.18`, `@langchain/core ^1.2.13`, `@sap-ai-sdk/langchain ^2.16.0`. Sono vincoli del progetto, non una dichiarazione sulle ultime versioni disponibili.
- LLM del grafo: **`gpt-5.5`**, `AzureOpenAiChatClient`, resource group `team-ai-contest-3`, budget `max_tokens: 16384` configurato nel client. Il legacy usa Claude 4.6 Sonnet via Orchestration.
- Il grafo riusa prompt, JSON Schema e funzioni di dominio da `agent.js`; non duplica il retrieval.
- Routing automatico: i soli tool registrati sono **`searchKnowledge`** e **`loadSkill`**. Non ci sono `runSubAgent`, tool MCP esterni, `read_file`, `write_file`, shell, Python o browser.
- `MAX_ITERATIONS = 5`; `recursionLimit = 11`. È un limite di passi del grafo, non un limite di cinque singole chiamate tool.
- Gestisce abort, limite di ricorsione e un retry per alcuni errori di rete prima di aver emesso eventi.
- Il fallback legacy è selezionabile via flag. La rotta SSE ha anche un fallback se il modulo del motore non carica; non è un recupero generalizzato da qualsiasi errore durante l'esecuzione.

### Streaming e memoria

La SSE è collegata e trasporta eventi di tool e risposta. Tuttavia il modello viene creato con **`streaming: false`**: workaround documentato per un crash dell'SDK sui chunk senza `delta`. Il percorso attuale non offre il testo token per token, anche se conserva il contratto degli eventi `delta`.

La chat è **stateless lato agente**: a ogni richiesta ricostruisce i messaggi e crea il grafo. Non passa un checkpointer né un `thread_id`.

- Browser: storico in `localStorage`, massimo 200 messaggi e soglia configurata di 400 × 1024 sulla lunghezza serializzata; non è una misura rigorosa dei byte occupati.
- Il frontend invia gli ultimi **16 messaggi**.
- Il backend accetta fino a **20 messaggi** validi, troncati a **8.000 caratteri ciascuno**.
- Le chiamate tool dei turni precedenti non sono checkpoint del grafo: lo storico è testuale, `user`/`assistant`.

### Deep Agents e filesystem

Il [piano di migrazione](../V1/piano-migrazione-langgraph.md) valuta `deepagents`, filesystem virtuale, sotto-agenti e checkpoint. **Non sono installati/collegati come capacità dell'applicazione corrente.**

Il filesystem virtuale descritto nel piano sarebbe uno stato di file manipolabile dall'agente: da solo non eseguirebbe Python. Lo storage BLOB degli allegati su HANA è già presente, ma è una funzione del catalogo, non un filesystem operativo esposto al modello.

## 4. Integrazione delle skill

**È il filone più concretamente integrato insieme al RAG.**

1. All'inizio di ogni richiesta `loadSkillManifest()` legge ID, titolo e descrizione degli asset `skill` pubblicati.
2. L'intero manifesto entra nel system prompt come indice. Non c'è un top-N semantico delle skill.
3. Il modello sceglie e chiama `loadSkill(skillId)`.
4. Il tool legge `Asset.content`, verifica tipo e pubblicazione, e restituisce la procedura fino a **60.000 caratteri**, con avviso di troncamento oltre quel limite.
5. Le istruzioni di sistema chiedono di seguire la procedura e produrre il risultato, anche combinandola con il retrieval.

Le skill **non sono chunkate**. Il corpo approvato è denormalizzato su `Asset.content`; upload e modifiche passano da revisione. Fonti: [agent.js](../../billy-app/srv/lib/agent.js), [catalog-service.js](../../billy-app/srv/catalog-service.js), [schema.cds](../../billy-app/db/schema.cds).

“Eseguire una skill” oggi significa far seguire al modello una procedura testuale con i due tool disponibili. Non significa eseguire automaticamente script allegati, importare un pacchetto completo di skill con risorse relative o produrre un file Excel tramite Python. Non c'è un runtime di codice collegato.

### Qualità e misure esistenti

- Catalogo storico della misura del 28 settembre: **22 skill + 8 documenti pubblicati**; non è un conteggio live del 20 ottobre.
- Misura applicativa legacy: **22/35 → 27/35** dopo il fix del prompt che impone di caricare la skill prima di rispondere. Vedi [causa-a-fix.md](../V1/causa-a-fix.md).
- Confronto isolato: **LangGraph + GPT-5.5 28/35**, loop manuale + GPT-5.5 **27/35**. I JSON conservati confermano questi conteggi.
- **Limite sostanziale:** il confronto isolato usava descrizioni al posto dei chunk e segnaposto al posto dei corpi skill, perché gli endpoint REST non esponevano quei contenuti. Misura il routing in quel banco, non la qualità completa delle procedure eseguite né una parità end-to-end del RAG. Il +1 non dimostra un miglioramento del framework.
- Fallimenti comuni dei due banchi: casi **7, 10, 11, 12, 13, 30**. In particolare `02-orchestratore` intercetta richieste ampie ma restituisce la pipeline; `17-render-excel` richiede capacità operative assenti.
- L'[audit dei risultati](../V1/skill-routing-results.md) proponeva di spubblicare/riclassificare alcune skill. È una raccomandazione storica, non una modifica al catalogo verificata oggi.

Ulteriore punto da chiudere: manifesto e loader controllano `published`, ma non escludono esplicitamente `deprecated`. La certificazione è mostrata come metadato; non va descritta come filtro runtime rigoroso sulle sole skill certificate.

## 5. Integrazione delle applicazioni

### Già disponibile

- Tipo di asset `application`, caricamento di descrizione/istruzioni, revisione e link esterno.
- Wizard che richiede URL dell'applicazione e owner; il dettaglio del catalogo apre il link in una nuova scheda.
- Testo delle applicazioni indicizzabile: solo `skill` e `agent` sono esclusi dal chunking.
- Billy è già esposto **come server MCP** tramite `@cap-js/mcp`, annotazioni CDS, `/mcp/catalog` e `/mcp/billy`. Il tool `askBilly` richiama il medesimo motore agentico, in modalità risposta unica.

### Preparato ma non operativo nella chat

[mcp-client.js](../../billy-app/srv/lib/mcp-client.js) implementa il verso opposto, **Billy client di app esterne**:

- endpoint preso da `Asset.externalLink`;
- discovery via `MultiServerMCPClient`, HTTP con fallback SSE;
- cache per asset di 5 minuti;
- nomi dei tool prefissati per applicazione;
- risultati limitati a 20.000 caratteri, etichettati con provenienza e delimitatori che li presentano come dati esterni;
- controlli su tipo, pubblicazione, endpoint e deprecazione; invalidazione dopo una revisione dell'app.

**Mancano i collegamenti decisivi:**

1. `@langchain/mcp-adapters` non compare tra le dipendenze applicative né nel lockfile esaminato. Il modulo gestisce il fallimento restituendo una lista vuota: non prova che i tool siano disponibili.
2. `graph.js` non importa il client, non carica il manifesto delle application e non registra tool esterni.
3. Il client non configura credenziali/header/destination per i server MCP remoti.
4. `externalLink` è oggi usato nella UI come URL umano dell'app, mentre il client lo interpreta come endpoint MCP. Serve distinguere questi significati o definire un contratto univoco.

Nelle chat è stata discussa l'approvazione di un'app seguita dal **deploy automatico su Cloud Foundry**. Non c'è una pipeline applicativa che lo faccia: `reviewRevision` pubblica contenuto, rigenera chunk/capacità e invalida cache; non deploya backend o pacchetti. Gli script MTA del repository deployano Billy, non le app caricate nel catalogo.

## 6. Integrazione delle interfacce

Qui c'è anche una **divergenza di significato da chiarire**.

- Nella chat del 9 settembre l'obiettivo era una **mini-app HTML/JS**, anche multi-file, fruibile dal catalogo.
- Il wizard corrente per `interface` descrive invece un'**interfaccia tecnica/API**: endpoint e protocollo, autenticazione, payload, limiti, README.

Oggi si può catalogare un'interfaccia, indicizzarne il testo e aprire un link esterno. Non risulta implementato l'hosting della mini-app caricata:

- frontend e backend accettano **PDF, DOCX, PPTX, TXT**; HTML e ZIP non rientrano nel flusso supportato;
- gli allegati sono scaricati con `Content-Disposition: attachment`;
- non esiste la rotta `viewAsset/<assetId>/<path>` discussa nelle chat;
- non c'è serving `inline` dei singoli file con MIME e percorsi relativi, né un viewer dedicato nel catalogo.

La soluzione discussa era conservare i file e servirli sotto una base URL stabile, aprendo `index.html` per permettere al browser di risolvere CSS/JS relativi. È ancora un disegno da implementare. Il normale frontend di Billy è già una SPA in Web Components; ciò non equivale all'hosting delle interfacce degli asset.

Fonti: [wizard](../../billy-app/app/js/views/upload-view.js), [catalogo](../../billy-app/app/js/views/catalog-view.js), [estrazione file](../../billy-app/srv/lib/text-extraction.js), [download](../../billy-app/srv/catalog-service.js), [rotte](../../billy-app/srv/server.js).

## 7. Agenti e skill orchestratrice

### Fondamenta già scritte

- `AssetType.agent`, escluso dal chunking come le skill.
- Definizione autorevole in `Asset.content`: prompt + blocco JSON con `skills` e `applications`, riferite per UUID o titolo esatto.
- `AgentCapability` materializza le capacità all'approvazione, quindi prompt e dichiarazione delle capacità passano insieme dalla revisione.
- `subagent.js` risolve riferimenti, carica definizione e skill intere, compone il prompt e prepara i tool MCP delle app dichiarate.
- `runSubAgent({assetId, input, invoke})` esiste, ma richiede che il chiamante fornisca **`invoke`**.
- `getAgentDefinition` è esposto dal catalogo per ispezionare la definizione risolta.
- `WorkSession`, `WorkCheckpoint`, `WorkCheckpointWrite` sono modellate; ci sono helper per leggere/aggiornare un JSON di lavoro e chiudere sessioni scadute, con TTL di 30 giorni.

### Collegamento ancora assente

- Il grafo non legge il manifesto agenti e non espone un tool di delega.
- Non fornisce la funzione `invoke` a `runSubAgent` e non costruisce un sotto-grafo con strumenti isolati.
- `upsertWorkSession`/`getWorkSession` non sono richiamati dal grafo. La presenza di una tabella o di una proiezione CRUD non significa che la conversazione salvi lì il proprio lavoro.
- La UI non include `agent` negli elenchi ordinati dei tipi e nel wizard: il tipo backend precede l'esperienza di creazione/uso.
- Il checkpointer HANA **non è implementato**. Le tabelle sono una base di schema; il grafo attivo non usa neppure un `MemorySaver`.
- I riferimenti non risolti producono avvisi senza bloccare l'approvazione. I loader agent/skill richiedono ancora una revisione coerente dei controlli di deprecazione prima di farne una garanzia di capacità runtime.

**Skill orchestratrice e agente non sono sinonimi.** `02-orchestratore` è oggi testo caricato da `loadSkill`; può descrivere una sequenza ma non aggiunge un tool di delega, uno stato persistente o un ambiente Python. Il nuovo tipo `agent` prepara un'unità specializzata con capacità scelte, ma senza il collegamento nel grafo Billy non può invocarla.

Esistono prove isolate in [test-langgraph-subagent.js](../../billy-smoketest/test-langgraph-subagent.js) e [test-checkpointer-persistente.js](../../billy-smoketest/test-checkpointer-persistente.js). La seconda usa **SQLite**, non HANA. La cronologia del 28 settembre riporta esiti positivi di sotto-agente e ripresa dopo riavvio: dimostrano fattibilità tecnica, non integrazione nell'app.

Fonti: [subagent.js](../../billy-app/srv/lib/subagent.js), [schema](../../billy-app/db/schema.cds), [API catalogo](../../billy-app/srv/catalog-service.cds), [graph.js](../../billy-app/srv/lib/graph.js).

## 8. RAG della documentazione: parametri esatti

| Aspetto | Implementazione corrente |
|---|---|
| Ingresso | Testo incollato e/o file; se presenti entrambi vengono concatenati, testo curato prima del testo estratto |
| Formati | PDF (`pdf-parse`), DOCX (`mammoth`), PPTX (`officeparser`), TXT |
| Limite file | 10 MiB nel codice; body parser applicativo configurato a 15 MB |
| File originale | BLOB su HANA via attachments; distinto dal testo usato dal RAG |
| Pubblicazione | Chunk generati/rigenerati quando viene approvata una revisione |
| Tipi esclusi | `skill` e `agent`; gli altri tipi possono avere chunk |
| Chunk | **700 caratteri** per finestra, **100 caratteri** di overlap, avanzamento di 600 |
| Criterio di taglio | `String.slice`: finestre fisse, nessuna separazione semantica, per pagina, titolo o paragrafo |
| Embedding | `text-embedding-3-large`, **3072 dimensioni**, via SAP AI Core |
| Ingestion | Un `await embed()` per chunk nel ciclo; nessun batching implementato qui |
| Storage vettoriale | Entità `Chunk`, campo `Vector(3072)` su HANA |
| Retrieval agente | **TOP 3 chunk per singola chiamata** a `searchKnowledge` |
| Punteggio | `COSINE_SIMILARITY × peso certificazione`, ordinato direttamente in SQL |
| Pesi | `certified` **1,0**; `certifiedOutdated` **0,75**; `community` **0,35**; `deprecated` escluso |
| Fonti finali | Raccolta per invocazione, deduplicata per asset, link verso il catalogo |

Per esempio, **1.500 caratteri generano 3 chunk**: intervalli a indice zero `[0,700)`, `[600,1300)`, `[1200,1500)`. Sono caratteri, non token; nel codice JS si tratta precisamente di unità UTF-16. La lunghezza del contesto in token dipende dal testo.

Il modello decide se e quante volte cercare. Tre chunk non significano tre documenti distinti: possono appartenere allo stesso asset. Richieste ripetute possono accumulare altre fonti nello stesso turno. La query non imposta una soglia minima di similarity; il modello deve valutare la pertinenza dei risultati.

**Differenza fra chat e ricerca del catalogo:** `deepSearch` raggruppa i chunk per asset usando il massimo della cosine similarity e non applica i pesi di certificazione; `searchKnowledge` applica i pesi e prende tre frammenti. Non sono lo stesso retrieval, anche se riusano gli embedding.

### Limiti aperti

- La qualità di 700/100 non risulta validata su un corpus rappresentativo della practice. È il default implementato, non una dimensione dimostrata ottimale.
- Non risultano OCR dedicato, chunking di tabelle/sezioni, reranker o ricerca ibrida nel tool RAG attivo. Un PDF a scansione può quindi non fornire testo utile.
- Il testo passato al modello contiene titolo, certificazione e frammento; le fonti finali identificano l'asset, senza un riferimento strutturato a pagina/sezione.
- **Grounding help.sap.com non attivo nel codice corrente.** Le chat riportano un tentativo precedente poi rimosso e un requisito di configurazione AI Core rimasto aperto. Il [documento decisionale](../V1/document-grounding-decision.md) lo considera una fonte aggiuntiva possibile, non il sostituto del catalogo.
- Il peso di certificazione dipende dal valore denormalizzato sul chunk, aggiornato dalle funzioni del catalogo. Non è un giudizio lasciato al modello.

Fonti: [chunking.js](../../billy-app/srv/lib/chunking.js), [agent.js](../../billy-app/srv/lib/agent.js), [ai.js](../../billy-app/srv/lib/ai.js), [catalog-service.js](../../billy-app/srv/catalog-service.js), [text-extraction.js](../../billy-app/srv/lib/text-extraction.js).

## 9. Cronologia utile e divergenze da non ereditare

| Data / fonte | Cosa emerge | Come interpretarlo oggi |
|---|---|---|
| 9 settembre, sessione `3d63e123-279e-4fbb-84d9-8b3cf5004181` | Interfacce HTML/JS multi-file e deploy automatico delle app discussi | Obiettivi di prodotto, non implementazioni completate |
| 25–28 settembre, sessione `8d7b7d09-4526-481c-9340-076b16980698` | Decisione su quattro tier, manifesto skill, tool loop, cronologia client, SSE; riscontri di esecuzione skill su CF | Fondamento della Fase agentica; successivamente cambia il motore |
| 28 settembre, `74cc8ea` e `1db5f33` | Agente con skill; taratura del prompt | Implementazione effettiva, ancora riusata dal grafo |
| 28 settembre, piano LangGraph | Migrazione ancora da approvare, filesystem/checkpointer/sotto-agenti come passi futuri | Fotografia precedente a HEAD, non backlog tutto completato |
| 28 settembre, sottosessioni `agent-ac4f0164ce7e4a759` e `agent-a58fff315752091de` di `7e1b7cb7-b79a-4b29-bfc0-9e3477c8d936` | Benchmark con limiti dichiarati; deploy del motore LangGraph e aumento RAM a 1 GB riportati riusciti | Prove storiche; non certificano ambiente, flag o contenuti di oggi |
| 28 settembre, `0e1a182` | Motore LangGraph integrato, workaround streaming | HEAD del checkout esaminato |
| 28 settembre sera, `doc/speech/` | Documenti di presentazione aggiornati | Alcune frasi anticipano integrazioni non collegate: verificare sul codice |

Tre correzioni particolarmente importanti ai documenti precedenti:

1. `architecture.md` parla anche di React/UI5 e parametri RAG iniziali: il frontend corrente usa Web Components nativi; il RAG effettivo è 700/100 e top 3.
2. `stack-tecnologico.md` presenta l'MCP adapter come dipendenza e i sotto-agenti come invocabili: l'adapter manca nel manifest applicativo e il grafo non chiama i relativi moduli.
3. I commenti di `subagent.js` parlano di un checkpointer in memoria e lo speech disegna `runSubAgent` nel grafo: `graph.js` oggi non configura né l'uno né l'altro.

Contesto operativo trasversale: auth CAP ancora `dummy`, XSUAA predisposta ma non attiva; scanning allegati disattivato. Sono stati del progetto già dichiarati, da includere nella preparazione al rollout, non prerequisiti aggiunti da questa ricognizione.

## 10. Checklist di ripresa

Questa è una proposta d'ordine fondata sui collegamenti mancanti; non dichiara autorizzati nuovi deploy o modifiche a servizi esterni.

- [ ] **Fissare la baseline dell'ambiente:** individuare il Billy corretto, confrontare il deploy con `0e1a182`, leggere `BILLY_ENGINE`, controllare schema e catalogo. Le chat citano più host/ambienti: non usare un URL storico senza verifica.
- [ ] **Allineare la linea Git:** decidere come portare `feat/langgraph-js` su `dev`/`master`; verificare i remoti reali prima di assumere merge o push già fatti.
- [ ] **Scegliere un caso completo app + agente:** una richiesta reale, una skill, un'app MCP con risultato verificabile. Definire che cosa deve essere osservabile nella chat.
- [ ] **Collegare il client MCP:** dichiarare l'adapter, distinguere URL umano ed endpoint MCP, configurare accessi, esporre i tool nel percorso scelto e provare una chiamata reale.
- [ ] **Collegare il tipo `agent`:** manifesto, tool di delega, `invoke` del sotto-grafo e set di capacità isolato. Rendere il tipo creabile/visibile nella UI.
- [ ] **Riparare le skill problematiche:** riscrivere descrizioni/corpi o riclassificare orchestratrice e renderer secondo le capacità disponibili; poi rimisurare con contenuti reali. I risultati placeholder non bastano per verificare gli output.
- [ ] **Rendere operativa la pipeline orchestrata:** scegliere dove vive lo stato JSON di lavoro e quali passi richiedono codice esterno. Se serve ripresa del grafo dopo riavvio, implementare il saver HANA e il contratto `thread_id`/ripresa.
- [ ] **Chiarire il tipo `interface`:** mini-app HTML o descrizione di API, oppure due tipi distinti. Per mini-app, implementare bundle, serving per path e apertura dal catalogo.
- [ ] **Valutare filesystem / Deep Agents solo sul caso scelto:** non sono necessari per attivare i due tool già funzionanti; servono requisiti precisi su artefatti e operazioni da offrire.
- [ ] **Misurare RAG su documenti reali:** domande con risposta attesa e fonte nota; confrontare chunking e top-k, inclusi documenti lunghi e tabelle. Decidere separatamente se riaprire help.sap.com.
- [ ] **Ripristinare token streaming:** riprodurre il bug contro la versione SDK effettiva e rimuovere il workaround solo dopo una prova sull'intero percorso SSE.

### Da dove ripartire in una nuova chat

> Leggi `doc/stati/status-billy-2026-10-20.md`, verifica HEAD e modifiche locali. Il motore LangGraph ha solo `searchKnowledge` e `loadSkill`; MCP client e sotto-agenti sono preparati ma scollegati, interfacce HTML non servite, checkpointer assente. Prima di implementare il punto richiesto, ricontrolla questi collegamenti e non assumere completate le capacità descritte negli speech.

## 11. Verifiche di questa ricognizione

- Lettura dei percorsi di chiamata REST/SSE, costruzione del grafo, manifest applicativo e lockfile, schema CDS, revisioni, upload, UI e query RAG.
- Ricerca dei riferimenti ai moduli MCP/sotto-agenti per distinguerne presenza e utilizzo.
- Lettura mirata delle cronologie locali e confronto con commit, piano e speech.
- Ricalcolo degli esiti dei JSON conservati: LangGraph **28 OK su 35**, handloop **27 OK su 35**; verifica delle limitazioni esplicite del banco.
- Controllo della formula di chunking e dei collegamenti locali di questi documenti.

Questa attività aggiunge solo documentazione di stato; non modifica il runtime e non riesegue le prove storiche.
