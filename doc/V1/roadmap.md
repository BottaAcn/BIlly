# Roadmap di implementazione — Billy v1

> Ordine unico, **senza** la suddivisione virtuale Billy/Marketplace: i task sono ordinati per convenienza reale di implementazione, pesando insieme priorità, difficoltà, effort, valore prodotto e dipendenze tecniche. Riferimento architetturale completo: [architecture.md](architecture.md).

## Metodo

Per ogni fase indico: **cosa**, **perché in questa posizione** (non prima, non dopo), **effort** (stima grossolana: S/M/L/XL), **valore** (impatto percepito sul prodotto), **dipendenze**.

La regola guida: **prima le cose che sbloccano tutto il resto e costano poco**, poi le cose che aumentano di molto il valore percepito per un effort ancora contenuto, poi l'infrastruttura pesante, per ultimo tutto ciò che è esplicitamente rimandabile (XSUAA su richiesta esplicita, MCP perché è un moltiplicatore non un prerequisito).

---

## Fase 0 — Modello dati esteso + migrazione (fondamenta) — ✅ COMPLETATA (07/09/2026)

Verificata end-to-end su Cloud Foundry reale. Dettaglio: [fase0-checklist.md](fase0-checklist.md). Scoperta non prevista: `undeploy.json` di default non droppa tabelle per sicurezza (solo view/index/constraint) — serve un `db/undeploy.json` esplicito per rimuovere entità cancellate dal modello, altrimenti restano orfane su HANA.


**Cosa:** Sostituire l'entità `Document` (v0.0.1) con `Asset`+`Chunk`+`Player`+`Season`+`PointEvent` (architecture.md §2). Riadattare `addDocument`/`askBilly` esistenti al nuovo modello **senza aggiungere ancora nuove funzionalità** — un asset = un chunk per ora, esattamente come oggi, solo su tabelle nuove.

**Perché per prima:** letteralmente tutto il resto (catalogo, certificazione, gamification, retrieval pesato) si appoggia su questo schema. Farlo dopo significherebbe rifare il lavoro successivo.

**Effort:** M — è quasi tutto CDS + un refactor meccanico del service esistente, nessuna nuova integrazione esterna.
**Valore percepito:** Nessuno visibile all'utente finale (è invisibile dall'esterno) — ma è il prerequisito con il rapporto costo/sblocco più alto di tutta la roadmap.
**Dipendenze:** nessuna, si parte da qui.

---

## Fase 1 — RAG "vero": citazioni cliccabili + retrieval pesato + chunking — ✅ COMPLETATA (07/09/2026)

Verificata end-to-end su Cloud Foundry reale, con conferma empirica del chunking multiplo (non solo teorica): una domanda su un testo di 987 caratteri ha recuperato due chunk distinti dello stesso asset con similarity diverse. Il modello segnala spontaneamente le fonti non certificate. Dettaglio: [fase1-checklist.md](fase1-checklist.md).


**Cosa:**
1. Citazioni con link cliccabile verso l'Asset (chunk → asset → URL)
2. Retrieval che esclude `deprecated` e pesa `certified`/`certifiedOutdated`/`community` (architecture.md §4)
3. Chunking reale di testi lunghi (invece di 1 asset = 1 chunk)

**Perché subito dopo la Fase 0:** è il salto di valore più alto per l'effort più basso di tutta la roadmap. La v0.0.1 ha già dimostrato che il meccanismo tecnico funziona (embedding, COSINE_SIMILARITY, Claude) — qui si tratta di arricchire una pipeline già funzionante, non di costruirne una nuova. Il risultato (Billy che risponde con link veri al marketplace, gestisce documenti lunghi, dichiara l'affidabilità della fonte) è esattamente la promessa centrale del progetto (D1).

**Effort:** M — nessuna nuova integrazione esterna, solo logica applicativa sopra quello che già esiste.
**Valore percepito:** Molto alto — è la prima volta che Billy "sembra" il prodotto finale.
**Dipendenze:** Fase 0.

---

## Fase 2 — Catalogo utilizzabile: CRUD Asset + stati di certificazione — ✅ COMPLETATA (08/09/2026)

Verificata end-to-end su Cloud Foundry reale: flusso upload→revisione→approvazione confermato (un asset non approvato non è citato da Billy, uno approvato sì con peso pieno, uno deprecato viene escluso). 4 bug reali trovati e corretti durante il test (non prevedibili per sola ispezione statica): subquery correlata HANA, player pre-esistente senza nuovi flag di ruolo, colonna `published` non backfillata come atteso, function CDS che richiedono GET non POST. PointEvent reali rimandati alla Fase 3 (richiedono Season). Dettaglio: [fase2-checklist.md](fase2-checklist.md).


**Logica di business definita ✅ (07/09/2026)** — vedi architecture.md §2/§3.1/§7 per il dettaglio completo: flusso di revisione/approvazione (ogni pubblicazione, prima creazione inclusa, passa da una coda di revisione dei Certifier/Admin — anche a livello `community`), ruoli provvisori `isCertifier`/`isAdmin` su `Player`, transizioni di stato libere, eliminazione riservata ad Admin, ricerca full-text di default + "Ricerca approfondita" semantica opt-in, pesi di retrieval per certificazione (1.0/0.75/0.35), punti con `pointsPct` variabile sulle revisioni successive alla prima. Non ancora implementata.

**Cosa:** `CatalogService` con `Asset`+`AssetRevision` (upload/modifica → coda di revisione → approvazione), azioni `reviewRevision`/`deprecateAsset`/`deleteAsset`, ricerca full-text + semantica, job notturno di scadenza certificazione (architecture.md §3.1).

**Perché qui e non prima:** senza Fase 0/1 il catalogo esisterebbe ma Billy non lo userebbe in modo interessante (niente pesatura, niente link). Ora che il RAG "vede" la certificazione, dare alle persone un modo di certificare/gestire gli asset chiude il primo ciclo completo del prodotto (carica → certifica → Billy risponde meglio e cita la fonte).

**Effort:** M — CRUD standard CAP + una state machine semplice (4 stati, transizioni note da D10/D11).
**Valore percepito:** Alto — il marketplace comincia a esistere come concetto, non solo Billy.
**Dipendenze:** Fase 0 (schema), beneficia di Fase 1 (altrimenti certificare non avrebbe effetto visibile).

---

## Fase 3 — Gamification: punti e classifica

**Cosa:** `PointEvent` su upload/certificazione (D12), `GamificationService` con leaderboard, gestione `Season`.

**Perché qui:** ha senso solo dopo che esistono azioni da premiare (upload, certificazione — Fase 2). Non blocca l'uso base di Billy o del catalogo: è motivazionale, non funzionale. Se il tempo stringe, questa fase è la più facile da posticipare senza danneggiare il prodotto core.

**Effort:** M — logica di business su un modello dati già pronto dalla Fase 0.
**Valore percepito:** Medio-alto per l'adozione a lungo termine, ma zero impatto sulla funzione base (rispondere a domande).
**Dipendenze:** Fase 0, Fase 2.

**Decisioni aperte da chiudere prima di questa fase (architecture.md §7):** durata delle stagioni, meccanismo di premiazione.

---

## Fase 4 — Frontend React + UI5 Web Components

**Cosa:** Le pagine reali (Chat Billy con streaming, Catalogo, Dettaglio asset, Upload, Leaderboard) — architecture.md §5.

**Perché qui e non prima:** costruire il frontend contro API instabili significa rifare il frontend più volte. Ora che `BillyService`/`CatalogService`/`GamificationService` hanno la forma sostanzialmente definitiva (Fasi 0-3), il frontend si costruisce una volta sola. **Perché qui e non dopo**: è l'effort più alto e il valore più alto per l'utilizzo reale da parte di altri colleghi — senza questo, il prodotto resta uno strumento per soli tecnici via curl/Postman.

**Effort:** XL — è il pezzo di lavoro singolo più grande della roadmap.
**Valore percepito:** Altissimo — è ciò che rende il prodotto utilizzabile da chiunque in azienda.
**Dipendenze:** Fasi 0-3 (API stabili). Può iniziare in parallelo sulla Chat/Catalogo mentre la Fase 3 (gamification) è ancora in corso, se le risorse lo permettono — il rischio di rework sulla UI di leaderboard è basso e isolato.

---

## Fase 5 — Upload file reale (HANA storage, malware scan NON incluso per ora)

**Aggiornata (08/09/2026) due volte.** Prima verifica tecnica: bozza precedente prevedeva Object Store; verificando il codice sorgente di `@cap-js/attachments` è emerso che lo storage `kind: "db"` (BLOB su HANA, già disponibile, zero costi aggiuntivi) supporterebbe comunque il malware scanning reale come servizio indipendente (SAP Malware Scanning Service). **Decisione successiva esplicita dell'utente**: per questa fase non si attiva neanche quel servizio — niente scanning, solo un placeholder di stato visibile (`Unscanned`, mai risolto). Lo scanning reale è rimandato a **subito prima di XSUAA (Fase 8) o eventualmente mai**, deliberatamente non deciso ora. Dettaglio tecnico completo e motivazione del rischio accettato: architecture.md §6.

**Cosa:** Sostituire "incolla testo" con upload file vero: `@cap-js/attachments` con storage `kind: "db"` su HANA (nessun Object Store, nessun bind del Malware Scanning Service), stato `Unscanned` lasciato visibile su ogni allegato come promemoria esplicito del gap, estrazione testo da PDF/docx (architecture.md §6).

**Perché qui e non prima:** nessuna dipendenza esterna bloccante ora (l'unico entitlement esterno, il Malware Scanning Service, è stato rimandato) — la fase si può fare interamente con quello che il subaccount ha già. Non blocca nessuna fase precedente: si può continuare a popolare il catalogo con testo incollato o link esterni fino a quando questa fase non è pronta. **Perché qui e non dopo**: comunque necessaria prima di un rollout reale a ~200 persone, che difficilmente accetterebbero di "incollare testo a mano".

**Effort:** S-M (ridotto ulteriormente) — niente nuova infrastruttura di storage, niente nuovo entitlement da aspettare. Solo `@cap-js/attachments` + libreria di estrazione testo da scegliere e testare.
**Valore percepito:** Alto per l'adozione reale, ma il prodotto è già dimostrabile/testabile senza. **Rischio accettato consapevolmente**: file caricati non passano controllo antivirus fino a quando (e se) si deciderà di attivarlo — accettabile in fase di sviluppo/test, da rivalutare esplicitamente prima di un rollout reale (non implicitamente).
**Dipendenze:** Fase 0 (Asset deve esistere). Indipendente dalle Fasi 1-4, può essere anticipata o posticipata con flessibilità.

**Nessuna azione amministrativa da fare subito**: a differenza della bozza precedente, non serve più chiedere né Object Store né il Malware Scanning Service finché non si decide di chiudere il gap (vedi Fase 8).

---

## Fase 6 — Infrastruttura di produzione (MTA completo)

**Cosa:** Aggiungere approuter, modulo UI (html5), html5-deployer, html5-repo-host/runtime, destination — architecture.md §10.

**Perché qui:** ha senso solo quando c'è un frontend React reale da servire (Fase 4) — prima sarebbe infrastruttura senza contenuto. Va di pari passo con la Fase 4, non necessariamente dopo in sequenza rigida.

**Effort:** M-L — pattern già noto dal reference SAP, ma nuovo per questo progetto (v0.0.1 usa serving CAP diretto, non HTML5 App Repo).
**Valore percepito:** Nessuno visibile direttamente, ma prerequisito tecnico per il deploy di produzione del frontend.
**Dipendenze:** Fase 4.

---

## Fase 7 — MCP

**Cosa:** `@cap-js/mcp` su `CatalogService` (ed eventualmente `BillyService`) — architecture.md §8.

**Perché per ultimo prima di XSUAA:** è un moltiplicatore (altri agenti/assistenti possono usare il catalogo come tool), non un prerequisito per nessuna altra fase. Esplicitamente già segnata come "fase avanzata" in HANDOFF. Aggiungerla prima che il catalogo sia stabile significherebbe esporre via tool un'API che cambia ancora.

**Effort:** M.
**Valore percepito:** Alto ma di nicchia (utile per chi integra Billy in altri agenti, non per l'utente finale del marketplace).
**Dipendenze:** Fase 2 (Catalogo stabile).

---

## Fase 8 — XSUAA (ULTIMA, per esplicita richiesta, D15)

**Cosa:** Attivare `xs-security.json` (già pronto da v0.0.1), aggiungere ruolo `Certifier`, bindare l'approuter, `@(requires:...)` nei servizi, testare che tutto il resto (Fasi 0-7) funzioni ancora con l'auth reale attiva.

**Perché letteralmente per ultimo:** decisione esplicita dell'utente. Dal punto di vista tecnico ha senso: attivare l'auth presto significherebbe ri-testare ogni feature successiva anche con login reale, rallentando ogni iterazione. Farlo per ultimo significa un solo giro di test end-to-end con auth reale, quando tutto il resto è già stabile.

**Effort:** M — la struttura c'è già, ma va verificato che ogni servizio/pagina si comporti correttamente con utenti reali e ruoli reali (rischio di regressioni silenziose se qualche endpoint assumeva implicitamente "tutti possono tutto").
**Valore percepito:** Necessario per il rollout reale (senza auth non si va in produzione con 200 persone), ma zero valore dimostrativo prima di allora.
**Dipendenze:** tutto il resto.

**Decisione da riprendere qui, non prima (rimandata dalla Fase 5, architecture.md §6):** valutare se attivare finalmente il **Malware Scanning Service** sugli allegati (ancora `Unscanned` da quando è stato introdotto l'upload file). Se si decide di sì, va richiesto l'entitlement all'admin (stesso pattern già usato per HANA Cloud/AI Core) e bindato secondo `@cap-js/attachments`. Se si decide di no, va comunque una decisione esplicita e documentata prima del rollout reale — non un'omissione.

---

## Fase 9 — CI/CD (quando serve)

Non prioritaria ora, da affrontare quando il ritmo di rilascio lo giustifica (già annotato in architecture.md §11). Nessuna dipendenza rigida, si può inserire in qualunque punto dopo la Fase 4 se il deploy manuale comincia a essere un collo di bottiglia.

---

## Riepilogo visivo dell'ordine

```
Fase 0  → Modello dati + migrazione                    [fondamenta, blocca tutto]
Fase 1  → RAG vero (link, pesatura, chunking)           [massimo valore/effort]
Fase 2  → Catalogo (CRUD + certificazione)              [chiude il primo ciclo prodotto]
Fase 3  → Gamification                                  [motivazionale, posticipabile]
Fase 4  → Frontend React                                [effort più alto, valore più alto]
Fase 5  → Upload file reale                             [flessibile, richiedere entitlement subito]
Fase 6  → MTA completo (approuter/html5)                [va con Fase 4]
Fase 7  → MCP                                           [moltiplicatore, non prerequisito]
Fase 8  → XSUAA                                         [ULTIMA, per richiesta esplicita]
Fase 9  → CI/CD                                         [quando serve]
```

**Cosa fare in parallelo fin da subito, indipendentemente dalla fase tecnica in corso:**
- ~~Verificare/richiedere l'entitlement SAP Malware Scanning Service~~ — **non serve più subito**: deciso di rimandare l'attivazione dello scanning a Fase 8 (o mai), vedi Fase 5/architecture.md §6
- Decidere durata stagioni e meccanismo di premiazione (blocca solo la Fase 3, ma è una decisione di prodotto, non tecnica — si può chiudere in parallelo)
- Iniziare a raccogliere/caricare i documenti reali della practice per validare il chunking (Fase 1) il prima possibile con dati veri, non sintetici
