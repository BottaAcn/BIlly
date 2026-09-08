# Checklist — Fase 6: Approuter + HTML5 App Repo + Destination (senza XSUAA)

> Riferimento: [architecture.md](architecture.md) §10, [roadmap.md](roadmap.md) Fase 6. Stesso workflow delle fasi precedenti: analisi approfondita → checklist → verifica coerenza → implementazione → test → verifiche → push `dev` → merge `master` → ritorno a `dev`.
>
> **Decisione esplicita dell'utente (08/09/2026)**: costruire approuter + destination + HTML5 App Repo **ora**, con `authenticationMethod: "none"` (nessun login reale) — quando XSUAA sarà pronta (Fase 8) si attiverà l'auth su questa stessa infrastruttura, senza doverla ricostruire. **Conferma esplicita richiesta all'utente prima di ogni deploy reale su Cloud Foundry.**

---

## 0. Prerequisiti

- [x] **0.1** Branch `dev` sincronizzato con origin, Fase 10 mergiata in `master`
- [x] **0.2** `billy-srv` attivo su CF, frontend v0 servito direttamente da CAP (`app/index.html`, `app.js`, `styles.css`)
- [x] **0.3** Entitlement verificati con `cf marketplace`: `html5-apps-repo` (piani `app-host`+`app-runtime`) e `destination` disponibili — **da verificare anche il piano esatto di `destination`** (task 1.x)

---

## 1. Analisi approfondita — risultati della ricerca (da fare PRIMA di scrivere codice)

- [x] **1.1** Trovato e letto un reference SAP reale e completo già presente nel repo (`reference/btp-cap-genai-rag/mta.yaml`, `router/xs-app.json`, `router/dev/xs-app.json`, `app/ui/xs-app.json`) — usato come blueprint verificato invece di procedere a tentativi.
- [x] **1.2** Pattern dei moduli MTA (dal reference): `<app>-approuter` (`approuter.nodejs`), `<app>-ui` (`html5`), `<app>-app-deployer` (`com.sap.html5.application-content`, dipende da `@sap/html5-app-deployer` npm), più le risorse `destination`, `html5-repo-host` (piano `app-host`), `html5-repo-runtime` (piano `app-runtime`).
- [x] **1.3** `cf marketplace -e destination` verificato: piano `lite` disponibile (stesso piano usato nel reference).
- [x] **1.4** Verificato `cds add approuter`/`cds add workzone` nella doc ufficiale capire: esistono comandi di scaffolding, ma **workzone userebbe un approuter gestito da SAP Fiori Launchpad** — architettura diversa da quella già scritta in `architecture.md` (`billy-approuter` custom). Scelto di seguire il piano già scritto (approuter custom), non lo scaffolding Work Zone, per coerenza con la documentazione esistente.
- [x] **1.5** Sintassi minima di `manifest.json` per un'app HTML5 statica (senza UI5/build step) verificata: richiede solo `sap.app.id` e `sap.app.applicationVersion.version`.
- [x] **1.6** **Incertezza reale — cinque giri di verifica empirica prima di trovare la configurazione giusta** (nessuna fonte, reference incluso, dava la risposta corretta e completa):
  1. Pattern del reference (`@sap/html5-app-deployer` npm, nessun `requires` esplicito) → ispezionato l'`.mtar`: deployer vuoto (solo `package.json`), niente contenuto di `billy-ui`.
  2. Trovato l'esempio ufficiale SAP (`SAP-samples/multi-cloud-html5-apps-samples/.../mta.yaml`): `type: com.sap.application.content` + `build-parameters.requires` con `artifacts: ["<modulo>-content.zip"]`. Provato con `billy-ui-content.zip` → `resources/` creata ma vuota.
  3. Isolato il vero nome dell'artefatto con `mbt module-build -m billy-ui` (build del solo modulo, senza cleanup): produce `data.zip`. Provato `artifacts: ["data.zip"]` → ancora vuoto.
  4. Provato il wildcard `artifacts: ["*"]` (come nell'esempio canonico della doc mbt) → questa volta `resources/` si popola con tutti i file sorgente grezzi di `billy-ui`. **Sembrava risolto, ma il deploy reale (task 5.4) ha rifiutato il pacchetto**: `[ERROR] Upload application content failed { CODE: '1001' } validation error: Invalid file format. The request body must include a zip file that contains a zip file for each HTML5 application`. Il problema vero: `html5-apps-repo` si aspetta uno **zip esterno contenente uno zip interno per app**, non file grezzi né un unico livello di zip.
  5. **Soluzione finale**: abbandonato il meccanismo `build-parameters.requires`/`artifacts` di `mbt` (troppo fragile/non documentato per questo caso), sostituito con uno script dedicato (`scripts/zip-html5-content.js`, usa `jszip` — già presente transitivamente, aggiunto come devDependency esplicita) che produce **noi stessi** lo zip interno (`billy-ui.zip`) dentro una nuova cartella `html5-content/`, lanciato in `build-parameters.before-all` (stesso punto di `copy-app.js`). Il modulo `billy-html5-app-deployer` punta direttamente a `path: ./html5-content` con `type: com.sap.application.content` — `mbt` lo impacchetta normalmente (zippando la cartella), producendo così lo zip esterno che contiene l'unico entry `billy-ui.zip` — esattamente la struttura richiesta. Verificato byte per byte nell'`.mtar` finale. Modulo `billy-ui` (type `html5`) e cartella `html5-deployer/` (con `package.json`/`@sap/html5-app-deployer`) **rimossi**, non più necessari.
  6. **Tentativo laterale**: provato anche `npx cds add html5-repo` (tool ufficiale CAP) sperando in uno scaffolding corretto automatico — ha generato moduli duplicati/rotti (trattava `app/js` e `app/styles` come moduli UI5 con `npm run build` inesistente) e modificato `package.json` in modo indesiderato. Scartato, ripristinato lo stato precedente con `git checkout`.
- [x] **1.7** Il nostro frontend (`app/index.html`, `app/app.js`, `app/styles.css`) è statico, nessun build step — più semplice del reference (che builda un'app UI5/TypeScript). Serve solo un `manifest.json` + `xs-app.json` propri, nessun comando di build.
- [x] **1.8** Route dell'app (dentro il modulo `-ui`, non nel router): `^/rest/(.*)$` e `^/mcp/(.*)$` → `destination` verso `billy-srv` (analogo a `^/api/...` nel reference, ma REST+MCP invece di OData); tutto il resto → `service: html5-apps-repo-rt` (serve i file statici). Route del router (top-level): tutto verso `html5-apps-repo-rt`, `authenticationMethod: "none"` invece di `"route"`/`xsuaa` (nessun login ancora, per decisione esplicita).
- [x] **1.9** **Correzione trovata in rilettura**: la risorsa `destination` referenzia l'URL di `billy-srv` tramite riferimento incrociato MTA (`~{billy-srv-props/srv-url}`, stesso pattern del reference) — questo richiede aggiungere un piccolo blocco `provides` a `billy-srv` in `mta.yaml` (pubblica il proprio `${default-url}`). **Non è un nuovo `requires`**: `billy-srv` non acquisisce nessuna nuova dipendenza né comportamento diverso, pubblica solo un dato che la risorsa `billy-destination` consulta.

---

## 2. Nuovi file e moduli

- [x] **2.1** `billy-app/router/xs-app.json` — router minimale, `authenticationMethod: "none"`, tutto verso `html5-apps-repo-rt`
- [x] **2.2** `billy-app/router/package.json` — dipendenza `@sap/approuter`
- [x] **2.3** `billy-app/app/manifest.json` — descrittore minimo (`sap.app.id`, `applicationVersion`)
- [x] **2.4** `billy-app/app/xs-app.json` — route `/rest/*` e `/mcp/*` verso la destination `billy-srv-api`, resto verso `html5-apps-repo-rt`
- [x] **2.5** ~~`billy-app/html5-deployer/package.json`~~ — **creato poi rimosso** (§1.6): non serve nessun pacchetto npm runtime
- [x] **2.6** `billy-app/scripts/zip-html5-content.js` — produce `html5-content/billy-ui.zip` (zip interno con tutto il contenuto di `app/`), lanciato in `build-parameters.before-all`
- [x] **2.7** `jszip` aggiunto a `devDependencies` in `package.json` (già presente transitivamente, ora dichiarato esplicitamente)

---

## 3. `mta.yaml` — nuovi moduli e risorse

- [x] **3.1** Modulo `billy-approuter` (`approuter.nodejs`, `path: ./router`), `requires`: `billy-destination`, `billy-html5-repo-runtime`
- [x] **3.2** ~~Modulo `billy-ui` (`html5`, `path: ./app`)~~ — **rimosso** (§1.6.5), non più necessario con lo script dedicato
- [x] **3.3** Modulo `billy-html5-app-deployer` (`com.sap.application.content`, `path: ./html5-content`), `requires`: `billy-html5-repo-host` con `parameters.content-target: true`
- [x] **3.4** Risorsa `billy-destination` (`destination`, piano `lite`), con `init_data` che punta all'URL di `billy-srv`
- [x] **3.5** Risorse `billy-html5-repo-host` (piano `app-host`) e `billy-html5-repo-runtime` (piano `app-runtime`)
- [x] **3.6** **Non toccato** il blocco XSUAA già commentato — resta commentato fino a Fase 8
- [x] **3.7** Aggiunto a `billy-srv` un piccolo `provides` (`billy-srv-props`, proprietà `srv-url: ${default-url}`) — nessuna modifica a `requires`/comportamento (§1.9)

---

## 4. Verifica pre-implementazione

- [x] **4.1** Riletti tutti i nuovi file, nomi `billy-*` coerenti tra `mta.yaml` e i file referenziati (`router/xs-app.json`↔`billy-approuter`, `app/xs-app.json`↔destination `billy-srv-api`, ecc.)
- [x] **4.2** Confermato: unica modifica a `billy-srv` è il nuovo blocco `provides` — `requires`/comportamento invariati, resta raggiungibile direttamente come prima
- [x] **4.3** Confermato: nessuna riga attiva XSUAA reale — `billy-uaa` resta commentato, `authenticationMethod: "none"` in entrambi gli `xs-app.json`

---

## 5. Build e deploy di verifica

- [x] **5.1** `mbt build`
- [x] **5.2** Ispezionato l'`.mtar` finale: `billy-html5-app-deployer/data.zip` (esterno) contiene esattamente un entry `billy-ui.zip` (interno), che a sua volta contiene tutto il contenuto di `app/` (`index.html`, `js/**`, `styles/main.css`, `manifest.json`, `xs-app.json`) — struttura annidata corretta, verificata byte per byte
- [x] **5.3** Nessun segreto nel pacchetto (nessun riferimento a `service-key.local.json`/credenziali)
- [x] **5.4** ⚠️ Confermato dall'utente, eseguito `cf deploy` (più tentativi — vedi registro deviazioni per il deploy concorrente dell'altra sessione e il fix del path prefix)
- [x] **5.5** Tutti i servizi/moduli avviati senza errori: `billy-approuter` 1/1, `billy-srv` 1/1, `billy-destination`/`billy-html5-repo-host`/`billy-html5-repo-runtime` bindati correttamente

---

## 6. Test end-to-end reale

- [x] **6.1** URL dell'approuter aperto nel browser → app caricata correttamente (200 OK su `/index.html`)
- [x] **6.2** Chat Billy testata dal vero tramite approuter (domanda "Cosa dice il documento Arriva un elefante?") → risposta corretta con citazioni e badge di certificazione, instradata correttamente via destination
- [x] **6.3** Catalogo testato dal vero tramite approuter → 4 asset mostrati correttamente con stato di certificazione
- [x] **6.4** Confermato: nessun login richiesto in nessun passaggio (coerente con `authenticationMethod: none`)
- [x] **6.5** Confermato: URL diretto di `billy-srv` continua a funzionare in parallelo — REST (`searchAssets` → 200) e MCP (`initialize` → risposta valida) entrambi testati
- [x] **6.6** App stabili: `billy-approuter` 1/1, `billy-srv` 1/1, nessun errore nei log dopo il fix finale

---

## 7. Versionamento

- [x] **7.1** Commit su `dev`
- [x] **7.2** Push `origin/dev`
- [x] **7.3** Merge `dev` → `master`
- [x] **7.4** Push `master`
- [x] **7.5** Ritorno su `dev`

---

## 8. Chiusura fase

- [x] **8.1** Checklist aggiornata con gli esiti reali (questa modifica)
- [x] **8.2** `roadmap.md` marcata: Fase 6 — 🟡 PARZIALMENTE COMPLETATA (08/09/2026), XSUAA resta esplicitamente Fase 8
- [x] **8.3** Riepilogo dato all'utente in chat. Limiti noti/rimandati: nessuna auth reale ancora (per scelta, Fase 8 la attiverà su questa stessa infrastruttura); rischio di deploy concorrenti quando due sessioni lavorano sullo stesso spazio CF (osservato in questa fase, nessuna mitigazione tecnica messa in atto oltre alla consapevolezza).

---

## Registro delle deviazioni

- **Primo tentativo di deploy reale fallito** (confermando §1.6.4): `cf deploy` ha creato correttamente tutti i nuovi servizi (`billy-html5-repo-host`, `billy-html5-repo-runtime`, `billy-destination`) e l'app `billy-approuter`, ma il caricamento del contenuto HTML5 è stato rifiutato dal servizio con `CODE: '1001'`, `Invalid file format. The request body must include a zip file that contains a zip file for each HTML5 application`. Causa e fix: vedi §1.6.5 (zip annidato prodotto da uno script dedicato invece che dal meccanismo `build-parameters.requires` di `mbt`). Nessun impatto su `billy-srv` (rimasto attivo e raggiungibile durante il tentativo fallito).
- **Deploy concorrente dell'altra sessione ha temporaneamente rimosso `billy-approuter`**: tra un tentativo e l'altro, `billy-approuter` è sparito da `cf apps` (servizi `billy-destination`/`billy-html5-repo-host`/`billy-html5-repo-runtime` rimasti orfani, senza app collegate). Causa: la sessione cf CLI è condivisa sulla stessa macchina tra le due chat — l'altra sessione ha eseguito un proprio `cf deploy` (verosimilmente con un `.mtar` locale precedente alle mie modifiche a `mta.yaml`, dato che il file su disco/git era comunque intatto), e la riconciliazione MTA ha rimosso moduli non presenti nel suo descrittore. Anche una sessione `cf login --sso` dell'altra chat ha invalidato il mio token a metà lavoro (`Authentication has expired`), richiedendo un nuovo passcode dall'utente. **Nessuna azione preventiva presa oltre a rifare build+deploy dal mio `mta.yaml` (corretto e aggiornato)** — da tenere presente come rischio operativo quando due sessioni lavorano sullo stesso spazio CF in parallelo.
- **Bug reale trovato dopo il deploy corretto**: anche con lo zip annidato giusto, l'app restava 503 (`x-apphost-cache-status` passava da MISS a HIT ma il contenuto non veniva servito). Isolato bypassando l'approuter e interrogando `html5-apps-repo-rt` direttamente con un token OAuth (service key temporanea, poi eliminata): `/index.html` → 503, ma `/billyui/index.html` → 200. **Causa**: `html5-apps-repo-rt` espone ogni app sotto un path pari al suo `sap.app.id` (`/billyui/...`), non alla radice — nessuna doc/reference consultata lo diceva esplicitamente. **Fix**: la route di fallback in `router/xs-app.json` ora ha `target: "/billyui$1"` invece di `target: "$1"`; spostate anche le route `/rest/*`/`/mcp/*` → destination direttamente nel router (non solo nell'`xs-app.json` imbustato nel contenuto HTML5, che con un approuter standalone non risulta consultato).
