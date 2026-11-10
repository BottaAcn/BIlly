# Billy × LangGraph JS — perché e come

Documento tecnico standalone sulla migrazione al framework agentico. Per il quadro completo dello stack vedi [stack-tecnologico.md](stack-tecnologico.md).

---

## In una frase

> Billy è passato da un tool loop di ~350 righe scritte a mano a `createReactAgent` di LangGraph JS, mantenendo lo stesso system prompt, gli stessi due tool e lo stesso contratto SSE — perché il motivo del cambio è l'architettura futura (sotto-agenti, checkpointer persistente, tool binding dinamico), non l'accuratezza.

---

## 1. Perché abbiamo cambiato

### Il vincolo dell'Orchestration Service

Il motore precedente usava `@sap-ai-sdk/orchestration` con Claude via Generative AI Hub. L'Orchestration Service ha un limite strutturale: **i `tools` si dichiarano alla costruzione del client**, non per singola richiesta. Non esiste `tool_choice` per-richiesta.

Conseguenza concreta:
- Non è possibile variare il set di strumenti in base alla domanda (es. dare strumenti diversi a sotto-agenti)
- Non è possibile forzare il modello a usare un tool specifico su una specifica iterazione
- Non è possibile costruire un sotto-agente con un sottoinsieme delle skill disponibili

### Il modello nuovo: `gpt-5.5`

Il resource group `team-ai-contest-3` ha un deployment di `gpt-5.5` (reasoning model Azure OpenAI). `@sap-ai-sdk/langchain` espone `AzureOpenAiChatClient`, che passa `tools` e `tool_choice` **per singola chiamata** — esattamente quello che serviva.

Vincolo di `gpt-5.5` da conoscere: rifiuta `temperature` e `top_p` (accetta solo il default). Ogni run è quindi non deterministica per definizione.

### Il framework: perché LangGraph e non altri

| Framework | Motivo per non sceglierlo |
|---|---|
| Tool loop a mano (agent.js) | Da mantenere come fallback, ma non scala: ogni nuova funzionalità richiede codice di plumbing (stato, memoria, sotto-agenti) |
| LangChain Expression Language (LCEL) | Più adatto a pipeline lineari; LangGraph è il layer per grafi con stato |
| CrewAI / AutoGen | Multi-agent framework con opinioni forti sulla struttura; overkill per il ciclo modello→tool di Billy |
| `deepagents` | Valutato: astrazione ulteriore su LangGraph, ma non necessaria dato che `createReactAgent` basta |
| **LangGraph JS** | `createReactAgent` è la primitiva giusta: ciclo React (Reasoning + Acting), stato gestito, `streamEvents` nativo, checkpointer intercambiabile |

---

## 2. Cosa è cambiato e cosa no

### Invariato

| Elemento | Nota |
|---|---|
| System prompt | Stesso di agent.js, regole numerate comprese. Riscritto = benchmark invalidato |
| Tool `searchKnowledge` | Stessa SQL pesata per certificazione, stessa description |
| Tool `loadSkill` | Stessa logica, stessa description |
| Firma `runAgent({question, history, onEvent, signal})` | I due motori sono intercambiabili |
| Contratto eventi SSE (`tool`, `result`, `delta`, `answer`, `error`) | Il frontend non sa quale motore sta usando |
| Numero massimo di iterazioni | `MAX_ITERATIONS = 5` → `recursionLimit = MAX_ITERATIONS * 2 + 1 = 11` (ogni giro modello→tool costa 2 passi nel grafo) |

### Cambiato

| Elemento | Prima | Dopo |
|---|---|---|
| LLM | Claude via Orchestration Service | gpt-5.5 via `AzureOpenAiChatClient` |
| Tool binding | Fisso alla costruzione del client | Per-richiesta (passato a `createReactAgent`) |
| Ciclo agentico | While loop a mano in agent.js | `createReactAgent` + `streamEvents` |
| Gestione stato | Variabili locali nella closure | Stato LangGraph (messages array gestito dal framework) |
| Streaming eventi | Parsing manuale della risposta OpenAI | `on_tool_start`, `on_tool_end`, `on_chat_model_end` via `streamEvents` |
| RAM `billy-srv` | 256 MB | 1.024 MB (albero LangChain ~90 MB extra) |

---

## 3. L'architettura di graph.js

```js
// Le funzioni di query (SQL, embedding, logica di business) vengono da agent.js.
// graph.js non le ridefinisce: importa TOOLS, runSearchKnowledge, runLoadSkill.

const tools = [
  tool(async (args) => runSearchKnowledge(args, sources), {
    name: 'searchKnowledge',
    description: spec.searchKnowledge.description,  // verbatim da agent.js
    schema: spec.searchKnowledge.parameters
  }),
  tool(async (args) => runLoadSkill(args, sources), { ... })
];

const agent = createReactAgent({
  llm: await createChatModel({ streaming: false }),  // ← workaround bug SDK
  tools,
  prompt: buildSystemPrompt(skills)  // stessa funzione di agent.js
});

// streamEvents rimappa gli eventi LangChain sul contratto SSE di API-CONTRACT.md
const stream = agent.streamEvents({ messages }, { version: 'v2' });
for await (const event of stream) {
  if (event.event === 'on_tool_start')    emit({ type: 'tool', ... });
  if (event.event === 'on_tool_end')      emit({ type: 'result', ... });
  if (event.event === 'on_chat_model_end') answer = extractText(event.data.output);
}
```

### Il selettore engine.js

```js
// BILLY_ENGINE=graph   → graph.js (default)
// BILLY_ENGINE=legacy  → agent.js (fallback manuale o in caso di bug)
function selectEngine() {
  return engineName() === 'legacy' ? require('./agent') : require('./graph');
}
```

`billy-service.js` e `server.js` non chiamano mai `agent.js` direttamente: passano sempre da `engine.js`. Il fallback è automatico: se `graph.js` lancia un'eccezione al `require()`, `server.js` ricade su `./lib/agent`.

---

## 4. Il bug risolto: streaming crash su chunk finale

Durante lo streaming, `gpt-5.5` invia un chunk finale contenente solo `usage` (token count) senza `delta`. Il metodo `getDeltaToolCalls` di `@sap-ai-sdk/foundation-models` legge `this.data.delta.tool_calls` su quel chunk e crasha con `TypeError: Cannot read properties of undefined (reading 'tool_calls')`.

**Workaround**: creare il modello con `streaming: false` anche nel path SSE. LangGraph continua a emettere eventi via `streamEvents` (tool start/end, answer finale), ma non emette `on_chat_model_stream` — quindi nessun evento `delta` token-by-token. La risposta arriva intera alla fine invece che carattere per carattere.

```
Prima:  [token][token][token]…[token][risposta completa]   ← streaming vero
Dopo:   [tool: searchKnowledge][tool: loadSkill][risposta completa]  ← tool events + answer
```

Il comportamento è visivamente accettabile: l'utente vede i tool in progress e poi la risposta.

**Stack del crash** (per riferimento futuro, nel caso il bug venga fixato nell'SDK):
```
getDeltaToolCalls (azure-openai-chat-completion-stream-chunk-response.js:38)
  ← _processToolCalls (azure-openai-chat-completion-stream.js:41)
    ← _processFinishReason (azure-openai-chat-completion-stream.js:80)
      ← _processTokenUsage (azure-openai-chat-completion-stream.js:114)
        ← AzureOpenAiChatClient._streamResponseChunks (chat.js:256)
```

Quando `@sap-ai-sdk/foundation-models` lo risolverà (guarda se `this.data.delta` è definito prima di accedere a `.tool_calls`), si potrà rimettere `streaming: true` in `createChatModel` e recuperare il token-by-token.

---

## 5. Cosa abilita LangGraph che prima non c'era

### Sotto-agenti (`agent` asset type)

Un asset di tipo `agent` è un system prompt + una lista di skill/applicazioni. Può essere invocato come sotto-agente con un set di strumenti isolato. `subagent.js` gestisce la definizione; `graph.js` inietta la funzione `invoke` (il modello non sa come costruire LLM).

```
utente → Billy (graph.js, tools: searchKnowledge + loadSkill + runSubAgent)
                  └→ sotto-agente X (graph.js ricorsivo, tools: subset specifico)
```

### Tool binding dinamico

Con `AzureOpenAiChatClient` i tool si passano a `createReactAgent` una volta, ma il set può essere diverso per ogni invocazione. Un sotto-agente può avere tool diversi dall'agente principale senza costruire un client nuovo.

### MCP client (`application` asset type)

`mcp-client.js` scopre i tool esposti da `Asset.externalLink` a runtime. Cache per-asset di 5 minuti; anti-tool-poisoning: ogni risultato di un tool MCP esterno è avvolto in `<<<MCP_RESULT provenienza=... certificazione=...>>>` — trattato come dati, non come istruzioni.

### Checkpointer (in lavorazione)

Le tabelle `WorkSession`, `WorkCheckpoint`, `WorkCheckpointWrite` su HANA sono create. L'implementazione dei 5 metodi `BaseCheckpointSaver` (`getTuple`, `list`, `put`, `putWrites`, `getNextConfig`) è il prossimo passo: permette a Billy di riprendere una conversazione da un nuovo processo CF, non solo dalla memoria in-process.

---

## 6. Il benchmark e la conclusione sull'accuratezza

Misura eseguita sul banco dei 35 casi (`billy-app/test/run-35.js`):

| Configurazione | Punteggio |
|---|---|
| LangGraph JS + gpt-5.5 | 28/35 |
| Tool loop a mano + gpt-5.5 | 27/35 |
| Tool loop a mano + Claude via Orchestration | 27/35 |

**Il +1 è rumore**: `gpt-5.5` rifiuta `temperature`/`top_p`, ogni run è non deterministica.

**Conclusione**: il framework non sposta l'accuratezza. I 6 fallimenti duri (casi 7, 10, 11, 12, 13, 30) sono identici in tutte e tre le configurazioni. Sono problemi di descrizione delle skill nel catalogo, non problemi di runtime. La leva per migliorare il routing è riscrivere quelle descrizioni (o spubblicare le skill che non funzionano), non cambiare motore.

**Perché migrare allora?** Per le capacità, non per l'accuratezza corrente: sotto-agenti, tool binding dinamico, checkpointer persistente, metà del codice di plumbing. Queste servono per la SAC Design Factory e per il tipo di asset `agent`.
