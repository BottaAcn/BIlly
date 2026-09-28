# Piano di migrazione del motore agentico a LangGraph JS

Analisi del 28/09/2026 su `C:\code\billy-marketplace` (branch `dev`, commit `a49b96d`).
Riferimenti: [confronto-cap-langgraph.md](confronto-cap-langgraph.md) (la Strada D),
[skill-routing-results.md](skill-routing-results.md) (22/35), [causa-a-fix.md](causa-a-fix.md) (22→27/35),
[external-brief/API-CONTRACT.md](external-brief/API-CONTRACT.md) (contratto, fonte di verità).

Tutte le verifiche tecniche di questo documento sono state fatte **sui pacchetti reali** installati in
`billy-smoketest/node_modules` e sul registry npm, non sulla documentazione. Dove ho solo letto i tipi e
non ho eseguito codice contro CF, lo dico.

---

## 1. Sintesi operativa

1. **La migrazione non è approvata.** Un altro agente sta misurando una replica LangGraph sui 35 casi contro il 27/35 attuale: il §3 (Passo 0) è il cancello, e il §3.0.3 dice cosa fare se il confronto è negativo.
2. **Il presupposto tecnico è confermato sui tipi**: `AzureOpenAiChatClient` di `@sap-ai-sdk/langchain` 2.16.0 passa `tools` **e** `tool_choice` per-richiesta (`dist/openai/util.js:240-241`). Il muro dell'Orchestration Service cade. Il client LangChain *Orchestration*, invece, ha `bindTools()` ma **non** `tool_choice`: Claude via Orchestration resta a metà strada.
3. **Nessun problema ESM/CJS sui pacchetti LangChain**: `@langchain/core`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint`, `deepagents`, `@langchain/mcp-adapters` hanno tutti build duale con condizione `require`. Verificato requiring reale su Node 22.20. Il rischio vero è un altro: la **dual package hazard** (§4.9).
4. **Il manifesto non si tocca.** `buildSystemPrompt()` (`agent.js:91-118`) e i due tool restano identici nei primi passi: sono la variabile di controllo dell'esperimento, non materiale da rifattorizzare.
5. **Il primo passo è il banco di prova versionato**, che oggi non esiste in repo (i 35 casi sono stati rigiocati con uno script non versionato, output in `%TEMP%/rt35/out/`). Senza quello nessun passo successivo è verificabile.
6. **Il primo passo che dà valore da solo è il cambio modello a `gpt-5.5` a motore invariato** (Passo 2): è già deciso, è indipendente da LangGraph, ed è misurabile sugli stessi 35 casi.
7. **Il filesystem virtuale non esegue niente.** È un oggetto `files` nello stato del grafo. Il Python di `sacfactory/` non ci gira e non ci girerà: resta un servizio da deployare a parte (§4.5).
8. **Il rischio dominante è la regressione silenziosa sul routing**, e l'amplificatore peggiore è `deepagents`: aggiunge 8+ tool built-in accanto ai due attuali, cioè esattamente la diluizione che la taratura del prompt ha combattuto per arrivare a 27/35.
9. **Punto di non ritorno formale: Passo 5** (cancellazione del loop legacy). **Punto di non ritorno reale: Passo 8/9**, quando il catalogo comincia a contenere asset in un formato che ha senso solo dentro il framework.
10. **Effort totale 13-24 giorni** (±40%); il nucleo della migrazione (Passi 1-5) è **5-9 giorni**. Il resto è funzionalità nuova, non migrazione.

---

## 2. Tabella area per area

| # | Area | Oggi | Domani (LangGraph) | Riuso / butta | Effort |
|---|---|---|---|---|---:|
| 1 | **Tool e binding** | `TOOLS` = 2 JSON Schema a mano (`agent.js:29-69`), fissati alla costruzione dell'`OrchestrationClient` (`:273-281`), `tool_choice` non supportato | `tool()` + Zod, passati per-richiesta via `bindTools()`; `tool_choice` disponibile | **Butta** le 41 righe di `TOOLS`; **riusa** i corpi `runSearchKnowledge`/`runLoadSkill` verbatim | 0,5 gg |
| 2 | **Skill e manifesto** | Manifesto testuale nel system prompt + tool `loadSkill`; regole 3-9 tarate, valgono +5 punti | **Identico** nei Passi 1-5. Le alternative (un tool per skill, skills middleware di deepagents) sono valutate e **sconsigliate** per la chat principale (§4.2) | **Riusa intatto**. Zero righe cambiate | 0 gg (poi 1-2 gg se si introduce il top-N per embedding) |
| 3 | **MCP server** | `@cap-js/mcp` 1.4.3, 23 righe di annotazioni nei `.cds`, 12 tool generati | **Invariato.** Genera i tool dal modello CDS, non sa chi implementa `askBilly` | **Riusa intatto** — vincolo: `askBilly` deve restare invocabile non-streaming | 0 gg |
| 4 | **MCP client** | Non esiste | `@langchain/mcp-adapters` 1.1.4 → tier `application`. Convive con il server: pacchetti SDK diversi (v2 lato CAP, v1 lato adapters) | **Nuovo** | 1-2 gg |
| 5 | **RAG** | `cds.run` con `COSINE_SIMILARITY` + `CERTIFICATION_WEIGHT_SQL` dentro `runSearchKnowledge` (`agent.js:151-186`) | **La stessa identica query**, dentro il `func` di un `tool()`. In-process, nessun confine di rete | **Riusa intatto**, incluso il peso per `certificationLevel` | 0,25 gg |
| 6 | **Raccolta fonti** | `createSourceCollector()` closure passata ai tool (`agent.js:130-149`) | Closure creata per-invocazione e catturata da una tool-factory. **Non** un canale di stato: cambierebbe il contratto | **Riusa**, cambia solo chi la istanzia | 0,25 gg |
| 7 | **Filesystem virtuale** | Non esiste | `files` nello stato + `ls/read_file/write_file/edit_file/glob/grep`. **In memoria, nessuna esecuzione** | **Nuovo**, e non sostituisce `sacfactory/` | 2-4 gg |
| 8 | **Stato / checkpointer** | Nessuno: server stateless, storico dal client (API-CONTRACT §1.1) | **Chat: nessun checkpointer** (il contratto resta stateless). **Factory: checkpointer su HANA** via entità CDS, 5 metodi astratti | **Nuovo**, solo per la Factory | 2-4 gg |
| 9 | **Sotto-agenti / tipo `agent`** | Non esiste | `createSubAgent` di deepagents, oppure subgraph LangGraph nudo; asset `type: agent` = prompt + lista skill + lista tool MCP | **Nuovo** (lavoro di dominio, indipendente dal framework) | 3-5 gg |
| 10 | **Streaming** | Rotta SSE `server.js` (99 righe), eventi `tool`/`result`/`delta`/`answer`/`error`, verificata attraverso l'approuter | `stream({ streamMode: ['messages','tools'] })` rimappato **sugli stessi eventi**. `server.js` e `app/js/api.js` non cambiano | **Riusa intatto** server.js + api.js + API-CONTRACT | 1-2 gg |
| 11 | **Collocazione del grafo** | `srv/lib/agent.js`, `runAgent({question, history, onEvent, signal})` | `srv/lib/graph.js`, **stessa firma**. `agent.js` diventa il dispatcher legacy/graph | **Riusa** i due call site (`billy-service.js:14`, `server.js:80`) senza toccarli | incluso nel Passo 3 |
| 12 | **Catalogo, revisioni, certificazione, allegati, schema, frontend** | 94% del codice | **Invariato** | **Riusa intatto** | 0 gg |

---

## 3. Il piano, passo per passo

Convenzione di verifica: *"i 35"* = i 35 casi di `skill-routing-audit.md` §5, rigiocati verbatim, uno per
conversazione, senza history, misurando l'evento SSE `loadSkill` e il testo integrale. **La misura ha un
rumore dichiarato di ±2 casi** (`skill-routing-results.md`, appendice): una differenza di 1-2 punti su una
singola passata **non è un segnale**. Dove scrivo "non peggiora" intendo: **≥ 26/35 su una passata, oppure
≥ 27/35 come mediana di tre passate**.

### Passo 0 — Il cancello: il confronto (in corso, altro agente)

**Non è un passo di sviluppo.** È la condizione di esistenza di tutto il resto. Mi limito a fissare la
regola di decisione, perché una misura senza soglia dichiarata in anticipo si interpreta a posteriori.

**0.1 — Isolare le due variabili.** Il confronto rischia di mescolare due cambiamenti: il *framework*
(loop a mano → LangGraph) e il *modello* (`anthropic--claude-4.6-sonnet` via Orchestration → `gpt-5.5` via
`AzureOpenAiChatClient`). Il 27/35 è stato misurato su Claude con un prompt tarato su Claude. Se la
replica gira su gpt-5.5, un eventuale calo non dice quale delle due cause l'ha prodotto. **Va chiesto al
confronto di riportare il modello usato**, e in caso di calo va eseguito il Passo 2 prima di concludere.

**0.2 — Regola di decisione.**

| Esito replica | Lettura | Azione |
|---|---|---|
| ≥ 27/35 | pari o meglio | Si procede dal Passo 1 |
| 25-26/35 | dentro il rumore | Si rigioca 2 volte. Se si stabilizza a −1/−2, è una **scelta esplicita**: 1-2 punti in cambio di sotto-agenti, client MCP e VFS. Raccomandazione: procedere, ma con 1-2 gg di ritaratura del prompt messi a budget |
| < 25/35 **e** modello = Claude | il framework peggiora il routing | **Stop.** Ripiego su Strada A (§0.3) |
| < 25/35 **e** modello = gpt-5.5 | causa ambigua | Eseguire il Passo 2 (gpt-5.5 nel motore attuale). Se anche lì cala, il problema è il **prompt**, non LangGraph: ritarare su gpt-5.5, poi rifare il confronto |

**0.3 — Se il confronto è negativo.** Si ripiega sulla **Strada A** di `confronto-cap-langgraph.md` §4.A:
estendere `agent.js` a mano — sotto-agenti come ricorsione di `runAgent` con budget di iterazioni,
filesystem come 5-6 tool su un'entità, stato come entità `AgentThread`. 9-14 gg, nessuna dipendenza nuova,
e soprattutto **il prompt a 27/35 resta intoccato**. In quello scenario restano comunque validi e da fare:
il Passo 1 (banco di prova) e il Passo 2 (gpt-5.5), che non dipendono da LangGraph.

---

### Passo 1 — Versionare il banco di prova dei 35 casi

**Cosa.** Oggi i 35 casi vivono come tabella in `doc/V1/skill-routing-audit.md` §5 e le due misure
(22/35 e 27/35) sono state prodotte da uno script non versionato, con i dati grezzi in
`%TEMP%/rt35/out/case*.json`. **Il punto di riferimento dell'intera migrazione non è in repo.**

Serve, in `billy-smoketest/` (cartella oggi presidiata da un altro agente — coordinare, o in una
sottocartella nuova):
- `casi35.json` — le 35 domande verbatim + la skill attesa + l'esito atteso (`OK`/`KO`/`NO-SKILL`/`SPURIA`);
- un runner che POSTa su `/rest/billy/askBillyStream`, raccoglie gli eventi `tool` con `name === 'loadSkill'` e il testo finale, con retry (la risoluzione DNS verso CF è risultata intermittente);
- uno scorer che produce la tabella e il totale, **e un diff contro una misura precedente salvata su file**.

**Perché per primo.** Senza, "non ha peggiorato" è un'opinione. Con, è un comando.

**Verifica.** Rigiocare i 35 sul sistema attuale su CF **senza aver cambiato una riga di codice
applicativo**: deve riprodurre 27/35 ± 2. Se non lo riproduce, il problema è nel runner, non nel sistema,
e va risolto prima di andare avanti.

**Effort: 0,5-1 gg.** Nessun rischio. **Va fatto anche se la migrazione non si fa.**

---

### Passo 2 — Cambio modello a `gpt-5.5`, motore invariato

**Cosa.** Sostituire in `agent.js` **solo** il blocco client (righe 264, 273-281, 300-312):
l'`OrchestrationClient` di `@sap-ai-sdk/orchestration` diventa `AzureOpenAiChatClient` di
`@sap-ai-sdk/foundation-models` (il client grezzo, **non** quello LangChain: nessuna dipendenza nuova in
questo passo). `TOOLS` resta nella forma OpenAI che già ha, e passa nel body della richiesta invece che
nella configurazione del client. `LLM_MODEL` in `srv/lib/ai.js:19` diventa `'gpt-5.5'`.

Due dettagli verificati che fanno perdere tempo se scoperti tardi:
- **`gpt-5.5` è un reasoning model** per l'SDK (`dist/openai/util.js:15-21`: `modelName.startsWith('gpt-5')` e non `gpt-5-chat`). Nel wrapper LangChain questo si traduce in `max_completion_tokens` invece di `max_tokens`. Sul client grezzo il parametro va scelto a mano: `max_tokens: 4096` di `agent.js:276` **non è il parametro giusto**.
- `temperature` e `top_p` sui reasoning model Azure sono tipicamente rifiutati o ignorati: oggi non vengono passati, e non vanno aggiunti.

**Perché qui.** Perché **dà valore da solo** e perché scioglie l'ambiguità del Passo 0.1. È già una
decisione presa dall'utente, indipendente da LangGraph, ed è la sola cosa che sblocca `tool_choice` a
livello di client. Se la migrazione si ferma qui, Billy ha comunque cambiato modello in modo misurato.

**Verifica.** I 35, modalità streaming, su CF. Atteso ≥ 26/35. **Attenzione**: il prompt è tarato su
Claude 4.6; un calo qui è informazione su gpt-5.5, non su LangGraph. Verificare anche, sui 5 casi di
riferimento, che gpt-5.5 emetta ancora **testo prima della tool call** — i reasoning model spesso non lo
fanno, e il "preambolo" è ciò che rende vivo lo streaming (API-CONTRACT §1.2, nota sui `delta`).

**Rollback:** un file, un commit. **Effort: 1-2 gg** (1 se il punteggio tiene, 2 se serve ritarare).

---

### Passo 3 — Il grafo minimo: due tool, stesso prompt, stessa firma

**Cosa.** Nuovo file `srv/lib/graph.js` che esporta **la stessa firma di oggi**:
`runAgent({ question, history, onEvent, signal })` → `{ answer, sources }`. Dentro:

- `AzureOpenAiChatClient` di **`@sap-ai-sdk/langchain`** 2.16.0 (`modelName: 'gpt-5.5'`, `resourceGroup: 'team-ai-contest-3'`);
- due `tool()` con schema Zod, i cui `func` chiamano i corpi **spostati verbatim** da `runSearchKnowledge` e `runLoadSkill`. Le `description` dei tool sono **copiate carattere per carattere** da `TOOLS` (`agent.js:35-37` e `:54-56`): sono parte della taratura;
- `createReactAgent({ llm, tools })` da `@langchain/langgraph/prebuilt` (già presente, 1.4.18). Il system prompt entra come primo `SystemMessage` nell'array `messages` in input, **prodotto dalla `buildSystemPrompt()` esistente, importata e non riscritta** — il manifesto cambia ad ogni richiesta perché cambia l'insieme delle skill pubblicate, quindi non può stare nella compilazione del grafo;
- `sanitizeHistory()` riusata, poi mappata su `HumanMessage`/`AIMessage`;
- il `createSourceCollector()` istanziato **per invocazione** e catturato dalla closure dei due tool.

`agent.js` diventa un dispatcher: `module.exports.runAgent = process.env.BILLY_ENGINE === 'graph' ?
require('./graph').runAgent : legacyRunAgent`. **I due call site non si toccano**
(`billy-service.js:14`, `server.js:80`).

**Tre trappole concrete di questo passo:**

1. **`MAX_ITERATIONS = 5` non ha un equivalente 1:1.** Il tetto di LangGraph è `recursionLimit`, che conta i super-step: un giro ReAct sono ~2 super-step, quindi 5 iterazioni ≈ `recursionLimit: 11`. Peggio: al superamento LangGraph **lancia `GraphRecursionError`**, mentre `agent.js:353-355` restituisce la risposta parziale con un messaggio onesto. Senza un `catch` esplicito che riproduce quel comportamento, **un caso degradato diventa un caso di errore**. È una regressione reale, invisibile finché non capita in demo.
2. **Il blocco `signal`.** `server.js:70-73` abortisce sul disconnect del client. `runAgent` deve passare `{ signal }` nella config di `invoke`/`stream` e continuare a restituire il parziale invece di propagare l'`AbortError`.
3. **Non montare ancora deepagents.** `createDeepAgent` aggiunge di default i tool di filesystem e non li si rimuove con un parametro (`CreateDeepAgentParams`: *"Passing tools here does not remove built-in filesystem tools; customize FilesystemMiddleware to remove them entirely"*). Introdurlo qui vorrebbe dire mettere 8+ tool accanto ai due misurati, e inquinare l'unico esperimento pulito del piano.

**Verifica.** Doppia, ed è il passo dove la verifica conta più del codice:
- **A/B sui 35**, prima con `BILLY_ENGINE=legacy` poi con `graph`, stessa sessione, stesso catalogo. Criterio: `graph ≥ legacy − 1`. Un delta maggiore si indaga prima di andare avanti, non dopo.
- **`askBilly` non-streaming** (quindi anche il tool MCP) restituisce la stessa forma di body su 5 casi: `answer` in Markdown, `sources` con `similarity: null` per le skill.

**Effort: 2-3 gg.** ~200 righe cancellate, ~120 scritte.

---

### Passo 4 — Streaming: rimappare gli eventi senza toccare il contratto

**Cosa.** Sostituire la `emit()` manuale con il consumo di
`graph.stream(input, { streamMode: ['messages', 'tools'], signal })`. Mappa verificata sui tipi
(`@langchain/langgraph/dist/stream/types.d.ts:180-214` e `dist/pregel/types.d.ts:19`):

| Evento attuale | Sorgente LangGraph | Note |
|---|---|---|
| `{type:'tool', name, args}` | `streamMode:'tools'` → `ToolCallStream.name` / `.input` | emesso a tool call finalizzata; l'ordine rispetto ai `delta` si conserva |
| `{type:'result', name, ok, summary}` | `await ToolCallStream.output` / `.status` / `.error` | sono **Promise**: vanno consumate con `.then()` che scrive sull'SSE, **senza bloccare** l'iterazione dello stream |
| `{type:'delta', text}` | `streamMode:'messages'` → `AIMessageChunk.content` | |
| `{type:'answer', answer, sources}` | ultimo messaggio dello stato finale + `collector.list()` | emesso da `runAgent`, come oggi (`agent.js:359`) |
| `{type:'error', message}` | `try/catch` intorno allo stream | resta in `server.js:87-91`, invariato |

Con due `streamMode` lo stream restituisce tuple `[mode, payload]`: va gestito, è la differenza rispetto
alla singola modalità degli esempi.

**Il contratto non cambia.** `server.js`, `app/js/api.js:65-104` e `API-CONTRACT.md` §1.2 restano com'è.
Se in corso d'opera emergesse che una delle cinque forme non è riproducibile — il candidato più probabile
è `result.summary`, i primi 200 caratteri del ritorno del tool — **si aggiorna `API-CONTRACT.md` e le tre
view del frontend che lo consumano, e lo si dichiara**: non si lascia il frontend a indovinare.

**Verifica.** Catturare la sequenza di eventi SSE grezzi per 5 casi di riferimento con `legacy` e con
`graph` e diffarle: stessi `type` nello stesso ordine, stessi `name`/`args`, `answer` con le stesse
`sources`. Poi **la verifica che conta davvero**: aprire il frontend attraverso l'approuter su CF e
guardare i `delta` arrivare progressivamente. La bufferizzazione del reverse proxy è già risolta da
`X-Accel-Buffering: no` (`server.js:63`), ma è stata verificata con l'implementazione attuale.

**Effort: 1-2 gg.** È il pezzo che il §6 di `confronto-cap-langgraph.md` stimava a 1 gg; lo tengo a 1-2
perché il consumo delle Promise di `ToolCallStream` dentro uno stream SSE non è codice che ho visto girare.

---

### Passo 5 — Cancellare il loop legacy — **punto di non ritorno formale**

**Cosa.** Dopo almeno una settimana con `BILLY_ENGINE=graph` in default su CF e i 35 verdi, si rimuove da
`agent.js`: la costante `TOOLS` (`:29-69`), `executeTool` (`:222-226`), `parseArgs` (`:228-234`),
`MAX_ITERATIONS` (`:20`), il ciclo `for` (`:295-356`) con la biforcazione stream/non-stream e la gestione
di `tool_call_id`, la costruzione dell'`OrchestrationClient` e il dispatcher stesso. **≈ 200 righe.**

**Cosa resta**, e resta perché è business logic, non plumbing: `CERTIFICATION_WEIGHT_SQL` (`:10-16`),
`MAX_HISTORY_MESSAGES` (`:22`, è nel contratto), `loadSkillManifest()` (`:76-85`), `buildSystemPrompt()`
(`:91-118` — **verbatim**), `truncate()` (`:123-126`), `createSourceCollector()` (`:130-149`), i corpi di
`runSearchKnowledge` (`:151-186`) e `runLoadSkill` (`:188-220`), `sanitizeHistory()` (`:238-244`).
**≈ 160 righe su 363 sopravvivono**, spostate in `graph.js` o in un `tools.js` accanto.

**Verifica.** I 35 dopo la rimozione (il dispatcher potrebbe mascherare una dipendenza residua) + `npm
start` locale con `kind: sqlite` che non esplode all'avvio + `mbt build` + `cf deploy` + `curl` su
`askBilly` e `askBillyStream`, secondo la regola di progetto (verificare su CF, non con `cds watch`).

**Effort: 0,5 gg.** Reversibile con un `git revert`, ma da qui in poi ogni fix va scritto due volte se si
vuole tenere viva l'alternativa: è il momento in cui si smette di avere un piano B a costo zero.

---

### Passo 6 — Client MCP (tier `application`) — *indipendente, parallelizzabile*

**Cosa.** `@langchain/mcp-adapters` 1.1.4, `MultiServerMCPClient`, per consumare i tool esposti da
applicazioni deployate a parte su CF. I tool arrivano già come `StructuredTool` LangChain e si aggiungono
alla lista passata a `bindTools()` — è il caso d'uso che rende utile il `tools` per-richiesta.

**Convivenza con il server MCP, verificata:** `@cap-js/mcp` 1.4.3 dipende da
`@modelcontextprotocol/{core,node,server}` **2.0.0**; `@langchain/mcp-adapters` dipende da
`@modelcontextprotocol/sdk` **^1.30.0**. Sono **pacchetti npm diversi**: convivono senza conflitto di
versione, al prezzo di due generazioni dell'SDK MCP nello stesso processo (disco, non semantica).

**Due vincoli da mettere per iscritto nel codice:**
- Billy **non deve** registrare `/mcp/billy` fra i propri server MCP: si chiamerebbe da solo, ricorsivamente.
- L'insieme dei tool remoti va **filtrato e nominato esplicitamente**, non ereditato in blocco da `tools/list`: un server esterno che espone 30 tool distrugge il routing delle skill.

**Verifica.** I 35 **con i tool remoti montati**: il punteggio non deve scendere. È la verifica che conta,
non il fatto che la chiamata remota funzioni. In più: un caso nuovo che esercita il tool remoto.

**Effort: 1-2 gg.** Dipende dal Passo 3 (serve il grafo), non dal 4 né dal 5.

---

### Passo 7 — Checkpointer persistente su HANA — *indipendente, parallelizzabile*

**Prima, il chiarimento che evita lavoro inutile: per la chat non serve.** Il contratto è stateless
(API-CONTRACT §1.1: il client manda `history`, il server tiene gli ultimi 20 messaggi e nient'altro), e
`Joule-ProCode` in produzione usa `MemorySaver`, che non persiste. Introdurre un checkpointer nella chat
significherebbe cambiare il contratto verso il frontend per un beneficio che oggi non c'è.

**Serve invece per il piano di lavoro della Factory**, dove lo stato (lo `spec.json` in costruzione, la
todo list, i file del VFS) deve sopravvivere al giro HTTP, al restart dell'app e allo scale-out su più
istanze CF — tre cose che `MemorySaver` non fa.

**Cosa esiste, verificato sul registry:** `@langchain/langgraph-checkpoint-postgres` 1.0.5,
`@langchain/langgraph-checkpoint-sqlite` 1.0.4, `MemorySaver` in-process. **Per HANA non esiste nulla in
JS** (in Python esiste solo un `langgraph-checkpoint-hana` community, un solo maintainer, non endorsed).

**L'interfaccia è piccola, e questo l'ho verificato invece di stimarlo.** `BaseCheckpointSaver`
(`@langchain/langgraph-checkpoint` 1.1.5, `dist/base.d.ts:57-77`) ha **5 metodi astratti**:
`getTuple(config)`, `list(config, options)` (async generator), `put(config, checkpoint, metadata,
newVersions)`, `putWrites(config, writes, taskId)`, `deleteThread(threadId)`. Più `getNextVersion()` e un
`serde` con default. Due entità CDS bastano: una per i checkpoint, una per le pending writes, con
`LargeString` per il payload serializzato.

**Stima onesta: 2-4 gg, con ±50% di incertezza.** I 5 metodi sono poco codice sopra `cds.run`; quello che
non ho prototipato è la serializzazione (`serde`), la semantica delle `channelVersions` e i filtri di
`list` (`before`, `limit`, `filter` sui metadata) — è lì che si nascondono le mezze giornate.

**Verifica.** Un test di integrazione su HANA che non passa dalla chat: creare un thread, scrivere un
checkpoint, riavviare il processo, rileggere lo stato, riprendere l'esecuzione. Più: due istanze CF che
leggono lo stesso `thread_id`.

---

### Passo 8 — Filesystem virtuale e `deepagents` — *il passo che va misurato due volte*

**Cosa.** `deepagents` 1.14.1 con `StateBackend` (il default), che dà `files` nello stato e i tool
`ls`/`read_file`/`write_file`/`edit_file`/`glob`/`grep`, più `write_todos` per il planning.

**Il rischio è esplicito e va detto prima di iniziare:** si passa da 2 tool a 10+. I 27/35 sono stati
ottenuti su un modello che sceglie fra `searchKnowledge` e `loadSkill`, con regole di prompt (3-9) scritte
per quel bivio. Non c'è alcuna garanzia — né alcun dato — che il routing regga quando accanto compaiono
sei tool di filesystem.

**Raccomandazione: non montare deepagents sull'agente di chat.** Confinarlo in un **sotto-agente della
Factory**, invocato dal grafo principale come un tool solo quando il compito lo richiede. L'agente di chat
resta a due tool e resta misurato. È anche il modo in cui il costo si contiene (§4.7).

**Dipendenze che entrano:** `deepagents` richiede come peer `langchain` ^1.5.10, `@langchain/langgraph-sdk`
e **`langsmith`** (>=0.7.1 <0.10.0), senza `peerDependenciesMeta` che lo marchi opzionale. `langsmith` non
chiama casa se non è configurato, ma **va impostato esplicitamente `LANGSMITH_TRACING=false` e
`LANGCHAIN_TRACING_V2=false` fra le env var di `billy-srv`**: una variabile d'ambiente lasciata a caso su
un container CF che manda tracce a un SaaS esterno è un incidente di sicurezza, non un bug.

**Verifica.** I 35, due volte: una con il sotto-agente Factory **registrato ma non usato** (misura la
diluizione del solo tool `task` in più) e una con un caso nuovo che lo esercita. Se la prima passata cala
sotto 26, il sotto-agente va tolto dall'insieme di tool di default e invocato per rotta esplicita.

**Effort: 2-4 gg.**

---

### Passo 9 — Sotto-agenti e la categoria di asset `agent`

**Cosa.** È lavoro di dominio: costa uguale in qualsiasi architettura, ed è probabilmente la cosa di
maggior valore del piano.

**Schema** (`db/schema.cds`): aggiungere `agent` a `AssetType` (l'enum ha già `tool`, `application`,
`interface`). L'asset `agent` riusa i campi esistenti: `content` = il system prompt, `description` = la
riga di manifesto per la scelta. Serve in più l'elenco di ciò che può usare. Due opzioni:
- **JSON in `content`** (prompt + `allowedSkills[]` + `allowedMcpTools[]`): zero modifiche allo schema, zero migrazione HDI, ma nessuna integrità referenziale verso gli `Asset` skill;
- **entità `AgentCapability`** (`agent` → `Asset`, `skill` → `Asset`, `mcpToolName`): pulita, referenziale, costa una migrazione.

Raccomando la seconda: il ciclo upload → revisione → certificazione deve poter *rivedere* cosa un agente
ha il permesso di usare, e su una stringa JSON non si revisiona.

**Come si realizza il sotto-agente.** Un asset `agent` diventa, a runtime, un `tool()` il cui `func`
invoca un grafo figlio con: il prompt dell'asset, **solo** le skill dichiarate (montate con `bindTools()`
per-richiesta — è esattamente ciò che l'Orchestration Service impediva) e un `recursionLimit` proprio.
Questo è anche l'unico posto dove **un tool per skill** ha senso (§4.2): l'insieme è piccolo, dichiarato e
già selezionato.

**Come si limita profondità e costo.** Il conto va fatto: un sotto-agente a 5 giri dentro un padre a 5 giri
sono 25 chiamate al modello e, con gpt-5.5 reasoning, decine di secondi. Tre limiti, tutti da scrivere a
mano perché la libreria non li impone:
1. **profondità massima 1** — un sotto-agente non può invocarne un altro. Si applica non passando il tool `task`/`agent` nella lista del figlio;
2. **budget di chiamate condiviso** — un contatore nello stato del grafo, decrementato dal padre e dai figli, non un `recursionLimit` indipendente per ciascuno;
3. **timeout complessivo** sulla richiesta HTTP, con chiusura pulita dello stream SSE (evento `error`), perché il timeout del reverse proxy CF arriva comunque.

**Verifica.** Un set di prova **nuovo e separato** per gli agenti (i 35 misurano il routing delle skill,
non la delega), più i 35 invariati come controllo di non regressione.

**Effort: 3-5 gg.**

---

### Ordine e parallelizzazione

```
Passo 0 (cancello, altro agente)
   |
Passo 1  banco di prova ........................ blocca tutto
   |
Passo 2  gpt-5.5, motore invariato ............. VALORE AUTONOMO
   |
Passo 3  grafo minimo, 2 tool ..................
   |
   +-----+-----------------+-------------------+
   |     |                 |                   |
Passo 4  Passo 6        Passo 7            Passo 9 (parte schema)
streaming  client MCP   checkpointer HANA   entità AgentCapability
   |                       |                   |
Passo 5  cancellazione legacy <-- PUNTO DI NON RITORNO FORMALE
   |
Passo 8  VFS / deepagents (sotto-agente Factory)
   |
Passo 9  categoria agent (parte runtime) <-- PUNTO DI NON RITORNO REALE
```

**Realmente parallelizzabili su agenti diversi**: 6, 7 e la parte di schema del 9, perché non toccano
`graph.js`. Il 7 in particolare si scrive e si testa **contro `BaseCheckpointSaver` da solo**, senza che
esista il grafo. **Non parallelizzabili**: 1 → 2 → 3 → 4 → 5 sono una catena, e ogni anello ha come
criterio di uscita una misura sui 35 che il successivo dà per acquisita.

---

## 4. Approfondimenti per area

### 4.1 Tool e binding — il presupposto è confermato sui tipi

Questo è il punto che `confronto-cap-langgraph.md` §6.1 indicava come *"l'unica cosa che i documenti non
risolvono"*. Verificato leggendo il pacchetto installato, non la documentazione:

- **`@sap-ai-sdk/langchain` → `AzureOpenAiChatClient`**: `bindTools(tools, kwargs)` non riconfigura il client, fa `this.withConfig({ tools: newTools, ...kwargs })` (`dist/openai/chat.js:77-90`), cioè **opzioni di chiamata**. E `mapLangChainToAiClient` mette entrambe nel body di ogni richiesta:

  ```js
  tools: options?.tools?.map(t => mapToolToOpenAiTool(t)),
  tool_choice: options?.tool_choice        // dist/openai/util.js:240-241
  ```

  `AzureOpenAiChatCallOptions` include `tool_choice` per costruzione (`dist/openai/types.d.ts`, `Pick<AzureOpenAiChatCompletionParameters, ... 'tool_choice' ...>`). Prova indiretta ma forte che il percorso funzioni end-to-end: `withStructuredOutput(..., {method:'functionCalling'})` dello stesso SDK **forza un tool per nome** con `tool_choice: {type:'function', function:{name}}` (`chat.js:158-165`).
  **Conclusione: tool per-richiesta SÌ, `tool_choice` SÌ, forzatura per nome SÌ.** Confermato sui tipi e sull'implementazione; la conferma sul filo è in `billy-smoketest/test-gpt55-bindtools-toolchoice.js` e `test-gpt55-toolchoice-forced-byname.js`, già scritti dall'altro agente.

- **`@sap-ai-sdk/langchain` → `OrchestrationClient` (versione LangChain)**: `bindTools()` **esiste** e i tool vengono uniti per-chiamata a quelli del template (`dist/orchestration/client.js:99-105`, `:283-294`) — quindi il limite "tools fissati alla costruzione" **cade anche via Orchestration**. Ma `OrchestrationCallOptions` **non ha `tool_choice`**, e nel sorgente c'è il commento esplicito: `// TODO: Set 'tool_choice' if it becomes supported in Orchestration` (`client.js:137`).
  **Conclusione: restando su Claude via Orchestration si otterrebbe metà del beneficio.** La scelta di gpt-5.5 via `AzureOpenAiChatClient` è quindi tecnicamente motivata, non solo preferenza.

- **Traduzione dei due tool.** `searchKnowledge` → `z.object({ query: z.string().describe(...) })`, `loadSkill` → `z.object({ skillId: z.string().describe(...) })`. Le `description` vanno copiate verbatim da `agent.js:35-37` e `:54-56`. La validazione Zod **rimpiazza** `parseArgs()` (`:228-234`) e i controlli `typeof args.query === 'string'`: attenzione, oggi un JSON malformato torna al modello come messaggio `tool` recuperabile (`:332-335`); con Zod diventa un `ToolException`, che va configurata per tornare al modello e **non** per far cadere il grafo. Stesso discorso per i ritorni-errore già presenti nei due tool (`:200`, `:203-206`), che sono stringhe di ritorno, non eccezioni, e vanno lasciati tali.

### 4.2 Skill e manifesto — quattro strade, una raccomandazione

| Strada | Come | Pro | Contro | Verdetto |
|---|---|---|---|---|
| **A. Manifesto + `loadSkill`, invariato** | Quello che c'è oggi | Zero rischio sul routing; è l'unica che rende l'A/B del Passo 3 un esperimento pulito; le regole 3-9 mantengono il loro referente ("l'elenco è solo un indice") | Non sfrutta `tool_choice`; l'elenco cresce linearmente col catalogo | **Raccomandata per i Passi 1-5** |
| **B. Un `tool()` per skill** | 22 tool generati dal catalogo | `tool_choice` può forzare una skill; nessun "indice" da spiegare | 22 tool accanto a `searchKnowledge` = la diluizione che la taratura ha combattuto. Le regole 3, 5 e 9 parlano di un indice che non esisterebbe più: andrebbero **riscritte**, e sono +5 punti misurati | **No sulla chat.** **Sì dentro un asset `agent`** (§3, Passo 9), dove l'insieme è piccolo e già scelto |
| **C. `skills` middleware di deepagents** | Skill come `/skills/<nome>/SKILL.md` con frontmatter `name`/`description`; il middleware inietta l'indice, il corpo si legge con `read_file` | È **la stessa progressive disclosure** di oggi, fatta dalla libreria; gratis con deepagents | Il testo dell'indice lo scrive la libreria, non è quello tarato; il caricamento passa da `read_file` generico invece che da `loadSkill` con la sua description; **le 22 skill andrebbero migrate** da `Asset.content` a file SKILL.md; la convenzione `similarity: null` per le fonti-skill (API-CONTRACT §1.1) andrebbe ricostruita dai path | **Solo dentro il sotto-agente Factory**, mai come sostituto del manifesto principale |
| **D. Manifesto top-N per embedding** | Recuperare le N description più vicine invece di elencarle tutte — **già previsto** nel commento a `agent.js:73-75` | Scala a centinaia di skill; **l'interfaccia verso il modello non cambia**, quindi le regole 3-9 restano valide parola per parola | Introduce un errore di recupero a monte della scelta del modello: una skill non recuperata è invisibile | **Quando il catalogo cresce**, e indipendentemente da LangGraph. 1-2 gg |

**Raccomandazione secca: A nei Passi 1-5, D quando il catalogo supera le ~40 skill, B solo dentro gli
asset `agent`, C solo dentro il sotto-agente Factory.** Il manifesto attuale non è un dettaglio di
implementazione da modernizzare: è il risultato di una misura, ed è l'unica parte del sistema di cui si
conosce il valore numerico.

### 4.3 MCP nei due versi

**Server — si tiene così, e non è una speranza: è una conseguenza.** `@cap-js/mcp` genera i tool dalle
annotazioni sul *modello CDS* (`@protocol: ['rest','mcp']` + `@mcp.instructions` in
`billy-service.cds:39-40` e `catalog-service.cds:130-131`, con `cds.mcp.per_action_tool` in
`package.json`). Non ispeziona l'handler. Quando `onAskBilly` (`billy-service.js:14`) chiamerà il grafo
invece del loop, la definizione del tool MCP sarà **byte per byte la stessa**. L'unico vincolo, già
scritto nel commento a `billy-service.cds:17-21`, è che `askBilly` resti **non-streaming**: il grafo deve
quindi essere invocabile con `.invoke()` oltre che con `.stream()` — previsto dal Passo 3.

**Client — §3, Passo 6.** L'unica cosa che vale la pena ripetere qui è la convivenza: due generazioni di
SDK MCP (`@modelcontextprotocol/{core,node,server}` 2.0.0 lato CAP, `@modelcontextprotocol/sdk` ^1.30 lato
adapters) nello stesso `node_modules`. Nessun conflitto npm, nessun tipo condiviso.

### 4.4 RAG — non cambia nulla, e deve restare così

`runSearchKnowledge` (`agent.js:151-186`) diventa il `func` di un `tool()`. La query `cds.run` con
`COSINE_SIMILARITY`, la `TOP 3`, il `WHERE c."CERTIFICATIONLEVEL" != 'deprecated'` e la costante
`CERTIFICATION_WEIGHT_SQL` (`:10-16`) **non cambiano di un carattere**. La pesatura per certificazione
(1.0 / 0.75 / 0.35, `architecture.md` §4, D10) è business logic certificata, non un parametro di tuning
del motore agentico.

Chi la esegue: il tool, in-process, sul pool HANA di CAP — è il vantaggio principale della Strada D
rispetto alla B, dove ogni `searchKnowledge` costerebbe un attraversamento HTTPS (3-10 per domanda).

L'unico punto di attenzione è la **raccolta delle fonti**. Oggi il collector è una closure passata come
secondo argomento (`:177-183`, `:208-217`). In LangGraph un tool restituisce una stringa: o (a) si crea il
collector dentro `runAgent` e lo si cattura in una tool-factory che costruisce i due `tool()` per ogni
invocazione, oppure (b) si aggiunge un canale `sources` allo stato e i tool restituiscono un `Command`.
**Raccomando (a)**: costa nulla, preserva `createSourceCollector()` com'è, e non introduce stato dove il
contratto dice che non ce n'è. Il costo è ricostruire i due `tool()` ad ogni richiesta invece di una volta
sola — irrilevante rispetto a una chiamata LLM.

### 4.5 Filesystem virtuale — cosa è, cosa non è, e no, il Python non ci gira

**Cosa è.** Un campo `files` dentro lo stato del grafo: un oggetto JavaScript
`{ "/spec.json": { content: [...], created_at, modified_at } }`. I tool `ls`, `read_file`, `write_file`,
`edit_file`, `glob`, `grep` leggono e scrivono quell'oggetto. Con `StateBackend` — il **default** di
`createDeepAgent` — vive in RAM per la durata dell'esecuzione, e sopravvive fra un turno e l'altro **solo
se c'è un checkpointer** (§3, Passo 7).

**Cosa non è.** Non è un disco: nulla viene scritto sul filesystem del container CF. Non è una sandbox.
Non è un interprete. **Non esegue niente: né Python, né JavaScript, né shell.** Sono sei funzioni che
manipolano un oggetto in memoria.

**Risposta diretta alla domanda "ci gira il Python?": no.** E aggiungo la parte scomoda, perché leggendo
la lista degli export di `deepagents` 1.14.1 si trovano due cose che *sembrano* dire il contrario:

- **`LocalShellBackend`** esegue davvero comandi di shell — sul container CF. Non è la soluzione: il `nodejs_buildpack` **non contiene un interprete Python**, il filesystem del container è effimero e non condiviso fra istanze, e quel processo ha in memoria le credenziali HANA e la `AICORE_SERVICE_KEY`. Dare a un LLM una shell lì dentro è una superficie di esecuzione di codice accanto ai segreti dell'applicazione. **Non va usato.**
- **`LangSmithSandbox`** è una sandbox remota ospitata da LangSmith: servizio esterno, dati che escono dal landscape. Fuori perimetro.

**Cosa risolve, allora.** Il problema reale che ha: accumulare lo `spec.json` della SAC Factory lungo una
conversazione senza intasare il contesto. Oggi, senza VFS, ogni versione intermedia dello spec dovrebbe
stare nella conversazione, e il contesto esplode dopo pochi fogli. Con il VFS il modello scrive
`/spec.json` con `write_file`, e ai turni successivi ne rilegge **solo la fetta che gli serve** con
`read_file` (che supporta offset/limit) o `grep`. È un magazzino fuori dal contesto, indirizzabile.

**Cosa non risolve.** Non produce il `.xlsx` (`17-render-excel` → openpyxl) e non fa il parsing del
`.pptx` (`03-bbp-extract` → python-pptx): entrambe marcate **"C — impossibile"** già in
`skill-routing-audit.md`. Quelle restano un servizio Python deployato a parte, che Billy raggiunge come
tool MCP (§3, Passo 6) — è precisamente il tier `application` della visione di prodotto. **Il VFS è dove
lo spec si compone, non dove si renderizza.**

### 4.6 Stato e checkpointer

Trattato al Passo 7. Il punto da non perdere: **per la chat non serve e non va introdotto**, perché
cambierebbe il contratto stateless verso il frontend (API-CONTRACT §1.1) in cambio di niente. Serve per la
Factory, dove lo stato deve sopravvivere al restart e allo scale-out — le due cose che `MemorySaver` non
fa, e che `Joule-ProCode` in produzione **non ha** (§3 di `confronto-cap-langgraph.md`).

Verificato: 5 metodi astratti, non "5 coppie"; nessun checkpointer HANA in JS; esistono Postgres 1.0.5 e
SQLite 1.0.4, entrambi inutili su BTP/HANA.

### 4.7 Sotto-agenti e categoria `agent`

Trattato al Passo 9. Le tre cose che contano e che la libreria **non** fa al posto tuo: profondità massima
1, budget di chiamate **condiviso** fra padre e figli (non un `recursionLimit` per ciascuno, che moltiplica
invece di limitare), timeout complessivo con chiusura pulita dell'SSE.

Un dettaglio utile trovato nei tipi: `createReactAgent` accetta `llm` **come funzione dello stato**
(`dist/prebuilt/react_agent_executor.d.ts:61`). Significa che il set di tool di un asset `agent` si può
legare per-turno in funzione dello stato, senza deepagents e senza ricompilare il grafo.

### 4.8 Streaming

Trattato al Passo 4. Il rischio non è la mappa degli eventi, che i tipi coprono bene: è che **gpt-5.5, da
reasoning model, non emetta testo prima della tool call**. In quel caso gli eventi `delta` prima di un
`tool` semplicemente non arrivano: il contratto non si rompe (il frontend azzera comunque l'anteprima alla
ricezione di `tool`, API-CONTRACT §1.2), ma **l'UX dello streaming si svuota** — l'utente vede la rotellina
finché non parte la risposta finale. Va misurato al Passo 2, dove il modello cambia e il motore no, così la
causa è isolata.

### 4.9 Dove vive il grafo, e la trappola ESM/CJS

**Dove.** `srv/lib/graph.js`, chiamato da `billy-service.js` (action, non-streaming, anche tool MCP) e da
`server.js` (rotta SSE), esattamente come oggi `agent.js`. Il grafo si compila **una volta** (modello +
tool sono statici); il **system prompt no**, perché `loadSkillManifest()` interroga il catalogo e
l'insieme delle skill pubblicate cambia: entra come `SystemMessage` ad ogni invocazione.

**ESM/CJS — verificato, non assunto.** Il progetto è `"type": "commonjs"` (`package.json:6`) e
`@sap-ai-sdk/*` è ESM-only, da cui gli `await import()` in `ai.js:26`/`:38` e `agent.js:264`.

Ho verificato caricando davvero i pacchetti con `createRequire` su Node 22.20: **`@langchain/core` 1.2.13,
`@langchain/langgraph` 1.4.18, `@langchain/langgraph-checkpoint` 1.1.5, `deepagents` 1.14.1 e
`@langchain/mcp-adapters` 1.1.4 espongono tutti una condizione `require` con build `.cjs`.** Da CommonJS
funzionano con un `require()` normale. Nessun problema. (Curiosità utile ma da non usare come architettura:
su Node 22.20 anche `require('@sap-ai-sdk/langchain')` riesce, perché `require(esm)` è attivo di default da
Node 22.12. Meglio restare sulla convenzione `await import()` già in repo: costa zero e non dipende dalla
minor version del buildpack.)

**La trappola vera è un'altra, ed è quella che fa perdere giorni: la dual package hazard.** Se si carica
`@langchain/core` via `require()` (build CJS) e `@sap-ai-sdk/langchain` via `await import()` (build ESM),
quest'ultimo importerà **la sua copia ESM** di `@langchain/core`. Nel processo esistono allora **due
istanze distinte** delle stesse classi: `AIMessage`, `ToolMessage`, `BaseChatModel`. I controlli
`instanceof` e i type-guard interni (`isBaseMessage`, il riconoscimento degli schemi di tool) falliscono in
modo silenzioso e non deterministico — un tool che non viene riconosciuto come tale, un messaggio che non
viene mappato.

**Regola da scrivere in testa a `graph.js`: tutti i pacchetti LangChain e SAP AI SDK si caricano con
`await import()`, nessuno con `require()`.** Un solo grafo di moduli ESM. `graph.js` resta un file
CommonJS che espone una `runAgent` asincrona, e fa gli import dinamici una volta sola, memoizzati.

Ultimo punto su CF: **`billy-srv` ha `memory: 256MB`** (`mta.yaml:22`). I soli `@langchain/*` pesano 25 MB
su disco; con `langchain`, `deepagents`, `langsmith`, `zod` e l'SDK MCP v1 si arriva verosimilmente a
60-90 MB da parsare all'avvio. `disk-quota: 1024MB` regge; **256 MB di heap probabilmente no**, e un OOM su
CF si manifesta come restart del container, non come errore leggibile. Va misurato al Passo 3 e messo a
budget un `memory: 512MB`.

### 4.10 Cosa si cancella, riga per riga

Dettagliato al Passo 5. In sintesi: **≈ 200 righe via, ≈ 160 righe restano** delle 363 di `agent.js`. Non
si butta il 6% del codice: se ne butta poco più della metà, e la metà che resta è quella che contiene le
decisioni di prodotto (pesatura per certificazione, manifesto, regole 3-9, convenzione `similarity: null`,
tetto di 20 messaggi di storico).

---

## 5. Risposte alle sei domande

**1. Qual è l'ordine dei passi, e quali sono indipendenti?**
Catena obbligata: **0 → 1 → 2 → 3 → 4 → 5**. Ogni anello ha come criterio di uscita una misura sui 35 che
l'anello successivo dà per acquisita, quindi non si comprimono. **Parallelizzabili su agenti diversi dopo
il Passo 3**: il 6 (client MCP), il 7 (checkpointer HANA — scrivibile e testabile anche *prima*, contro
`BaseCheckpointSaver` da solo) e la parte di schema del 9 (`AssetType` + `AgentCapability`, puro CAP). Il
Passo 8 va dopo il 5 perché è l'unico che rimette in discussione il routing.

**2. Qual è il primo passo che dà valore da solo?**
Il **Passo 2, il cambio a `gpt-5.5` a motore invariato.** È già deciso, non dipende da LangGraph, è
misurabile sugli stessi 35 casi, e fermandosi lì si ottiene comunque il modello nuovo e la caduta del muro
`tool_choice` a livello di client. Il Passo 1 (banco di prova) lo precede ma è infrastruttura: valore
altissimo come leva, nessun valore visibile all'utente. Nota onesta: il Passo 3 — il grafo minimo — **non**
dà valore utente da solo. Sostituisce 200 righe con una libreria e non cambia una virgola di ciò che
l'utente vede. Il suo valore è tutto opzione sul futuro (sotto-agenti, client MCP, VFS): va deciso per
quello, non aspettandosi un miglioramento immediato.

**3. Cosa non si può fare con LangGraph dentro CAP?**
Quattro cose, e tutte e quattro richiedono comunque un servizio separato:
- **Eseguire il Python di `sacfactory/`** (openpyxl, python-pptx). Il `nodejs_buildpack` non ha un interprete Python; `LocalShellBackend` girerebbe sul container con le credenziali dell'app e un FS effimero. → App CF separata, esposta come tool MCP (tier `application`).
- **Lavori asincroni più lunghi della richiesta HTTP.** CF chiude la connessione, CAP non ha un job runner. Gli `AsyncSubAgent` di deepagents (campo `graphId`) presuppongono LangGraph Server/Platform. → Worker separato.
- **Human-in-the-loop con `interrupt()` fra turni diversi.** Tecnicamente possibile con il checkpointer, ma richiede un contratto **stateful** verso il frontend (thread id, resume), mentre oggi API-CONTRACT §1.1 è esplicitamente stateless. → Non è un limite di LangGraph, è una modifica di contratto da decidere a parte.
- **Tracing LangSmith / LangGraph Studio.** SaaS esterno, dati fuori landscape. → Fuori perimetro, e da disattivare esplicitamente via env var.

**4. Dove il piano peggiora le cose?**
- **Passi 3-5: due motori in parallelo.** Il feature flag `BILLY_ENGINE` raddoppia le superfici e produce bug che si riproducono su un solo percorso. È temporaneo per costruzione, ma va chiuso: un flag che resta sei mesi è codice morto che sembra vivo.
- **Osservabilità, e questo peggiora in modo permanente.** Oggi il controllo di flusso sta in 363 righe leggibili, con `console.error` nei punti giusti (`agent.js:82`, `:343`). Domani sta dentro una libreria: diagnosticare *perché* il modello non ha chiamato `loadSkill` passa dal leggere `agent.js` al leggere i sorgenti di LangGraph. I log dei due tool sopravvivono; quelli del loop no.
- **`GraphRecursionError`.** Oggi al quinto giro si restituisce la risposta parziale con un messaggio onesto (`agent.js:353-355`); LangGraph lancia. Senza il `catch` che riproduce il comportamento, un caso degradato diventa un errore. Regressione vera, facile da non vedere.
- **Comportamenti impliciti che cambiano senza che il diff lo mostri**: la ricostruzione esplicita di `conversation` ad ogni giro (scelta deliberata, vedi il commento a `agent.js:283-286`), il troncamento a 8.000 caratteri per messaggio, l'ordine di esecuzione di tool call multiple nello stesso turno. Sono i dettagli in cui vive il delta fra 27/35 e 25/35.
- **Avvio e memoria.** 60-90 MB di JavaScript in più da parsare, su un container da 256 MB (§4.9).
- **Passo 8, se si sbaglia il perimetro.** Montare deepagents sull'agente di chat significa passare da 2 a 10+ tool nello stesso posto dove si misura il routing.
- **`langsmith` come peer obbligatorio** di deepagents: una dipendenza che parla con l'esterno se configurata male.

**5. Qual è il punto di non ritorno?**
Due, e vanno distinti.
- **Formale: il Passo 5.** Cancellato il loop legacy, tornare indietro è un `git revert` — ma da lì ogni fix va scritto due volte se si vuole tenere vivo il piano B. È il momento in cui il piano B smette di essere gratis.
- **Reale: il Passo 8/9.** Quando il catalogo comincia a contenere asset il cui formato ha senso solo dentro il framework — skill in `SKILL.md` con frontmatter, asset `agent` con la loro lista di capability, `Chunk`/`AgentCapability` popolati di conseguenza — non si torna più indietro con un revert: si torna indietro con una migrazione di dati. Fino al Passo 7 compreso, la migrazione è **una dipendenza npm dentro un file**, come dice `confronto-cap-langgraph.md` §5.5.

**6. Effort totale.**

| Passo | gg |
|---|---:|
| 1 — banco di prova versionato | 0,5-1 |
| 2 — gpt-5.5, motore invariato | 1-2 |
| 3 — grafo minimo, 2 tool | 2-3 |
| 4 — streaming rimappato | 1-2 |
| 5 — cancellazione del legacy | 0,5 |
| **Nucleo della migrazione (1-5)** | **5-8,5** |
| 6 — client MCP | 1-2 |
| 7 — checkpointer HANA | 2-4 |
| 8 — VFS / deepagents | 2-4 |
| 9 — categoria `agent` | 3-5 |
| **Totale** | **13-23,5** |

**13-24 giorni, incertezza ±40%**, coerente con la stima di 8-14 gg della Strada D in
`confronto-cap-langgraph.md` §4.D una volta aggiunti il banco di prova, il cambio modello e il client MCP,
che lì non erano contati. I **rapporti** fra le voci sono più affidabili dei valori assoluti. Le due voci
con l'incertezza più alta sono il **Passo 7** (±50%: nessuna implementazione JS esistente da cui copiare) e
il **Passo 2** (1 gg se il punteggio tiene, 2+ se gpt-5.5 richiede di ritarare un prompt scritto per
Claude). **Se il Passo 0 va male: 0 giorni di questo piano, e si passa ai 9-14 gg della Strada A.**

---

## 6. Rischi, per gravità

| # | Rischio | Perché è grave | Mitigazione | Passo |
|---|---|---|---|---|
| 1 | **Regressione silenziosa del routing.** Il grafo scende sotto 27/35 senza che nessuno se ne accorga | È l'unico numero che descrive la qualità del prodotto, ed è costato una taratura. Un calo non si vede in demo: si vede in una skill che non parte | Banco di prova **prima** del codice; A/B legacy↔graph nello stesso giorno; manifesto e regole 3-9 congelati nei Passi 1-5 | 1, 3 |
| 2 | **Diluizione da troppi tool** (deepagents: 2 → 10+) | Colpisce esattamente il meccanismo misurato, e il danno non è lineare né prevedibile | deepagents **confinato in un sotto-agente**, mai sull'agente di chat; misura con sotto-agente montato-ma-non-usato | 8 |
| 3 | **Dual package hazard ESM/CJS**: due copie di `@langchain/core` | Fallimenti `instanceof` silenziosi e non deterministici. È il tipo di bug che costa giorni perché non somiglia a un problema di moduli | Regola assoluta: **tutti** i pacchetti LangChain + SAP AI SDK via `await import()`, nessuno via `require()`. Un solo grafo ESM | 3 |
| 4 | **`gpt-5.5` non tiene il prompt tarato su Claude** | Mescola due variabili e può far bocciare LangGraph per colpa del modello | Passo 2 **prima** del Passo 3, così la causa è isolata; 1-2 gg di ritaratura a budget | 2 |
| 5 | **`GraphRecursionError` al posto della risposta parziale** | Un caso degradato diventa un errore visibile all'utente | `catch` esplicito che riproduce il testo di `agent.js:354`; caso di prova dedicato che forza 5+ giri | 3 |
| 6 | **OOM su CF**: 256 MB con 60-90 MB di dipendenze in più | Si manifesta come restart del container, non come errore leggibile | Misurare la RSS al Passo 3; `memory: 512MB` a budget in `mta.yaml` | 3 |
| 7 | **Lo streaming perde il preambolo** perché gpt-5.5 è un reasoning model | Non rompe il contratto, svuota l'UX: la rotellina torna | Verificare al Passo 2 su 5 casi; se confermato, valutare un evento `tool` anticipato come segnale di vita | 2, 4 |
| 8 | **Il contratto SSE cambia** senza che frontend e `API-CONTRACT.md` seguano | Il frontend è consumatore esterno: una modifica non dichiarata è un guasto in produzione | Diff degli eventi grezzi legacy↔graph su 5 casi; se qualcosa cambia, aggiornare `API-CONTRACT.md` **e** le view, e dichiararlo | 4 |
| 9 | **`langsmith` invia tracce all'esterno** | Peer obbligatorio di deepagents; una env var sbagliata fa uscire prompt e risposte dal landscape | `LANGSMITH_TRACING=false` e `LANGCHAIN_TRACING_V2=false` esplicite in `mta.yaml`, verificate sul container | 8 |
| 10 | **`deepagents` 1.14.1 è giovane** e non è mai stato provato in questo contesto | Un breaking change in una minor costa una giornata a caso | Pin esatto (`1.14.1`, non `^`), `package-lock.json` committato, aggiornamento solo dietro una passata dei 35 | 8 |
| 11 | **Il feature flag resta acceso per sempre** | Due motori da mantenere, bug che si riproducono su un percorso solo | Il Passo 5 ha una data, non una condizione: una settimana dopo il Passo 4 | 5 |
| 12 | **Due SDK MCP nello stesso processo** (v1 e v2) | Nessun conflitto npm verificato, ma disco e confusione diagnostica | Nessuna, se non saperlo e non mescolare i tipi | 6 |

---

## 7. Cosa resta incerto

1. **L'esito del confronto (Passo 0).** Tutto questo documento è condizionato. Non c'è una misura della replica LangGraph al momento della scrittura.
2. **Se `gpt-5.5` tenga i 27/35 con un prompt scritto per Claude 4.6.** È la variabile non misurata più grande del piano, vale ±5 punti (il delta della taratura documentato in `causa-a-fix.md`) e **non dipende da LangGraph**. Va misurata al Passo 2, non dopo.
3. **Se `gpt-5.5` emetta `delta` prima delle tool call.** I tipi mostrano che l'SDK mappa `tool_call_chunks` in streaming (`dist/openai/util.js:262-266`); cosa il modello *scelga* di emettere è un'altra cosa.
4. **Il costo reale del checkpointer HANA.** I 5 metodi astratti sono verificati; `serde`, semantica delle `channelVersions` e filtri di `list` non sono prototipati. ±50%.
5. **La memoria reale su CF con le nuove dipendenze.** 25 MB su disco per i soli `@langchain/*` sono misurati; l'heap a runtime no.
6. **L'effetto di `deepagents` sul routing.** Zero dati. È il motivo per cui il Passo 8 sta dopo il 5 e non prima.
7. **Se `@cap-js/mcp` continui a generare `askBilly` correttamente** quando l'handler diventa un grafo asincrono. Molto probabile (legge il modello CDS), non testato.
8. **Il rumore della misura.** ±2 casi, una passata per caso, routing LLM non deterministico (`skill-routing-results.md`, appendice). Un delta di 1-2 punti **non è un segnale**: chi legge i risultati dei passi deve saperlo prima di leggerli, altrimenti il piano si ferma o prosegue per rumore.
9. **Tre verifiche di questo documento sono state fatte sui tipi e sull'implementazione dei pacchetti, non contro AI Core su CF**: che `tool_choice` sia accettato dal deployment `gpt-5.5` reale, che la forzatura per nome sia rispettata, e che `bindTools()` con set diversi non "sporchi" chiamate successive. Gli smoke test che rispondono a tutte e tre sono già scritti in `billy-smoketest/` (`test-gpt55-bindtools-toolchoice.js`, `test-gpt55-toolchoice-forced-byname.js`) e vanno eseguiti prima del Passo 3.
