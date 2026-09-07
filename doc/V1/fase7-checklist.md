# Checklist — Fase 7: MCP

> Riferimento: [architecture.md](architecture.md) §8, [roadmap.md](roadmap.md) Fase 7. Stesso workflow delle fasi precedenti: analisi approfondita → checklist → verifica coerenza → implementazione → test → verifiche → push `dev` → merge `master` → ritorno a `dev`.
>
> **Decisione esplicita dell'utente**: esporre **tutto** — sia `CatalogService` (`searchAssets` senza RAG, `deepSearch` con RAG/similarity, e le altre action/function) sia `BillyService` (`askBilly`), non un sottoinsieme. **Conferma esplicita richiesta all'utente prima di ogni deploy reale su Cloud Foundry.**

---

## 0. Prerequisiti

- [x] **0.1** Branch `dev` sincronizzato con origin, Fase 5 mergiata in `master`
- [x] **0.2** `billy-srv` attivo su CF

---

## 1. Analisi approfondita — risultati della ricerca (da fare PRIMA di scrivere codice)

- [x] **1.1** Verificato che il pacchetto ufficiale è `@cap-js/mcp` (non `@cap-js/mcp-server`, un pacchetto diverso e molto meno maturo — 0.0.5 vs 1.4.3). Confermato via `npm view`: `peerDependencies` `@sap/cds >=8`, `express >=4` — compatibile con `@sap/cds ^10` già in uso, nessun conflitto.
- [x] **1.2** Letta la documentazione ufficiale (capire) e il README del pacchetto. È un **protocol adapter**, come `protocol: 'rest'` — nessuna logica nuova nei service `.js`, solo annotazione CDS.
- [x] **1.3** Sintassi di esposizione: `annotate <Service> with @mcp;` in coda al file `.cds` del servizio. Path personalizzabile con `annotate <Service> with @mcp:'nome';` (altrimenti derivato di default — **da verificare con un deploy reale**, task 5.x).
- [x] **1.4** Tool auto-generati per servizio (default, `per_action_tool: false`): `describe` (metadati), `query` (lettura CQL/CQN sulle entità), `call_action` (invoca action/function **non bound** con un parametro enum `action`). **Limite noto del pacchetto**: supporta solo lettura ed action/function non bound — **nessun bound action, nessun CREATE/UPDATE/DELETE diretto su entità**. Non è un problema per noi: tutte le nostre action/function (`searchAssets`, `deepSearch`, `uploadAsset`, `editAsset`, `reviewRevision`, `setCertificationLevel`, `deleteAsset`, `listReviewQueue`, `expireCertifications`, `downloadAttachment`, `askBilly`) sono già non bound (definite a livello di servizio, non su un'istanza).
- [x] **1.5** Config `cds.mcp` in `package.json`: `per_action_tool` (default `false`) e `prefix` (default `false`). **Decisione**: impostare entrambi a `true` — un tool dedicato per ogni action/function (più leggibile per un agente che deve scegliere, invece di un unico `call_action` generico con enum) e prefisso col nome del servizio (evita collisioni tra tool di `CatalogService` e `BillyService`, es. entrambi potrebbero avere action con nomi simili in futuro).
- [x] **1.6** Annotare l'intero `CatalogService` espone anche l'entità `Asset` in lettura via il tool `query` — oltre a `searchAssets`/`deepSearch`. Coerente con la decisione "esporre tutto"; **nessun rischio nuovo**: la projection resta filtrata `where published = true` come per REST, e `deleteAsset`/`reviewRevision`/ecc. sono già chiamabili oggi via REST con lo stesso `auth: kind: dummy` — MCP aggiunge un trasporto, non un privilegio.
- [x] **1.7** Auth: in sviluppo il pacchetto configura da solo un mock (utente `alice`/`privileged`), personalizzabile via `cds.mcp.autowire`. Non documentato esplicitamente il comportamento in produzione con `auth: kind: dummy` — **da verificare con un test reale** (task 6.x), aspettativa: si comporta come le altre richieste REST oggi (nessun enforcement reale, coerente con lo stato attuale dell'app).
- [x] **1.8** **Limite noto da segnalare, non silenziare** (stesso pattern già usato per lo scanner malware in Fase 5): il pacchetto stesso dichiara *"nessun rate limiting, nessun audit log, nessun workflow di approvazione integrato"* — raccomanda un gateway (SAP Integration Suite MCP Gateway / SAP Agent Gateway) per uso in produzione reale. Accettabile per uso interno/demo attuale, da rivalutare a Fase 8 insieme a XSUAA.
- [x] **1.9** Verificato in `architecture.md §10` (tabella deployment): nessuna riga dedicata a MCP — **nessun nuovo modulo MTA atteso**, gira sulla stessa app `billy-srv` con una nuova route, stesso principio di REST. **Da confermare con un deploy reale** (task 5.x/6.x).
- [x] **1.10** **Trovato in rilettura, da verificare esplicitamente**: il tool `query` potrebbe esporre in lettura anche `Asset.attachments` (composition target), la stessa entità coinvolta nel bug di download risolto in Fase 5 (`@cap-js/attachments` prima/after su `READ`). Il fix di Fase 5 mostrava che il crash scattava solo quando `req.req.url` termina in `/content` — una richiesta MCP (JSON-RPC su `/mcp/...`) non dovrebbe mai avere quell'URL, quindi ci si aspetta nessun impatto. **Non assunto per certo**: aggiunto test di regressione esplicito (task 6.9).

---

## 2. Configurazione (`package.json`)

- [x] **2.1** Aggiungere `@cap-js/mcp` a `dependencies`
- [x] **2.2** Aggiungere:
  ```json
  "cds": {
    "mcp": {
      "per_action_tool": true,
      "prefix": true
    }
  }
  ```

---

## 3. Annotazioni CDS

- [x] **3.1** `billy-app/srv/catalog-service.cds`: `annotate CatalogService with @mcp;` + `@mcp.instructions` che indirizzi l'agente tra `searchAssets` (full-text istantaneo) e `deepSearch` (RAG/similarity semantica)
- [x] **3.2** `billy-app/srv/billy-service.cds`: `annotate BillyService with @mcp;` + `@mcp.instructions` che indichi `askBilly` come punto d'ingresso per domande in linguaggio naturale con citazione fonti certificate
- [x] **3.3** Nessuna modifica ai `.js` dei due servizi (solo esposizione di protocollo, come da §1.2)

---

## 4. Verifica pre-implementazione

- [x] **4.1** Rileggere l'intera checklist end-to-end, verificare coerenza (nomi servizi, nomi action/function)
- [x] **4.2** Confermare che nessun task introduca XSUAA reale, nuovi moduli MTA, o modifiche alla logica applicativa esistente

---

## 5. Build e deploy di verifica

- [x] **5.1** `npm install` (nuova dipendenza) — 7 pacchetti aggiunti, 0 vulnerabilità
- [x] **5.2** `npx cds compile` sui due file `.cds` — nessun errore
- [x] **5.3** `mbt build`
- [x] **5.4** Ispezionato il `.mtar`: **correzione rispetto all'assunzione iniziale** — il modulo `billy-srv` nell'mtar non include mai `node_modules` (solo `app/`, `srv/`, `package.json`, `package-lock.json`): l'installazione delle dipendenze avviene al push tramite `nodejs_buildpack` (confermato da `cf app billy-srv` → `buildpacks: nodejs_buildpack`), non alla build MTA. Verificato invece che `package.json` bundlato dichiara correttamente `@cap-js/mcp: ^1.4.3` e la config `cds.mcp`; nessun segreto (`local.json`/`default-env`/`service-key`) presente.
- [x] **5.5** ⚠️ Confermato dall'utente ("procedi"), eseguito `cf deploy` (due volte: primo deploy senza route MCP registrate, secondo dopo il fix `@protocol: ['rest','mcp']`)
- [x] **5.6** Confermato nei log di avvio (verificato prima in locale, poi su CF): `serving CatalogService { at: [ '/rest/catalog', '/mcp/catalog' ] }` e `serving BillyService { at: [ '/rest/billy', '/mcp/billy' ] }` — path esatto: `/mcp/<nome-path-servizio>`, stesso slug usato per REST

---

## 6. Test end-to-end reale

- [x] **6.1** `initialize` contro `/mcp/catalog` e `/mcp/billy` (CF) → risposta valida con `serverInfo`/`instructions` custom corrette per entrambi
- [x] **6.2** `tools/list` → 12 tool per `CatalogService` (`CatalogService-describe`, `-query`, `-uploadAsset`, `-editAsset`, `-listReviewQueue`, `-reviewRevision`, `-setCertificationLevel`, `-deleteAsset`, `-downloadAttachment`, `-searchAssets`, `-deepSearch`, `-expireCertifications`) e 2 per `BillyService` (`-describe`, `-askBilly`) — naming confermato: `<ServiceName>-<actionName>`
- [x] **6.3** `tools/call` su `CatalogService-searchAssets` (query "elefante") → risultato vuoto, coerente con REST (nessun titolo/descrizione contiene la parola esatta)
- [x] **6.4** `tools/call` su `CatalogService-deepSearch` (query "elefante") → 4 risultati con similarity coerenti, stesso ordinamento/valori già visti via REST in Fase 5
- [x] **6.5** `tools/call` su `BillyService-askBilly` → risposta identica nella sostanza a quella REST, citazioni corrette con certificationLevel
- [x] **6.6** Comportamento auth osservato: nessuna credenziale fornita in nessuna chiamata, tutte hanno funzionato (200) — coerente con `auth: kind: dummy`, stesso comportamento di REST oggi. Nessun enforcement reale, come atteso.
- [x] **6.7** `cf app billy-srv` → 1/1 istanze, nessun riavvio durante l'intera sessione di test
- [x] **6.8** Log controllati (`cf logs billy-srv --recent`) — solo richieste 200, nessun errore/eccezione nascosta
- [x] **6.9** Confermato (vedi anche §1.10 e registro deviazioni): `CatalogService-describe` elenca solo `entities: ["Asset", "ScanStates"]` — `Asset.attachments` non è esposta via MCP, nessuna regressione possibile sul bug di Fase 5

---

## 7. Versionamento

- [x] **7.1** Commit su `dev` (solo i file di Fase 7 — un'altra sessione ha in corso modifiche non correlate su `app/index.html`, `app/app.js`, `app/styles.css`, `doc/V1/external-brief/`, lasciate intatte e non incluse)
- [x] **7.2** Push `origin/dev`
- [x] **7.3** Merge `dev` → `master`
- [x] **7.4** Push `master`
- [x] **7.5** Ritorno su `dev`

---

## 8. Chiusura fase

- [x] **8.1** Checklist aggiornata con gli esiti reali (questa modifica)
- [x] **8.2** `roadmap.md` marcata: Fase 7 — ✅ COMPLETATA (08/09/2026)
- [x] **8.3** Riepilogo dato all'utente in chat. Limiti noti non risolti in questa fase (già discussi/accettati): nessun rate limiting/audit log/workflow di approvazione sui tool MCP (limite del pacchetto stesso, da rivalutare a Fase 8 insieme a XSUAA); `askBilly` annotato `destructiveHint: true` per come è modellato come `action` invece di `function` (cosmetico, non bloccante).

---

## Registro delle deviazioni

- **Bug reale trovato al primo deploy: le route MCP non venivano registrate affatto** (nessun errore, nessun log — `/mcp/catalog` e `/mcp/billy` rispondevano 404 sia su CF che in locale). Causa trovata leggendo il codice sorgente di `@sap/cds` (`node_modules/@sap/cds/lib/srv/protocols/index.js`, funzione `endpoints4()`): quando un servizio ha già un'annotazione `@protocol` esplicita (il nostro caso: `protocol: 'rest'` dichiarato inline fin da v0.0.1), il framework usa **solo** quel valore e salta del tutto la scansione di annotazioni protocollo individuali come `@mcp`/`@odata`/`@rest` — quella scansione avviene solo in assenza di un `@protocol` esplicito. La semplice `annotate CatalogService with @mcp;` (come da documentazione capire, che però presuppone nessun `@protocol` preesistente) non bastava nel nostro caso.
  **Fix**: sostituita con `annotate CatalogService with @protocol: ['rest', 'mcp'];` (array, non annotazione `@mcp` a parte) — stessa cosa per `BillyService`. Verificato in locale (`cds-serve --in-memory`) che il log di avvio mostri `at: [ '/rest/catalog', '/mcp/catalog' ]` prima di procedere al redeploy su CF.
- **Trovato durante il test**: `mbt build` non include mai `node_modules` nel modulo `billy-srv` (solo `app/`, `srv/`, `package.json`) — le dipendenze vengono installate dal `nodejs_buildpack` al momento di `cf deploy`, non alla build MTA. Il task 5.4 della checklist ipotizzava erroneamente il contrario (assunzione ereditata dal template di Fase 5, mai verificata letteralmente neanche lì) — corretto a verificare invece che `package.json` bundlato dichiari la dipendenza, e che i log di staging (`cf logs`) mostrino `npm install` completato senza errori.
- **Verificato (§1.10)**: il tool `describe`/`query` di `CatalogService` espone solo le entità `Asset` e `ScanStates` — `Asset.attachments` (composition target) **non è esposta affatto** via MCP. Nessun rischio di regressione sul bug del plugin `@cap-js/attachments` risolto in Fase 5: la superficie coinvolta in quel bug non è nemmeno raggiungibile da MCP.
- **Osservazione minore, non bloccante**: il tool `BillyService-askBilly` viene annotato dal generatore MCP con `destructiveHint: true` — un artefatto di come `askBilly` è modellato come `action` (non `function`) in `billy-service.cds` fin dalle fasi precedenti, per quanto sia in realtà una sola lettura RAG senza side-effect. Non corretto in questa fase (richiederebbe cambiare `action` in `function`, una modifica di modellazione fuori scope per "esporre via MCP").
