# Billy — discorsi di presentazione, variante 3 (taglio tecnico)

Terza variante, per un pubblico di ingegneri: giuria tecnica, architetti, colleghi che scrivono codice. Non sostituisce [v1 (empatica)](discorsi-billy.md).

**La regola di questo registro: si raccontano le scelte e il loro prezzo, non i vantaggi.** Un pubblico tecnico non si conquista dicendo che una cosa è potente — si conquista dicendo cosa hai scartato, perché, e cosa ti è costato. I numeri sono tutti veri e verificabili nel repo: se ne citi uno, deve reggere alla domanda successiva.

Durate: **280-320** parole per 2,5 minuti · **550-620** per 5 · **1.100-1.250** per 10.

---

# Discorso 1 v3 — 2,5 minuti

> **Quando usarlo:** giuria tecnica, poco tempo, vuoi stabilire credibilità in trenta secondi. Se puoi, proietta la riga di SQL mentre la leggi.

Vi risparmio il pitch e parto da una riga di codice. [pausa]

Il cuore di Billy è questo: la somiglianza semantica tra la domanda e un pezzo di documento, **moltiplicata** per quanto ci si può fidare di quella fonte. Certificata, per uno. Scaduta, per zero-virgola-settantacinque. Non validata, per zero-virgola-trentacinque. Deprecata: esclusa proprio, non penalizzata.

Il punto è che non è un filtro applicato dopo il recupero. Sta dentro l'ordinamento, nella stessa query. Un documento certificato può battere uno più pertinente ma non validato — ed è esattamente quello che volete quando la risposta finisce davanti a un cliente.

Questa è la ragione per cui non abbiamo usato un RAG chiavi in mano: nessun prodotto generico sa cosa significa "certificato" a casa vostra.

Seconda scelta: **i vettori stanno dentro HANA**. Colonna vettoriale da tremilasettantadue dimensioni, funzioni di similarità native. Niente database vettoriale esterno, niente secondo sistema da tenere sincronizzato. Ogni pezzo di testo è una riga con una chiave esterna verso l'asset: Billy cita una fonte con un link preciso, non con "un documento dice che".

Terza: **le skill non si spezzettano**. Un documento lo dividi e ne recuperi i pezzi; una skill la carichi intera e la esegui. Nel contesto iniziale mettiamo solo titolo e descrizione — il corpo arriva soltanto se il modello decide di usarla.

Quarta: **il motore è LangGraph JS**. Ci siamo costruiti il loop agentico a mano, ~trecentocinquanta righe. Poi ci siamo accorti che l'Orchestration Service di SAP fissa i tool alla costruzione del client — non per singola richiesta. Quindi non potevamo dare tool diversi a sotto-agenti diversi. LangGraph risolve questo, con `createReactAgent` e tool binding per-richiesta. Abbiamo misurato: l'accuratezza non cambia. Abbiamo migrato per le capacità future, non per le risposte correnti.

Il conto: otto pacchetti SAP, tre di LangGraph, tre per aprire PDF, Word e PowerPoint.

Tutto il resto è roba nostra. Ed è poca.

*(310 parole — 2,5 minuti a ritmo da palco)*

---

# Discorso 2 v3 — 5 minuti

> **Quando usarlo:** hai cinque minuti davanti a chi sa leggere un'architettura. Cinque scelte, ognuna col suo prezzo dichiarato.

Vi racconto Billy dal punto di vista di chi l'ha scritto. Cinque scelte di architettura, e per ognuna quello che ci è costata — perché le scelte senza prezzo di solito sono pubblicità.

**Prima scelta: i vettori stanno dentro il database di business.**

Billy fa RAG: spezza i documenti in pezzi da settecento caratteri con cento di sovrapposizione, li trasforma in vettori da tremilasettantadue dimensioni e cerca per similarità.

La scelta non banale è dove metterli. Non in un database vettoriale dedicato: dentro HANA Cloud, che ha il motore vettoriale nativo. Stessa base dati del catalogo, degli utenti, delle certificazioni.

Il vantaggio non è solo "un servizio in meno". È che ogni pezzo di testo è una riga con una chiave esterna verso il suo asset. Quando Billy cita una fonte non sta dicendo "in un documento c'è scritto": sta puntando una riga precisa del catalogo, con il suo autore, il suo stato e il suo link. Con un vector store esterno avremmo dovuto reimplementare quel collegamento a mano.

**Seconda scelta: la fiducia è un moltiplicatore dentro la query.** [pausa]

Questa è la parte che considero il vero contenuto tecnico del progetto.

Il punteggio di una fonte non è la somiglianza semantica. È la somiglianza **moltiplicata** per il livello di certificazione: uno se certificata, zero-virgola-settantacinque se scaduta, zero-virgola-trentacinque se non validata. Il deprecato non viene penalizzato: viene escluso dalla query, che è una cosa diversa.

Non è un filtro post-recupero, è dentro l'ordinamento. Un documento certificato può quindi battere uno più pertinente ma non validato.

Il prezzo: per pesare senza fare una join a ogni ricerca, abbiamo denormalizzato lo stato di certificazione su ogni pezzo di testo. Quando un asset cambia stato, i suoi pezzi vanno risincronizzati. È codice in più, ed è un posto dove si possono introdurre incoerenze. Lo sappiamo, l'abbiamo scelto lo stesso.

**Terza scelta: le skill si caricano, non si recuperano.**

Un documento lo spezzetti e ne peschi i pezzi pertinenti. Una skill no: o ce l'hai tutta, o non la puoi eseguire. Quindi le skill sono escluse dal chunking — sarebbe proprio l'operazione sbagliata.

Nel contesto iniziale mettiamo soltanto identificativo, titolo e descrizione di ogni skill pubblicata. Il corpo, che può arrivare a sessantamila caratteri, viene caricato solo se il modello decide di chiamarlo. Così il contesto non si satura, e il costo cresce con quello che serve davvero.

**Quarta scelta: LangGraph JS come motore agentico.**

Avevamo scritto il ciclo agentico a mano: ~trecentocinquanta righe, due strumenti, massimo cinque iterazioni. Funzionava. Poi ci siamo scontrati con un limite strutturale dell'Orchestration Service SAP: i tool si dichiarano alla costruzione del client, non per singola richiesta. Non potevamo dare set di strumenti diversi a sotto-agenti diversi.

Abbiamo misurato se cambiare framework spostasse l'accuratezza: LangGraph ventotto su trentacinque, loop a mano ventisette. La differenza è rumore — il modello non accetta parametri di temperatura, ogni run è non deterministica.

Abbiamo migrato lo stesso, perché LangGraph non ci serve per le risposte correnti: ci serve per costruire sotto-agenti con tool binding isolato, per un checkpointer persistente reale e per dimezzare il codice di plumbing. Il loop a mano è rimasto come fallback — una variabile d'ambiente lo riattiva senza deploy.

**Quinta scelta: il modello è `gpt-5.5`.**

Non Claude. Non perché Claude sia peggiore: è che da Node.js non si raggiunge il deployment Bedrock di Claude attraverso `@sap-ai-sdk/langchain` — il bridge esiste solo in Python. `gpt-5.5` era deployato nel nostro resource group, supporta tool calling, e abbiamo verificato che l'accuratezza di routing è la stessa.

Un vincolo concreto: `gpt-5.5` rifiuta `temperature` e `top_p`. Accetta solo i default. Ogni risposta è quindi non deterministica per costruzione.

**Il conto finale.**

Otto pacchetti SAP, tre di LangGraph, tre utility per aprire i file. Frontend a Web Components nativi — nessun framework, nessun bundler. Il resto è codice nostro, ed è sorprendentemente poco.

*(605 parole — 5 minuti a ritmo da palco)*

---

# Discorso 3 v3 — 10 minuti

> **Quando usarlo:** sessione tecnica vera, con tempo per le domande. Contiene la *war story* — il pezzo che in una sala di ingegneri vale più di tutto il resto.

Vi racconto Billy da dentro: le scelte di architettura, e soprattutto quello che ognuna ci è costata. Le scelte senza prezzo di solito sono pubblicità, e voi ve ne accorgereste.

## Il problema tecnico, in una riga

Fare in modo che una risposta generata da un modello linguistico sia **riconducibile a una fonte precisa, di cui si conosce l'affidabilità**. Non "fare un chatbot": quello è il pezzo facile.

## Scelta uno: i vettori dentro il database di business

Billy fa RAG classico. I documenti vengono spezzati in finestre da settecento caratteri con cento di sovrapposizione, ogni pezzo diventa un vettore da tremilasettantadue dimensioni, e la ricerca è per similarità del coseno.

La decisione interessante è dove vivono i vettori. Non in un database vettoriale dedicato: dentro HANA Cloud, che ha il motore vettoriale nativo. La stessa base dati del catalogo, degli utenti e delle certificazioni.

Il vantaggio vero non è risparmiare un servizio. È che ogni pezzo di testo è **una riga con una chiave esterna verso il suo asset**. Quando Billy cita una fonte non dice "in un documento c'è scritto": punta a una riga precisa, con autore, stato di certificazione e link cliccabile nel catalogo.

Abbiamo valutato seriamente l'alternativa gestita da SAP, il Document Grounding, e l'abbiamo scartata per i contenuti interni proprio su questo punto: non garantisce di ricondurre in modo affidabile un pezzo di contesto alla riga esatta del nostro catalogo. E senza quel collegamento, tutto il modello di fiducia non sta in piedi.

## Scelta due: la fiducia è un moltiplicatore dentro la query

Questo è il vero contenuto tecnico del progetto. [pausa]

Il punteggio di una fonte non è la somiglianza semantica. È la somiglianza **moltiplicata** per l'affidabilità: uno se certificata, zero-virgola-settantacinque se la certificazione è scaduta, zero-virgola-trentacinque se non l'ha validata nessuno. Il contenuto deprecato non viene penalizzato — viene escluso dalla query, che è una cosa diversa.

E non è un filtro applicato dopo il recupero: sta dentro l'ordinamento, nella stessa query che calcola la similarità. Quindi un documento certificato può battere uno semanticamente più pertinente ma non validato. Che è esattamente il comportamento che volete quando quella risposta finisce davanti a un cliente.

Il prezzo lo pago volentieri, ma ve lo dico: per pesare senza una join a ogni ricerca, lo stato di certificazione è **denormalizzato** su ogni singolo pezzo di testo. Quindi quando un asset cambia stato, tutti i suoi pezzi vanno risincronizzati. È codice in più ed è un punto dove si possono creare incoerenze. È una scelta consapevole, non una svista.

## Scelta tre: le skill si caricano, non si recuperano

Billy non è solo un RAG: è un agente. Decide da sé se cercare nei documenti o se caricare ed eseguire una skill pubblicata nel catalogo.

Un documento lo spezzetti e ne peschi i pezzi pertinenti. Una skill no: o ce l'hai tutta, o non la puoi eseguire. Quindi le skill sono **escluse dal chunking** — sarebbe proprio l'operazione sbagliata.

Il modo in cui le esponiamo è quello che mi piace di più di tutto il sistema: nel contesto iniziale mettiamo soltanto identificativo, titolo e descrizione di ogni skill pubblicata. Il corpo, che può arrivare a sessantamila caratteri, viene caricato **solo se** il modello decide di chiamarlo. Così il contesto non si satura, e il costo cresce con quello che serve davvero invece che col numero di skill pubblicate.

## Scelta quattro: LangGraph JS

Questa è la scelta che abbiamo fatto più tardi, e che richiede la storia più lunga.

Avevamo scritto il ciclo agentico a mano: ~trecentocinquanta righe, due strumenti, massimo cinque iterazioni del ciclo modello-strumento-modello, gli ultimi venti messaggi di conversazione come memoria. Funzionava. Abbiamo misurato: ventisette domande su trentacinque con la skill giusta.

Poi ci siamo scontrati con un limite strutturale dell'Orchestration Service SAP. **I tool si dichiarano alla costruzione del client, non per singola richiesta.** Non esiste `tool_choice` per-richiesta. Non si può variare il set di strumenti in base alla domanda.

Il che va bene finché hai un agente solo. Ma il passo successivo di Billy è avere sotto-agenti: un agente specializzato per la SAC Design Factory, uno per la gestione offerte, uno per la stima dei costi — ognuno con il suo insieme di skill. Con l'Orchestration Service, non puoi.

La soluzione è stata passare a `gpt-5.5` via `AzureOpenAiChatClient` di `@sap-ai-sdk/langchain`, che passa i tool per singola chiamata. E sopra ci abbiamo messo LangGraph JS con `createReactAgent`.

Abbiamo misurato se il cambio spostasse l'accuratezza: LangGraph ventotto su trentacinque, loop a mano ventisette. La differenza è rumore — `gpt-5.5` non accetta parametri di temperatura, ogni run è non deterministica. L'abbiamo migrato comunque, perché LangGraph non ci serve per le risposte correnti: ci serve per i sotto-agenti, il tool binding dinamico e il checkpointer persistente. Il loop a mano è rimasto come fallback — una variabile d'ambiente lo riattiva senza deploy.

## La war story: il crash di streaming a mezzanotte

La parte che secondo me vi interessa di più, perché è la prova che questa roba è stata spinta in produzione davvero. [pausa]

Mettiamo in deploy il nuovo motore LangGraph. Billy risponde. Poi arriva la prima segnalazione: l'interfaccia dà errore, la risposta non arriva.

I log di Cloud Foundry mostrano questo:

```
TypeError: Cannot read properties of undefined (reading 'tool_calls')
  at getDeltaToolCalls (azure-openai-chat-completion-stream-chunk-response.js:38)
```

Riga 38 di una libreria SAP. `getDeltaToolCalls` legge `this.data.delta.tool_calls`, e `this.data.delta` è `undefined`.

La causa: `gpt-5.5`, durante lo streaming, invia un chunk finale che contiene solo il conteggio dei token — senza `delta`. La libreria `@sap-ai-sdk/foundation-models` chiama `getDeltaToolCalls` su tutti i chunk, incluso quello finale, e crasha.

Non è colpa nostra. Non è colpa del modello. È un bug nel SDK SAP: manca una guardia `if (this.data.delta)` su quel metodo.

La soluzione: creare il modello con `streaming: false`. LangGraph emette ugualmente tutti gli eventi SSE — tool start, tool end, risposta finale — ma senza i delta token-by-token. La risposta arriva intera invece che carattere per carattere.

Il prezzo: l'utente vede il lucchetto di caricamento più a lungo, poi la risposta intera. Non è bello quanto il testo che scorre, ma è meglio di un crash.

Quando il bug verrà fixato nel SDK — è questione di aggiungere un controllo `?.` su `this.data.delta` — si rimette `streaming: true` e si recupera il comportamento migliore. Nel frattempo, il workaround è nel codice con un commento che spiega esattamente cosa aspettarsi.

## Scelta cinque: gpt-5.5 e non Claude

Da Node.js, `@sap-ai-sdk/langchain` espone due client: `AzureOpenAiChatClient` e `OrchestrationClient`. Il deployment Claude di Bedrock non è raggiungibile da Node via questo SDK — il bridge esiste solo in Python, nel SDK Python di SAP (`gen_ai_hub.proxy.langchain.amazon.ChatBedrockConverse`).

`gpt-5.5` era deployato nel resource group, supporta tool calling, e l'accuratezza misurata è la stessa. Scelta pragmatica.

## I debiti, dichiarati

Un pubblico tecnico si merita anche i buchi, quindi ve li dico io prima che me li chiediate.

L'autenticazione **non è attiva**: la configurazione XSUAA è pronta e commentata nel descrittore di deploy, ma l'app oggi è aperta a chiunque raggiunga l'URL. È una scelta esplicita — attivarla presto avrebbe significato ri-testare ogni funzionalità con il login a ogni iterazione — ma è un debito, e va saldato prima di qualunque uso reale.

Il **token-by-token streaming è disabilitato** a causa del bug del SDK appena descritto. Funzionalità presente nell'architettura, in attesa di un fix.

La scadenza automatica delle certificazioni è un timer in-process ogni sei ore, non un vero job scheduler. Funziona finché c'è una sola istanza CF; con due, gira due volte.

Il **checkpointer persistente su HANA** non è ancora implementato: le tabelle ci sono, la logica dei cinque metodi `BaseCheckpointSaver` no. Oggi Billy ricorda la conversazione in memoria; un riavvio CF la perde.

La scansione antivirus sui file caricati è simulata, non reale.

E una libreria del frontend arriva da una CDN pubblica senza versione fissata, il che non è riproducibile.

## Chiudo

Otto pacchetti SAP, tre di LangGraph, tre utility per aprire PDF, Word e PowerPoint. Frontend a Web Components nativi: nessun framework, nessun bundler, nessuno step di build. RAM aumentata da duecentocinquantasei a mileventiquattro megabyte per reggere l'albero LangChain.

Il codice veramente nostro è poco: la divisione in pezzi, la pesatura per certificazione, il manifesto delle skill, lo streaming degli eventi. Tutto il resto è piattaforma.

E secondo me è il complimento migliore che si possa fare a una piattaforma: che la parte interessante del vostro sistema sia l'unica che avete dovuto scrivere voi.

*(1.220 parole — 10 minuti a ritmo da palco)*

---

## Note di consegna specifiche della v3

- **Dì i numeri a parole, non da lettore di slide.** "Zero-virgola-trentacinque" si capisce; "zero punto trentacinque" no.
- **Ogni numero deve reggere la domanda dopo.** Se citi le 350 righe del loop o ventisette su trentacinque, aspettati "perché proprio quello?". Le risposte stanno in [stack-tecnologico.md](stack-tecnologico.md) e [langgraph-perche-e-come.md](langgraph-perche-e-come.md).
- **La war story del crash di streaming è il momento più forte.** Il `TypeError: Cannot read properties of undefined` con il nome del file della libreria SAP e il workaround `streaming: false` sono i dettagli che restano in testa. Raccontali per esteso.
- **I debiti vanno detti da te, non estratti da loro.** In una sala tecnica, dichiarare per primo che l'auth è spenta e il streaming è degradato vale più di qualunque slide sull'architettura.
- **Sul cambio LangGraph vs loop a mano:** la risposta onesta è "l'accuratezza non è cambiata, abbiamo migrato per le capacità future". Non dire che è migliorato: i numeri lo contraddicono e qualcuno in sala potrebbe chiederteli.
- **Non dire mai "semplicemente".** In questo registro è la parola che fa perdere credibilità più in fretta.
