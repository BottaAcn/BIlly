# Checklist — Fase 1: RAG vero (chunking, retrieval pesato, citazioni cliccabili)

> Riferimento: [architecture.md](architecture.md) §4, [roadmap.md](roadmap.md) Fase 1. Stesso workflow della Fase 0: checklist → verifica → implementazione → test via deploy CF → push `dev` → merge `master` → ritorno a `dev`.
>
> **Scope esplicito di questa fase:** (1) chunking reale di testi lunghi, (2) retrieval che esclude `deprecated` e pesa `certified`/`certifiedOutdated`/`community`, (3) citazioni con link verso l'Asset. **Fuori scope**: gamification, CRUD catalogo completo, frontend reale (quello è Fase 4 — il link puntera' a un path placeholder che il frontend implementerà).

---

## 0. Prerequisiti

- [ ] **0.1** Branch `dev` corrente, sincronizzato con origin, contiene la Fase 0 già mergiata
- [ ] **0.2** `billy-srv` attivo su CF, verificato `cf app billy-srv`

---

## 1. Chunking reale

- [x] **1.1** Implementata `chunkText()`: split a caratteri con `CHUNK_SIZE=700`, `CHUNK_OVERLAP=100`, nessuna dipendenza esterna
- [x] **1.2** `onUploadAsset` ora crea N chunk (loop su `chunkText(content)`), embedding calcolato per ogni singolo segmento, `chunkIndex` progressivo
- [x] **1.3** Verificato a codice: se `content.length <= CHUNK_SIZE`, il while produce esattamente 1 iterazione (start=0, end=length, break immediato) — nessuna regressione rispetto alla Fase 0

---

## 2. Retrieval pesato per certificazione

- [x] **2.1** Query aggiornata con `WHERE c."CERTIFICATIONLEVEL" != 'deprecated'` e pesatura via `CASE` (costante `CERTIFICATION_WEIGHT_SQL`, riusabile)
- [x] **2.2** Join con `Asset` mantenuto (serve `TITLE` e `ID` per il link)
- [x] **2.3** `certificationLevel` incluso nel risultato e nel contesto passato al modello (prefisso `[stato]` su ogni riga)
- [x] **2.4** Prompt di sistema esteso: istruisce il modello ad avvisare esplicitamente se una fonte non "certified" viene usata

---

## 3. Citazioni con link cliccabile

- [x] **3.1** Tipo di ritorno `askBilly` esteso con `assetId`, `certificationLevel`, `link`
- [x] **3.2** `link` costruito come `/catalog/asset/${assetId}`, commento esplicito nel codice sul fatto che non è ancora una route reale
- [x] **3.3** `app/index.html` aggiornato: le sources sono renderizzate come `<li><a href="...">` cliccabili con stato di certificazione e similarity visibili

---

## 4. Verifica pre-implementazione

- [x] **4.1** Verificato dal DDL già generato in Fase 0: `certificationLevel` **non** è parola riservata (a differenza di `text`) — nessun problema di quoting oltre alla convenzione già in uso di quotare tutti gli identificatori in SQL raw
- [x] **4.2** Confermato: il `CASE` SQL avrà un `ELSE 0.6` esplicito (stesso peso di `community`) per non rompersi silenziosamente su un valore imprevisto

---

## 5. Build e deploy di verifica

- [x] **5.1** `cds build --production` eseguito
- [x] **5.2** `mbt build` → `.mtar` generato
- [x] **5.3** Ispezionato: nessun segreto, `app/index.html` aggiornato presente
- [x] **5.4** `cf deploy` → successo, exit 0
- [x] **5.5** `billy-db-deployer`: "0 files to deploy, 0 files to undeploy" (atteso, nessuna modifica allo schema in questa fase). `billy-srv` avviato senza errori.

---

## 6. Test end-to-end reale

- [x] **6.1** Caricato un testo di 987 caratteri ("Procedura onboarding nuovi assunti") → con `CHUNK_SIZE=700`/`overlap=100` calcolato per costruzione esattamente 2 chunk (0-700, 600-987). Upload riuscito senza errori nel loop embedding multiplo.
- [x] **6.2** **Confermato empiricamente, non solo per costruzione**: una domanda sul "terzo mese" (contenuto nella seconda metà del testo) ha prodotto **due righe distinte in `sources` con lo stesso `assetId` ma similarity diverse** (0.354 e 0.347) — prova diretta che sono stati recuperati due chunk separati dello stesso asset, non un chunk unico. Risposta corretta e specifica ("terzo mese... colloquio strutturato... contratto standard").
- [x] **6.3** `sources` include correttamente `assetId`, `certificationLevel: "community"`, `link: "/catalog/asset/<uuid>"` — formato valido
- [x] **6.4** **Rimandato a Fase 2**, come previsto: nessuna azione `deprecateAsset` esiste ancora per impostare questo stato via API. Il filtro SQL `WHERE ... != 'deprecated'` è comunque presente e verificato a codice; il test comportamentale reale si farà quando `CatalogService.deprecateAsset` esisterà.
- [x] **6.5** Log puliti, nessun errore nascosto

**Bonus non pianificato, osservato nel test:** il modello ha rispettato spontaneamente l'istruzione del prompt esteso, avvisando l'utente che la fonte è "community" e non ancora certificata, con tanto di consiglio di verificare con HR/manager — comportamento esattamente allineato a D10.

---

## 7. Versionamento

- [ ] **7.1** Commit su `dev`
- [ ] **7.2** Push `origin/dev`
- [ ] **7.3** Merge `dev` → `master`
- [ ] **7.4** Push `master`
- [ ] **7.5** Ritorno su `dev`

---

## 8. Chiusura fase

- [ ] **8.1** Aggiornare questa checklist con gli esiti reali
- [ ] **8.2** Aggiornare `roadmap.md` marcando la Fase 1 come completata
- [ ] **8.3** Riepilogo all'utente

---

## Registro delle deviazioni

*(da compilare durante l'esecuzione)*
