# Checklist — Fase 0: Modello dati esteso + migrazione

> Riferimento: [architecture.md](architecture.md) §2-3, [roadmap.md](roadmap.md) Fase 0. Workflow di esecuzione: checklist → verifica → implementazione → test via deploy CF (locale non disponibile, vedi v0.0.1 registro deviazioni) → push `dev` → merge `master` → ritorno a `dev`.
>
> **Scope esplicito di questa fase (da roadmap.md):** sostituire `Document` con `Asset`+`Chunk`+`Player`+`Season`+`PointEvent`, riadattare la logica esistente **senza aggiungere funzionalità nuove** — 1 asset = 1 chunk per ora (niente chunking reale, niente pesatura per certificazione, niente link cliccabili: quello è Fase 1).

---

## 0. Prerequisiti

- [ ] **0.1** Branch `dev` corrente, sincronizzato con origin
- [ ] **0.2** `billy-app/` — app precedentemente deployata (`billy-srv`) ancora attiva su CF, verificarne lo stato prima di modificare: `cf app billy-srv`

---

## 1. Schema dati (`db/schema.cds`)

- [x] **1.1** Sostituito interamente `db/schema.cds` con il modello completo: `CertificationLevel`, `AssetType`, `Asset`, `Chunk`, `Player`, `Season`, `PointReason`, `PointEvent`. Nessuna entità `Document` residua.
- [x] **1.2** Compilato senza errori: `npx cds compile db/schema.cds` → exit 0
- [x] **1.3** Nomi fisici verificati con `npx cds compile db/schema.cds --to sql --dialect hana` (case-folding uppercase a runtime, confermato in v0.0.1):
  - Tabella `Asset` → **`BILLY_ASSET`** ✅ (come atteso)
  - Tabella `Chunk` → **`BILLY_CHUNK`** ✅ (come atteso)
  - Colonna FK `Chunk.asset` → **`ASSET_ID`** ✅ (come atteso)
  - Tabella `Player` → **`BILLY_PLAYER`** ✅ (come atteso)
  - **Scoperta non prevista**: la colonna `Chunk.text` viene generata come `"TEXT"` (quotata) nel DDL — `TEXT` è parola riservata in SQL HANA. Va referenziata quotata (`"TEXT"`) in ogni query SQL raw, non solo per convenzione ma perché altrimenti fallirebbe.
- [x] **1.4** `Season` e `PointEvent` compilano correttamente (`billy_PointEvent`, `billy_Season` nel DDL), pur non ancora usate da alcun service in questa fase

---

## 2. Servizio (`srv/billy-service.cds`)

- [x] **2.1** `entity Asset as projection on db.Asset;` — nessuna esclusione necessaria (niente campo `embedding` su Asset, quello è solo su Chunk). Projection `Document` rimossa.
- [x] **2.2** Azione rinominata: `uploadAsset(title, content) returns Asset`
- [x] **2.3** `askBilly(question)` — firma invariata
- [x] **2.4** Verificato: riga `@(requires: ...)` ancora commentata

---

## 3. Implementazione servizio (`srv/billy-service.js`)

- [x] **3.1** Helper `getOrCreateDefaultPlayer()` implementato con `SELECT.one.from('billy.Player').where({userId: 'anonymous'})` + INSERT se assente. Commento `TODO(D15)` esplicito nel codice.
- [x] **3.2** `onUploadAsset` implementato esattamente come pianificato: player di default → INSERT Asset → embedding → INSERT unico Chunk (chunkIndex 0) → ritorna Asset.
- [x] **3.3** `onAskBilly` implementato: embedding domanda → `SELECT TOP 3 ... FROM "BILLY_CHUNK" c JOIN "BILLY_ASSET" a ON a."ID"=c."ASSET_ID"` con `COSINE_SIMILARITY` → nessuna pesatura/esclusione (Fase 1) → Claude → risposta con sources.
- [x] **3.4** Nessun riferimento residuo a `billy.Document`/`BILLY_DOCUMENT` (verificato a vista, il file è stato riscritto da zero).

---

## 4. UI di test (`app/index.html`)

- [ ] **4.1** Aggiornare la chiamata fetch da `/rest/billy/addDocument` a `/rest/billy/uploadAsset` (nome azione cambiato al task 2.2)
- [ ] **4.2** Nessun altro cambiamento necessario (l'interfaccia utente resta la stessa: titolo + testo, poi domanda)

---

## 5. Verifica pre-implementazione

- [x] **5.1** Riletta la checklist end-to-end, coerenza verificata tra nomi entità/azioni/tabelle nelle sezioni 1-4
- [x] **5.2** Confermato: nessuna gamification, chunking multiplo, pesatura certificazione o link cliccabili introdotti in questa fase — solo migrazione schema+servizio

---

## 6. Build e deploy di verifica

- [x] **6.1** `cds build --production` → generati 5 nuovi `.hdbtable` (Asset, Chunk, Player, Season, PointEvent) + 2 `.hdbview` di servizio (BillyService.Asset, BillyService.Chunk — auto-esposte per la composition `Asset.chunks`, comportamento CAP normale non richiesto esplicitamente). Nessun `billy.Document.hdbtable` tra i **generati** (l'entità non esiste più nel modello).
- [x] **6.2** `mbt build` → `.mtar` generato
- [x] **6.3** Ispezionato: nessun segreto, `app/index.html` presente e aggiornato
- [x] **6.4** `cf deploy` eseguito (deploy iterativo di verifica, autorizzazione già data)
- [x] **6.5** **Scoperta importante non prevista dalla bozza originale della checklist**: al primo deploy, il log mostra `Undeploying "src/gen/BillyService.Document.hdbview"... ok` ma **non** un corrispondente undeploy di `billy.Document.hdbtable` — solo "1 files undeployed" (la view, non la tabella). Causa: `undeploy.json` di default generato da CDS include solo pattern **sicuri** per il drop automatico (`*.hdbview`, `*.hdbindex`, `*.hdbconstraint`, `*_drafts.hdbtable`, `*.hdbcalculationview`) — **non** `*.hdbtable` in generale, per evitare perdite dati accidentali quando un'entità viene rimossa dal modello. La tabella `billy.Document` restava quindi orfana su HANA con i dati di test della v0.0.1 ancora dentro. **Fix**: creato `billy-app/db/undeploy.json` con `["src/gen/billy.Document.hdbtable"]` — CDS lo unisce (non sostituisce) ai pattern di default. Ribuild + redeploy → confermato nei log: `Undeploying "src/gen/billy.Document.hdbtable"... ok`, `Exit status 0`. Tabella orfana eliminata correttamente.
- [x] **6.6** Log `billy-srv` da verificare al task 7.4 insieme al test end-to-end

---

## 7. Test end-to-end reale

- [x] **7.1** `POST /rest/billy/uploadAsset` con "Policy smart working" → **HTTP 200**, ritornato `{ID, title, type: "document", certificationLevel: "community"}` come atteso
- [x] **7.2** `POST /rest/billy/askBilly` con "Posso lavorare da remoto? Quanti giorni?" → **HTTP 200**, risposta corretta e specifica (3 giorni, approvazione manager, reperibilità 9-18), `sources: [{title: "Policy smart working", similarity: 0.643}]`
- [x] **7.3** Dedotto dal comportamento: `uploadAsset` non ha sollevato errori di constraint su `uploadedBy` (colonna `NOT NULL`) → il `Player` di default è stato creato/riusato correttamente, altrimenti l'INSERT su `Asset` sarebbe fallito con violazione di vincolo
- [x] **7.4** Log controllati (`cf logs billy-srv --recent`): nessun errore reale, solo righe di routing standard con HTTP 200 su entrambe le chiamate

**✅ FASE 0 VERIFICATA END-TO-END — schema Asset/Chunk/Player/Season/PointEvent operativo su HANA Cloud reale, servizio migrato senza perdita di funzionalità.**

---

## 8. Versionamento

- [ ] **8.1** Commit su `dev` con messaggio descrittivo (schema esteso + migrazione servizio)
- [ ] **8.2** Push su `origin/dev`
- [ ] **8.3** Merge `dev` → `master` (fast-forward o merge commit, senza `--force`)
- [ ] **8.4** Push `master`
- [ ] **8.5** Ritorno su branch `dev` per la Fase 1

---

## 9. Chiusura fase

- [ ] **9.1** Aggiornare questa checklist con tutti gli esiti reali
- [ ] **9.2** Aggiornare `doc/V1/roadmap.md` marcando la Fase 0 come completata, con eventuali note/deviazioni emerse
- [ ] **9.3** Riepilogo all'utente

---

## Registro delle deviazioni

*(da compilare durante l'esecuzione)*
