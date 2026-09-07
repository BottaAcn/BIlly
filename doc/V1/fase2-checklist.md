# Checklist — Fase 2: Catalogo utilizzabile

> Riferimento: [architecture.md](architecture.md) §2, §3.1, §7 (design definito da sessione precedente, 07/09/2026), [roadmap.md](roadmap.md) Fase 2. Stesso workflow delle fasi precedenti: checklist → verifica → implementazione → test via deploy CF → push `dev` → merge `master` → ritorno a `dev`.

## Decisione architetturale preliminare (da verificare, non assumere per iniziare a scrivere codice)

`BillyService` oggi (Fase 0/1) espone `uploadAsset` senza flusso di revisione. Il nuovo design richiede che **ogni** pubblicazione passi da una coda di revisione. Avere `uploadAsset` in due servizi con semantica diversa sarebbe un conflitto/duplicazione. **Decisione presa in questa checklist**: `uploadAsset`/`editAsset` e tutta la gestione ciclo di vita si spostano in un **nuovo `CatalogService`** (`srv/catalog-service.cds`/`.js`, path `/rest/catalog`); `BillyService` resta puro RAG (solo `askBilly`). Coerente con la separazione di responsabilità di architecture.md §3.

**Scope esplicito di questa fase (da roadmap.md + architecture.md §3.1):** `Asset`+`AssetRevision`, flusso upload→revisione→approvazione, transizioni di stato libere, eliminazione riservata ad Admin, ricerca full-text + semantica opt-in, job di scadenza certificazione. **Fuori scope**: creazione di `PointEvent` reali (richiede `Season`, che è Fase 3 — vedi nota sotto), upload file/Object Store (Fase 5), frontend reale (Fase 4).

**Nota su PointEvent — deviazione dal testo letterale di architecture.md §3.1, motivata:** `PointEvent.season` è `not null`, ma `Season` non esiste ancora come funzionalità (Fase 3). Creare una Season "fittizia" ora per sbloccare i PointEvent contraddirebbe la roadmap (Fase 3 possiede quella logica). **Questa fase implementa tutto il flusso di approvazione tranne la creazione effettiva di `PointEvent`**, con un `TODO(Fase 3)` esplicito nel punto esatto del codice dove andrà agganciata.

---

## 0. Prerequisiti

- [ ] **0.1** Branch `dev` corrente, sincronizzato, Fase 0+1 già mergiate
- [ ] **0.2** `billy-srv` attivo su CF

---

## 1. Refactoring: estrazione librerie condivise

Sia `BillyService` che il nuovo `CatalogService` hanno bisogno di: caricare le credenziali AI Core, generare embedding, fare chunking, ottenere/creare il player di default. Estrarre per evitare duplicazione (oggi tutto vive solo in `billy-service.js`).

- [x] **1.1** Creare `srv/lib/ai.js`: centralizza il caricamento di `AICORE_SERVICE_KEY` (stesso pattern try/catch già collaudato) ed espone `embed(text)` (ritorna l'array di embedding) e `askClaude(systemPrompt, userMessage)` (ritorna il testo della risposta). Un solo punto dove vivono `RESOURCE_GROUP`, `EMBEDDING_MODEL`, `LLM_MODEL`.
- [x] **1.2** Creare `srv/lib/chunking.js`: sposta `chunkText()` qui invariata (700/100)
- [x] **1.3** Creare `srv/lib/default-player.js`: sposta `getOrCreateDefaultPlayer()` qui. **Cambio rispetto alla Fase 0/1**: il player di default viene creato con `isCertifier: true, isAdmin: true` — motivazione esplicita da annotare nel codice: finché XSUAA non esiste (D15) non c'è modo di distinguere utenti reali, quindi l'unico attore possibile deve poter testare i flussi da Certifier/Admin, altrimenti quelle azioni sarebbero non testabili fino a Fase 8. Da sostituire quando l'auth reale distinguerà i player.
- [x] **1.4** `srv/billy-service.js` riscritto: usa `embed`/`askClaude` da `lib/ai.js`, `onUploadAsset` rimosso
- [x] **1.5** `srv/billy-service.cds` riscritto: solo `askBilly`, nessuna entity `Asset`
- [x] **1.6** Pesi aggiornati a `1.0/0.75/0.35` nella costante `CERTIFICATION_WEIGHT_SQL`

---

## 2. Schema dati (`db/schema.cds`)

- [x] **2.1** `RevisionStatus` enum aggiunto (`pending`, `approved`, `rejected`)
- [x] **2.2** `other` aggiunto ad `AssetType`
- [x] **2.3** `SeniorityLevel` enum aggiunto (`analyst`, `senior`, `manager`)
- [x] **2.4** `Asset`: aggiunto `published: Boolean default false`, `revisions` composition. `attachments` **non** aggiunto (Fase 5), annotato nello schema con commento esplicito
- [x] **2.5** Entità `AssetRevision` aggiunta (cuid, managed)
- [x] **2.6** `Player`: sostituito il vecchio `seniority: String(50)` (Fase 0) con `seniorityLevel: SeniorityLevel` (rename/retype pulito — nessun dato reale esisteva su questo campo, solo il player anonimo), aggiunti `isCertifier`, `isAdmin`
- [x] **2.7** Compilato senza errori
- [x] **2.8** Nomi fisici verificati via DDL:
  - `published` → colonna **nativa `BOOLEAN`** (valori `TRUE`/`FALSE`, non 1/0) — importante per la query raw SQL di `searchAssets`
  - Tabella `AssetRevision` → **`BILLY_ASSETREVISION`** (camelCase collassato, nessun underscore aggiuntivo)
  - Nessuna nuova parola riservata oltre a `"TEXT"` già nota

---

## 3. `CatalogService` — definizione (`srv/catalog-service.cds`)

- [x] **3.1** `entity Asset as projection on db.Asset where published = true;` — filtro dichiarativo, solo asset pubblicati sono visibili/ricercabili
- [x] **3.2** `uploadAsset(title, description, type, content, externalLink) returns Asset` — crea Asset (`published: false`) + una `AssetRevision(status: pending, pointsPct: 100)`. **Nessun chunking/embedding qui** (avviene solo all'approvazione)
- [x] **3.3** `editAsset(assetId, title, description, content, type, externalLink) returns { revisionId: UUID }` — crea una nuova `AssetRevision(pending)` sull'asset esistente, senza toccare il contenuto live
- [x] **3.4** `listReviewQueue() returns array of { kind, revisionId, assetId, title, type, submittedBy, submittedAt }` — funzione, unione di revisioni pending + asset `certifiedOutdated`
- [x] **3.5** `reviewRevision(revisionId, approve, validityMonths, pointsPct, reason) returns Asset`
- [x] **3.6** `setCertificationLevel(assetId, certificationLevel, validityMonths) returns Asset` — **decisione implementativa**: un'unica azione generica per le "transizioni libere" invece di `deprecateAsset`/`certifyAsset` separate (architecture.md usa "qualunque altra transizione di stato diretta" — un'azione generica è più fedele all'idea di "qualsiasi stato → qualsiasi stato" che moltiplicare azioni nominali)
- [x] **3.7** `deleteAsset(assetId) returns Boolean` — verifica `isAdmin` sul player chiamante prima di eliminare
- [x] **3.8** `searchAssets(query: String) returns array of Asset` — ricerca full-text istantanea, nessuna chiamata AI
- [x] **3.9** `deepSearch(query: String) returns array of { assetId, title, similarity }` — ricerca semantica opt-in, riusa embedding esistenti
- [x] **3.10** `expireCertifications() returns { expiredCount: Integer }` — azione manualmente invocabile (vedi punto 6 per l'automazione)
- [x] **3.11** Verificare che nessuna riga `@(requires: ...)` sia presente/attiva (D15)

---

## 4. `CatalogService` — implementazione (`srv/catalog-service.js`)

- [x] **4.1** `onUploadAsset`: player di default → INSERT Asset (`published: false`, `certificationLevel: 'community'`) → INSERT AssetRevision (`status: 'pending'`, `pointsPct: 100`, `submittedBy`) → ritorna Asset (senza chunk, non ancora pubblicato)
- [x] **4.2** `onEditAsset`: verifica che l'Asset esista, INSERT nuova AssetRevision (`pending`) con i campi forniti, non tocca l'Asset live, ritorna `{revisionId}`
- [x] **4.3** `onListReviewQueue`: query 1 = `AssetRevision` con `status='pending'` JOIN `Asset` (l'Asset esiste **sempre** già quando c'è una revisione pending — `uploadAsset` li crea insieme nello stesso momento, quindi nessun caso speciale da gestire per la primissima pubblicazione); query 2 = `Asset` con `certificationLevel='certifiedOutdated'`. Unisce i due risultati con discriminatore `kind: 'revision'|'renewal'`.
  **Nota su edge case non gestito in questa fase**: se un asset ha già una revisione `pending` e si chiama di nuovo `editAsset` su di esso, si creano due revisioni `pending` per lo stesso asset (nessun vincolo che lo impedisca). Non bloccante per il test end-to-end di questa fase, ma da tenere presente.
- [x] **4.4** `onReviewRevision` — helper interno `regenerateChunks(assetId, content, certificationLevel)` (DELETE chunk esistenti + chunking + embedding + INSERT nuovi, riusando `chunkText`/`embed` di `srv/lib/`):
  - Carica la `AssetRevision` per `revisionId`
  - **Caso A — `status === 'pending'` (prima pubblicazione o modifica con nuovo contenuto)**:
    - `approve=true`: copia i campi della revisione sull'Asset, `regenerateChunks(...)`, `published=true`, `certificationLevel='certified'`, `certifiedBy=player.ID`, `certifiedAt=now`, `certificationExpiresAt = now + validityMonths mesi`. Marca la revisione `approved`, `reviewedBy`, `reviewedAt`. **`TODO(Fase 3)`**: qui andranno i due `PointEvent` (uploader `pointsPct`%, certificatore pieno) — non creati in questa fase, vedi nota in testa al documento.
    - `approve=false`: revisione → `rejected`, `reviewedBy`, `reviewedAt`, `reason` salvato. Asset invariato.
  - **Caso B — `status === 'approved'` (rinnovo di un asset `certifiedOutdated`, stesso contenuto)**: se `approve=true`, aggiorna solo `certifiedAt=now`, `certificationExpiresAt = now + validityMonths`, `certificationLevel='certified'` — **nessuna rigenerazione chunk** (contenuto invariato). `TODO(Fase 3)` per il PointEvent del certificatore. Se `approve=false` su un rinnovo: **non supportato in questa fase** (il rifiuto ha senso solo su contenuto nuovo) — ritornare un errore esplicativo (`req.error(...)`), non un crash silenzioso.
- [x] **4.5** `onSetCertificationLevel`: verifica `isCertifier || isAdmin` sul player di default, aggiorna `Asset.certificationLevel`, sincronizza `Chunk.certificationLevel` per tutti i chunk dell'asset (`UPDATE`, non rigenerazione — il contenuto non cambia), se il nuovo livello è `certified` valorizza anche `certifiedBy`/`certifiedAt`/`certificationExpiresAt`
- [x] **4.6** `onDeleteAsset`: verifica `isAdmin` sul player di default — se false, `req.error(403, ...)`. Se true: DELETE chunk, DELETE revisions, DELETE asset (ordine per rispettare eventuali FK)
- [x] **4.7** `onSearchAssets`: SQL raw `WHERE "PUBLISHED" = TRUE AND ("TITLE" LIKE ? OR "DESCRIPTION" LIKE ?)` — **verificare il tipo fisico di `Boolean` in HANA** (non assumere, controllare il DDL del punto 2.8) prima di scrivere la condizione esatta
- [x] **4.8** `onDeepSearch`: embed della query (via `srv/lib/ai.js`), `COSINE_SIMILARITY` sui `Chunk` esistenti filtrando per asset pubblicati, raggruppa per asset (un asset può avere più chunk — prendere la similarity massima per asset), nessuna chiamata a Claude
- [x] **4.9** `onExpireCertifications`: `UPDATE Asset SET certificationLevel='certifiedOutdated' WHERE certificationLevel='certified' AND certificationExpiresAt < now`, sincronizza i chunk corrispondenti, ritorna il conteggio

---

## 5. Automazione scadenza (provvisoria)

- [x] **5.1** In `catalog-service.js`, `init()`: `setInterval` che richiama la logica di `onExpireCertifications` ogni N ore (es. 6) — **esplicitamente provvisorio**: un vero job scheduler BTP (Job Scheduling service) è infrastruttura di produzione fuori scope qui. Annotare nel codice.

---

## 6. UI di test (`app/index.html`)

- [x] **6.1** Aggiungere una sezione "Carica asset" che chiama `/rest/catalog/uploadAsset` (sostituisce quella precedente che chiamava `BillyService.uploadAsset`, ora rimossa)
- [x] **6.2** Aggiungere una sezione "Coda di revisione" che chiama `/rest/catalog/listReviewQueue` e mostra un pulsante "Approva" (chiama `/rest/catalog/reviewRevision` con `approve: true`, valori di default ragionevoli per `validityMonths`/`pointsPct`)
- [x] **6.3** Sezione "Chiedi a Billy" invariata (chiama ancora `/rest/billy/askBilly`)

---

## 7. Verifica pre-implementazione

- [x] **7.1** Rileggere l'intera checklist, verificare coerenza nomi (azioni, entità, path REST) tra sezioni 1-6
- [x] **7.2** Confermare che nessun `PointEvent` venga creato in questa fase (vedi nota in testa al documento) e che ogni punto in cui andrebbe creato abbia un `TODO(Fase 3)` esplicito
- [x] **7.3** Confermare che `attachments`/Object Store non compaiano da nessuna parte (Fase 5)

---

**Nota di verifica (7.1-7.3) aggiunta durante l'esecuzione:** rilettura critica del codice completata. Punto di incertezza residua, non risolvibile per ispezione statica: se `SELECT.one.from('billy.AssetRevision').where({ID:...})` restituisce la FK come proprietà `asset_ID` (pattern CAP documentato per association non espanse) — verificato empiricamente al test 9.3, non assunto.

## 8. Build e deploy di verifica

- [x] **8.1** `cds build --production` — verificare `AssetRevision` tra gli artefatti generati, nessuna tabella imprevista
- [x] **8.2** `mbt build`
- [x] **8.3** Ispezione `.mtar` (segreti, `app/index.html` aggiornato, presenza di `srv/lib/*.js` nel pacchetto `billy-srv`)
- [x] **8.4** `cf deploy`
- [x] **8.5** Verifica log `billy-db-deployer` (nuove tabelle deployate senza errori) e `billy-srv` (avvio pulito)

---

## 9. Test end-to-end reale

- [x] **9.1** `uploadAsset("Policy trasferte estere", ...)` → HTTP 200, `published: false`. `listReviewQueue` → asset presente con `kind: "revision"`. Confermato.
- [x] **9.2** `askBilly` sulla domanda pertinente → asset **non citato**, `answer` dichiara esplicitamente di non avere l'informazione, sources mostrano solo asset preesistenti irrilevanti (similarity 0.08-0.12). Confermato: il gate di revisione blocca correttamente la visibilità RAG.
- [x] **9.3** `reviewRevision(approve: true, validityMonths: 12, pointsPct: 100)` → Asset ritornato con `published: true`, `certificationLevel: "certified"`, `certifiedAt`/`certificationExpiresAt` corretti (scadenza a +12 mesi esatti). **Bug reale trovato e risolto**: 403 al primo tentativo (player anonimo pre-esistente senza i nuovi flag, vedi registro deviazioni).
- [x] **9.4** Ripetuta la domanda → asset citato correttamente, `certificationLevel: "certified"`, similarity 0.682 (peso pieno 1.0 applicato), risposta cita i dettagli esatti (10 giorni, briefing sicurezza).
- [x] **9.5** `setCertificationLevel(assetId, "deprecated")` → ripetuta la domanda → asset **completamente assente** dalle sources (non solo peso ridotto), Billy dichiara di non avere l'informazione. Verifica finalmente possibile, confermata.
- [x] **9.6** `searchAssets?query=smart` → trovato "Policy smart working". **Bug reale trovato e risolto**: al primo tentativo risultato vuoto per gli asset di Fase 0/1 (colonna `published` backfillata a `FALSE` dall'`ALTER TABLE`, non `TRUE` — vedi registro deviazioni). Dopo il fix di migrazione, funziona correttamente.
- [x] **9.7** `deepSearch` con "posso lavorare da casa senza andare in ufficio ogni giorno?" (nessuna parola in comune col titolo "Policy smart working") → trovato correttamente con similarity 0.572, nessun campo `answer` (nessuna chiamata a Claude, confermato). **Bug reale trovato e risolto**: 400 "Function must be called by GET" al primo tentativo con POST (vedi registro deviazioni) — le `function` CDS richiedono GET in REST.
- [x] **9.8** `deleteAsset` sull'asset deprecato → `true`, HTTP 200 (player anonimo ha `isAdmin: true`). Verificato: asset sparito da `searchAssets`.
- [x] **9.9** Log controllati dopo ogni passaggio: nessun errore imprevisto (solo i 403/400 attesi durante la scoperta dei bug sopra, tutti risolti).

**✅ TUTTI I TEST SUPERATI — 3 bug reali trovati e corretti durante l'esecuzione** (subquery correlata HANA, player pre-esistente senza nuovi flag, colonna `published` non backfillata correttamente al primo tentativo, chiamata function con verbo HTTP sbagliato). Nessuno di questi era prevedibile per sola ispezione statica del codice — tutti emersi e risolti grazie al test end-to-end reale.

---

## 10. Versionamento

- [x] **10.1** Commit su `dev`
- [x] **10.2** Push `origin/dev`
- [x] **10.3** Merge `dev` → `master`
- [x] **10.4** Push `master`
- [x] **10.5** Ritorno su `dev`

---

## 11. Chiusura fase

- [x] **11.1** Aggiornare questa checklist con gli esiti reali
- [x] **11.2** Aggiornare `roadmap.md` marcando la Fase 2 come completata
- [x] **11.3** Riepilogo all'utente, incluso l'elenco esplicito di cosa è stato **rimandato** (PointEvent reali → Fase 3, job scheduler reale → infra successiva)

---

## Registro delle deviazioni

- **Le `function` CDS in protocollo REST vanno chiamate con GET, mai POST.** Scoperto testando `deepSearch` con POST → `400 "Function must be called by GET"`. Coerente con la convenzione REST/OData (function = idempotente, si chiama con GET; action = ha effetti, si chiama con POST) — non documentato esplicitamente nella bozza della checklist, scoperto dall'errore reale. `searchAssets`/`listReviewQueue` (altre function) già funzionavano perché testate correttamente con GET fin dall'inizio; solo `deepSearch` era stato provato per errore con POST.
- **Asset di Fase 0/1 con `published = NULL`, non `TRUE`.** Errore reale in test 9.6: `searchAssets` non trovava "Policy smart working" (asset di Fase 1) ma trovava correttamente "Policy trasferte estere" (creato in Fase 2). Causa: la colonna `published` è stata aggiunta allo schema in Fase 2 — `ALTER TABLE ADD COLUMN ... DEFAULT FALSE` di HANA **backfilla** le righe esistenti col default (`FALSE`), non le lascia `NULL` come avevo inizialmente assunto. Primo tentativo di fix con `WHERE published IS NULL` → zero righe trovate (sbagliato: erano `FALSE`, non `NULL`), verificato empiricamente perché il retest è fallito allo stesso modo. **Fix corretto**: `UPDATE ... SET published = TRUE WHERE published = FALSE AND ID IN (SELECT DISTINCT asset_ID FROM Chunk)` — mirato esattamente agli asset "vecchio modello" che avevano già chunk (prova che erano live prima che `published` esistesse), eseguito idempotente ad ogni avvio in `CatalogService.init()`. Corretto anche un dettaglio minore: il driver HANA restituisce `BOOLEAN` come `1`/`0` via SQL raw, non `true`/`false` — aggiunto `Boolean(...)` esplicito nel mapping di `searchAssets`.
- **Player anonimo pre-esistente senza i nuovi flag `isCertifier`/`isAdmin`.** Errore reale in test 9.3: `403 "Solo Certifier o Admin possono revisionare"` al primo tentativo di approvazione. Causa: il player `anonymous` è stato creato in Fase 0/1, quando queste colonne non esistevano ancora nello schema — la Fase 2 le ha aggiunte con default `false`, e il ramo "player già esistente" di `getOrCreateDefaultPlayer()` ritornava semplicemente la riga trovata senza elevare i flag. **Fix**: se il player esistente non ha entrambi i flag a `true`, li aggiorna una tantum con `UPDATE`. Non era prevedibile per ispezione statica del codice nuovo — solo eseguendo il test contro i dati reali già presenti da fasi precedenti si manifesta.
- **`listReviewQueue` — subquery correlata con `ORDER BY`/`LIMIT` rifiutata da HANA.** Errore reale in test 9.1: `SqlError: correlated subquery cannot have TOP or ORDER BY` (code 309). La query per trovare "l'ultima revisione approvata per asset" usava una subquery scalare correlata con `ORDER BY ... LIMIT 1` nella SELECT list — HANA lo vieta esplicitamente per le subquery correlate (a differenza delle subquery non correlate, dove funziona). **Fix**: sostituita con una derived table basata su `ROW_NUMBER() OVER (PARTITION BY "ASSET_ID" ORDER BY "REVIEWEDAT" DESC)` + `LEFT JOIN ... WHERE rn = 1` — pattern standard, non correlato, HANA lo accetta senza problemi.
