# Checklist — Fase 5: Upload file reale

> Riferimento: [architecture.md](architecture.md) §6, [roadmap.md](roadmap.md) Fase 5, [HANDOFF.md](../V0.0.1/HANDOFF.md) §2 (D9 revocata, D15). Stesso workflow delle fasi precedenti: analisi approfondita → checklist → verifica coerenza → implementazione → test → verifiche → push `dev` → merge `master` → ritorno a `dev`.
>
> **Vincoli assoluti, non negoziabili in questa fase:** nessun Object Store, nessun binding di un vero Malware Scanning Service, nessuna auth reale (XSUAA resta `kind: dummy`), un solo modello LLM (Claude Sonnet 4.6, nessun routing). **Conferma esplicita richiesta all'utente prima di ogni deploy reale su Cloud Foundry.**

---

## 0. Prerequisiti

- [ ] **0.1** Branch `dev` sincronizzato con origin, Fase 0/1/2 già mergiate
- [ ] **0.2** `billy-srv` attivo su CF

---

## 1. Analisi approfondita — risultati della ricerca (da fare PRIMA di scrivere codice)

Questa sezione documenta cosa è stato verificato leggendo il codice sorgente reale (non solo la documentazione), come da metodo già usato per la decisione storage HANA vs Object Store.

- [x] **1.1** Installato `@cap-js/attachments` (ultima versione: **4.0.0**) e letto il codice sorgente (`lib/helper.js`, `lib/plugin.js`, `srv/attachments/basic.js`, `srv/malware-scanner/*.js`) per capire il comportamento esatto di storage `kind: "db"` e dello scanning.
- [x] **1.2** **Scoperta critica non ovvia**: il plugin, nel proprio `package.json`, definisce dei default **per profilo CDS** che noi non avevamo previsto:
  - `[development]`: `attachments.kind: "db"`, `malwareScanner.kind: "malwareScanner-mocked"`
  - `[production]`: `attachments.kind: "standard"` (**Object Store!**), `malwareScanner.kind: "malwareScanner-btp"` (**scanner reale!**)
  - `[hybrid]`: come production, con `scan: true` forzato

  **Implicazione:** il nostro deploy su Cloud Foundry usa il profilo `production` (stesso meccanismo già sfruttato per `db.kind: hana` nelle fasi precedenti). Senza un override esplicito nel nostro `package.json`, il plugin tenterebbe **Object Store** e un **vero malware scanner** in produzione — esattamente l'opposto di quanto richiesto. Va sovrascritto esplicitamente.
- [x] **1.3** **Scoperta sul comportamento di `scan: false`**: leggendo `srv/malware-scanner/malwareScanner.js` (`_scanAttachmentsFile`), la scansione è saltata con un semplice `return` immediato se `scan === false`, **senza** modificare lo stato dell'allegato — che resta quindi al suo default `'Unscanned'` (definito nel modello `sap.attachments.Attachment`). Questo è esattamente il comportamento "placeholder, non silenzio" richiesto da architecture.md §6: nessuna falsa marcatura "Clean", lo stato riflette onestamente che non è mai stato scansionato.
- [x] **1.4** **Attenzione — non usare `malwareScanner-mocked` per "risolvere" lo scanning**: il mock (`malwareScanner-mocked.js`) marca **sempre** `isMalware: false` (quindi lo stato diventerebbe `'Clean'`, non `'Unscanned'`) — è pensato per lo sviluppo locale, non per il nostro caso d'uso. Usarlo darebbe una falsa sicurezza, il contrario di quanto vogliamo. **Decisione**: usare comunque `malwareScanner.kind: "malwareScanner-mocked"` (per evitare che l'app tenti di istanziare la classe reale che richiede credenziali BTP), **ma sempre in combinazione con `attachments.scan: false`** — con questa combinazione, `scanFile` del mock non viene mai nemmeno invocato (il `return` anticipato avviene prima), quindi lo stato resta `'Unscanned'` come vogliamo. Il mock qui serve solo come implementazione "innocua" della classe, mai eseguita.
- [x] **1.5** Verificato che `getAttachmentKind()` (`lib/helper.js`) ritorna `"db"` per **qualunque** valore di `attachments.kind` diverso esattamente dalla stringa `"standard"` — quindi impostare `"kind": "db"` è corretto e sufficiente (non serve altro).
- [x] **1.6** Verificata l'entità/aspect generata: `Attachments` (da `@cap-js/attachments`) include `cuid, managed` + `url, content (LargeBinary), mimeType, filename, hash, status (default 'Unscanned'), lastScan, note`. Limite dimensione file di default: 400MB (irrilevante, imponiamo un limite applicativo nostro più basso, vedi §4).
- [x] **1.7** Verificato il pattern programmatico per scrivere un attachment senza passare dagli handler REST/OData generati dal plugin (che assumono Fiori draft, non compatibile 1:1 col nostro protocollo REST semplice): `const AttachmentsSrv = await cds.connect.to('attachments'); await AttachmentsSrv.put(entityDef, { ID, up__ID: <parentID>, content: <Buffer>, filename, mimeType })` — stesso pattern usato internamente dal plugin (`lib/plugin.js`, handler `createAttachments`). **Il nome esatto dell'entità (`this.entities['Asset.attachments']` o simile) e il funzionamento end-to-end non sono garantiti dalla sola lettura del codice — vanno verificati con un test reale (task 9.x), non assunti.**
- [x] **1.8** Librerie di estrazione testo verificate (non scelte a caso):
  - **PDF**: `pdf-parse` v2.4.5 — stato "sustainable" su npm/Snyk, 6.7M download/settimana, API: `new PDFParse({data: buffer}).getText()` → `{text}`. Nessuna PR recente ma libreria matura per un problema (estrazione testo PDF) sostanzialmente stabile — non serve sviluppo attivo continuo.
  - **DOCX**: `mammoth` v1.12.2 — pubblicata 8 giorni fa al momento della verifica, **attivamente mantenuta**. API: `mammoth.extractRawText({buffer}).then(r => r.value)`.
  - Nessuna delle due richiede binding a servizi esterni BTP — sono pure librerie Node, eseguite in-process.

---

## 2. Configurazione `@cap-js/attachments` (`package.json`)

- [x] **2.1** Aggiungere `@cap-js/attachments`, `pdf-parse`, `mammoth` a `dependencies`
- [x] **2.2** Aggiungere in `cds.requires`:
  ```json
  "attachments": {
    "kind": "db",
    "scan": false,
    "[production]": { "kind": "db", "scan": false }
  },
  "malwareScanner": {
    "kind": "malwareScanner-mocked",
    "[production]": { "kind": "malwareScanner-mocked" }
  }
  ```
  **Nota sulla ridondanza apparente** (`kind`/`scan` sia a livello radice che sotto `[production]`): scelta deliberata per eliminare ogni ambiguità sulla precedenza di merge tra la configurazione di default del plugin (che è profile-scoped) e la nostra (altrimenti non-scoped) — stesso pattern già usato con successo per `db.kind` nelle fasi precedenti. Va comunque **verificato con un deploy reale** (task 8.x) che l'override funzioni davvero in produzione, non assunto per certo dalla sola lettura statica.
- [x] **2.3** Verificare che non compaia alcuna configurazione `objectStore` aggiuntiva né alcun riferimento a binding di servizi esterni

---

## 3. Schema dati (`db/schema.cds`)

- [x] **3.1** `using { Attachments } from '@cap-js/attachments';` in cima al file
- [x] **3.2** Aggiungere `attachments : Composition of many Attachments;` su `Asset` (non su `AssetRevision` — l'Asset esiste già, seppur `published: false`, dal momento dell'upload, vedi architecture.md §2). Rimuovere il commento che spiegava l'esclusione precedente ("NON aggiunto in questa fase...").
  **Nota su un limite noto e accettato per questa fase**: se un `editAsset` allega un nuovo file su un asset già pubblicato, il nuovo allegato si aggiunge/sostituisce sull'Asset **prima** che la revisione sia approvata (perché gli attachment vivono sull'Asset, non sulla revisione) — stesso tipo di limite già annotato per l'edge case "doppia revisione pending" in Fase 2. Non bloccante per il flusso principale (prima pubblicazione), da tenere presente.
- [x] **3.3** Compilato senza errori
- [x] **3.4** Nomi fisici verificati via DDL:
  - Tabella → **`BILLY_ASSET_ATTACHMENTS`**, chiave composita `(up__ID, ID)` — `up__ID` è la FK verso `Asset.ID` (conferma esatta di quanto documentato nel README del plugin)
  - `content` → tipo **`BLOB`** nativo (non NCLOB)
  - **Scoperta non prevista**: la colonna `mimeType` viene generata **quotata** come `"MIMETYPE"` nel DDL — probabile parola riservata HANA, come già visto per `text`. Non impatta l'implementazione pianificata (si scrive via `AttachmentsSrv.put()`, un'API CDS/CQL che gestisce il mapping fisico da sola, non SQL raw), ma da ricordare se in futuro si scrivesse SQL raw contro questa tabella.

---

## 4. Estrazione testo (`srv/lib/text-extraction.js`)

- [x] **4.1** Creare `srv/lib/text-extraction.js` con funzione `extractText(buffer, mimeType, fileName)`:
  - Se `mimeType === 'application/pdf'` o `fileName` termina in `.pdf` → `pdf-parse`
  - Se `mimeType` è il MIME ufficiale docx (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) o `fileName` termina in `.docx` → `mammoth.extractRawText`
  - Altrimenti → `buffer.toString('utf-8')` (fallback per `.txt` o tipi sconosciuti, nessun errore bloccante)
- [x] **4.2** Limite dimensione applicativo: **10MB** decodificati (scelta ragionevole per documenti interni, non dai default del plugin che non si applicano comunque alla nostra chiamata `.put()` diretta) — rifiutare con un errore chiaro se superato, **prima** di tentare qualunque parsing

---

## 5. `CatalogService` — estensione upload con file (`srv/catalog-service.cds`/`.js`)

- [x] **5.1** Estendere `uploadAsset` e `editAsset` con 3 parametri opzionali: `fileContent` (LargeString, base64), `fileName` (String), `fileMimeType` (String)
- [x] **5.2** `onUploadAsset`/`onEditAsset`: se `fileContent` è presente:
  1. Decodifica base64 → `Buffer`
  2. Verifica dimensione (task 4.2)
  3. `extractText(buffer, fileMimeType, fileName)` → testo
  4. Usa il testo estratto come `content` della `AssetRevision` (il testo incollato manualmente resta supportato se non viene fornito alcun file — i due modi di input coesistono, non si escludono a vicenda nello schema, ma **uno dei due va fornito**, verificare/segnalare se mancano entrambi)
  5. Salva comunque il file originale come `Attachment` sull'`Asset` (per download futuro), via `AttachmentsSrv.put(...)` (pattern task 1.7)
- [x] **5.3** Nessuna modifica a `onReviewRevision`: continua a leggere `revision.content` esattamente come prima — che il testo venga da un incolla-testo o da un'estrazione file è ormai indifferente a questo punto della pipeline (per design, vedi §1)
**Nota implementativa (non una deviazione, una scelta fatta in fase di scrittura codice):** `resolveContent()` richiede **sempre** uno tra `content`/`fileContent`, anche per `editAsset` — niente modifiche "solo metadati" (titolo/descrizione senza toccare il contenuto) in questa fase. Motivazione: senza questo vincolo, una `AssetRevision` con `content` vuoto approvata rigenererebbe i chunk da stringa vuota, azzerando silenziosamente il contenuto vettorizzato esistente. Il vincolo è più semplice e più sicuro che gestire correttamente il caso "mantieni il contenuto precedente" ora — rimandabile a una fase successiva se servirà davvero.

- [x] **5.4** Estendere `onDeleteAsset` (Fase 2) per eliminare anche gli `Attachment` associati prima di eliminare l'Asset — altrimenti resterebbero BLOB orfani su HANA (stesso tipo di problema già affrontato con `billy.Document` orfano in Fase 0, stavolta prevenuto invece di scoperto a posteriori)

---

## 6. UI di test (`app/index.html`)

- [x] **6.1** Aggiungere un campo `<input type="file">` nella sezione upload, in alternativa/aggiunta alla textarea di testo
- [x] **6.2** JS: se un file è selezionato, leggerlo come base64 (`FileReader.readAsDataURL` + strip del prefisso `data:...;base64,`) e includerlo nel payload di `uploadAsset` insieme a `fileName`/`fileMimeType`

---

## 7. Verifica pre-implementazione

- [x] **7.1** Rileggere l'intera checklist end-to-end, verificare coerenza tra sezioni 1-6 (nomi parametri, nomi funzioni, nomi entità)
- [x] **7.2** Confermare che nessun task introduca Object Store, binding di un vero malware scanner, XSUAA reale, o routing multi-modello (fuori scope per vincolo esplicito)
- [x] **7.3** Confermare che `onReviewRevision`/`onSetCertificationLevel` (Fase 2) non necessitano modifiche, e che `onDeleteAsset` è stato esteso (task 5.4) per pulire anche gli attachment

---

## 8. Build e deploy di verifica

- [x] **8.1** `npm install` (nuove dipendenze)
- [x] **8.2** `cds build --production` — verificare che generi l'artefatto HDI per la tabella `Attachments` e che **non** compaiano riferimenti a Object Store nei file generati
- [x] **8.3** `mbt build`
- [x] **8.4** Ispezionare il `.mtar` (stesso metodo .NET ZipFile delle fasi precedenti): nessun segreto, `app/index.html` aggiornato, `srv/lib/text-extraction.js` presente, `node_modules` del pacchetto `billy-srv` include `@cap-js/attachments`/`pdf-parse`/`mammoth`
- [x] **8.5** ⚠️ Confermato dall'utente, eseguito `cf deploy` (più volte: fix del download allegato e del limite body-parser hanno richiesto rebuild+redeploy successivi)
- [x] **8.6** `billy-db-deployer` completato senza errori in ogni deploy (`Application "billy-db-deployer" staged` / task `deploy` eseguito)
- [x] **8.7** Nessun errore di credenziali/binding Object Store o malware scanner reale nei log di avvio; `billy-srv` avviato regolarmente ad ogni deploy

---

## 9. Test end-to-end reale

- [x] **9.1** Caricato asset con PDF reale (`Arriva un.pdf`, 95200 byte) via `uploadAsset` con `fileContent`/`fileName`/`fileMimeType` → HTTP 200
- [x] **9.2** Estrazione testo confermata (dopo approvazione, `askBilly` cita correttamente il contenuto del PDF)
- [x] **9.3** `reviewRevision` approvata → chunk generati dal testo estratto, asset `published: true`, `certified`
- [x] **9.4** `askBilly` risponde citando correttamente il PDF come fonte (`"Test PDF download fix"`, certificationLevel `certified`)
- [x] **9.5** Ripetuto 9.1-9.4 con file **DOCX** (`hfk.docx`) — stesso esito positivo
- [x] **9.6** Allegato scaricabile: bug reale trovato (crash del processo, vedi registro deviazioni) e **risolto** con function custom `downloadAttachment` — verificato byte-identico all'originale sia per PDF che per DOCX
- [x] **9.7** Stato allegato verificato via `GET .../attachments`: `"status":"Unscanned"` confermato (mai `Clean`/`Scanning`)
- [x] **9.8** Limite dimensione testato con file fittizio da 11MB (oltre soglia 10MB) → `400 "File troppo grande (max 10MB)"`, nessun crash, app rimasta 1/1 sana
- [x] **9.9** Caso "né testo né file forniti" testato → `400 "Fornire almeno uno tra..."`, nessun crash
- [x] **9.10** Log controllati ad ogni deploy/test (nessun errore nascosto oltre al bug 9.6, già isolato e risolto)

---

## 10. Versionamento

- [ ] **10.1** Commit su `dev`
- [ ] **10.2** Push `origin/dev`
- [ ] **10.3** Merge `dev` → `master`
- [ ] **10.4** Push `master`
- [ ] **10.5** Ritorno su `dev`

---

## 11. Chiusura fase

- [x] **11.1** Checklist aggiornata con gli esiti reali (questa modifica)
- [x] **11.2** `roadmap.md` marcata: Fase 5 — ✅ COMPLETATA (08/09/2026)
- [x] **11.3** Riepilogo dato all'utente in chat (bug download + fix, limite body-parser, test PDF/DOCX byte-identici). Limiti noti rimandati: malware scanning reale (Fase 8 o mai, architecture.md §6), edge case "nuovo file su editAsset di asset già pubblicato" (§3.2)

---

## Registro delle deviazioni

- **Bug reale e serio trovato in test 9.6 (download allegato): crash dell'intero processo `billy-srv`, non solo un errore HTTP.** Chiamando l'endpoint auto-generato dal plugin `GET /rest/catalog/Asset/<id>/attachments/<attId>/content`, il processo Node è crashato con `TypeError: Cannot read properties of undefined (reading 'ID')` in `@cap-js/attachments/lib/generic-handlers.js:157` (`getScanInfo`, chiamata da `validateAttachment`). Causa identificata leggendo il codice: `const id = req.data.ID || req.params?.at(-1).ID` assume che `req.params` sia popolato come lo popolerebbe il protocollo OData per un path annidato — con il nostro `protocol: 'rest'` (scelto fin dalla v0.0.1 per semplicità dei test) questo non accade, e `req.params?.at(-1)` risulta `undefined`, quindi `.ID` lancia l'eccezione. L'eccezione non viene intercettata da nessun try/catch nel plugin, quindi risale fino a far crashare l'intero processo (Cloud Foundry lo ha riavviato automaticamente, ma qualunque richiesta a questo endpoint lo farebbe ricrashare).
  **Non è un bug nostro**: è un'incompatibilità tra il meccanismo di download automatico del plugin (pensato per OData/Fiori) e la nostra scelta di `protocol: 'rest'`. Patchare `node_modules` non è un'opzione sostenibile (si perderebbe ad ogni `npm install`). **Il flusso principale (RAG: upload → estrazione testo → chunking → citazione da Billy) funziona correttamente e non passa da questo endpoint** — è isolato al solo download del file originale.
  **Decisione: segnalato esplicitamente all'utente prima di procedere oltre**, non deciso unilateralmente se e come risolverlo in questa fase.
  **Risolto**: aggiunta una function custom `downloadAttachment(assetId, attachmentId)` in `catalog-service.cds`/`.js` che bypassa del tutto l'endpoint generato dal plugin. Legge filename/mimeType con una `SELECT` propria e il contenuto via `AttachmentsSrv.get()`, poi scrive la risposta direttamente su `req.res` (`Content-Type` + `Content-Disposition`), così l'evento dispatchato è `downloadAttachment`, non `READ` — gli hook `before/after('READ', ...)` del plugin (dove vive il bug) non vengono nemmeno attraversati. Il contenuto va inoltrato con `pipeline(content, req.res)` quando il driver restituisce uno stream (HANA in produzione), non con `res.send()` (che su sqlite riceve un `Buffer` diretto, ma su HANA un `Readable` — `res.send()` su uno stream produce solo la stringa `"[object Readable]"`, scoperto nel primo test su CF). Verificato in produzione (CF): upload PDF reale (`Arriva un.pdf`, 95200 byte) → approvazione → download → **byte-identico all'originale**; stesso esito per l'allegato Word già testato in precedenza. App non riavviata durante nessuno dei due test (niente crash). Contestualmente innalzato anche `cds.server.body_parser.limit` a `15mb` in `package.json` (default 100kb, insufficiente per un file da 10MB in base64, limite scoperto testando l'upload del PDF reale).
