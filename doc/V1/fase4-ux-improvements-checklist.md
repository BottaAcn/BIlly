# Checklist — Miglioramenti UX/UI frontend (post-refactor Web Components)

> Riferimento: analisi pagina-per-pagina proposta in sessione (08-09/09/2026), su richiesta esplicita dell'utente di rianalizzare l'interfaccia e implementare tutte le proposte. Stesso workflow delle fasi precedenti: creazione checklist → controllo checklist → implementazione → test → push `dev` → merge `master` → ritorno a `dev`.
>
> **Non è una nuova fase numerata**: è un miglioramento incrementale della Fase 4 (già refattorizzata a Web Components, commit `9ceca85`), nessun cambio architetturale.

---

## 0. Perimetro — cosa si fa ora, cosa si rimanda (e perché)

**In scope in questo giro** (17 interventi, tutti contenuti: nessun nuovo modulo MTA, un solo endpoint backend nuovo e in sola lettura):

| # | Pagina | Intervento |
|---|---|---|
| 1 | Globale | Sidebar responsive (drawer con hamburger sotto ~900px) |
| 2 | Chat | Punteggio di similarity leggibile (percentuale, non numero grezzo) |
| 3 | Chat | Pulsante "copia risposta" |
| 4 | Chat | Timestamp per messaggio |
| 5 | Chat | Pulsante "Nuova conversazione" |
| 6 | Chat | Persistenza thread in `sessionStorage` |
| 7 | Chat | Chip di domande suggerite nello stato vuoto |
| 8 | Catalogo | Filtri per certificazione/tipo + contatore risultati |
| 9 | Catalogo | Ordinamento (recenti/alfabetico) |
| 10 | Catalogo | Icona per tipo asset sulle card |
| 11 | Upload | Fix bug drag-and-drop (il testo lo promette, non è implementato) |
| 12 | Upload | Validazione client-side tipo/dimensione file |
| 13 | Upload | Azione diretta "Vai alla coda" nel messaggio di successo |
| 14 | Coda revisione | **Anteprima contenuto/allegato prima di approvare/rifiutare** (richiede 1 nuova function backend, sola lettura) |
| 15 | Coda revisione | Testo esplicativo per il campo "% punti" |
| 16 | Coda revisione | Separazione visiva Nuovi/Rinnovi |
| 17 | Trasversale | Modale di conferma distruttiva differenziato (più piccolo, colore di allerta) |
| 18 | Trasversale | Accessibilità da tastiera su `billy-asset-card`/`billy-source-chip` (role, tabindex, Enter/Spazio) |

**Rimandato a un giro dedicato** (troppo grande o troppo rischioso per essere incluso qui senza una checklist propria):

- **Palette comandi (Cmd/Ctrl+K)**: feature nuova e trasversale, merita una progettazione propria (quali azioni esporre, come indicizzarle) invece di essere infilata in questo giro.
- **Streaming della risposta di Billy (token-by-token)**: richiederebbe modificare `askBilly` per rispondere via SSE — un cambio di contratto dell'azione backend (non più sola lettura/additivo), con impatto sul client `OrchestrationClient` da verificare a parte. Troppo rischioso per essere bundlato con 17 altri interventi.
- **Paginazione/virtualizzazione catalogo**: non è ancora un problema reale con il volume di asset attuale (`listAssets` senza paginazione); si rivaluta quando il catalogo cresce.

---

## 1. Unico cambio backend (sola lettura, additivo)

- [x] **1.1** `srv/catalog-service.cds` — nuova function `getRevisionDetail(revisionId: UUID) returns { revisionId, assetId, title, description, content, type, externalLink, submittedBy, submittedAt, attachments: array of {ID, filename, mimeType} }`
- [x] **1.2** `srv/catalog-service.js` — handler `onGetRevisionDetail`: legge `AssetRevision` per ID (stesso pattern CQN di `onReviewRevision`), risolve `submittedBy` via `Player.displayName`, legge gli allegati direttamente da `Asset.attachments` (bypassa il filtro `published=true` della projection `Asset`, stesso approccio già usato in `onDownloadAttachment`/`onDeleteAsset`)
- [x] **1.3** Nessuna modifica a `reviewRevision`, `listReviewQueue`, `uploadAsset` — solo lettura aggiuntiva, nessun comportamento esistente cambia

---

## 2. Frontend — file condivisi

- [x] **2.1** `app/js/utils.js` — aggiungere:
  - `fmtSimilarity(value)` → percentuale leggibile ("26% rilevanza")
  - `fmtTime(iso)` → per i timestamp dei messaggi chat (es. "18:01") — rinominata da `fmtRelativeTime` in implementazione: un orario assoluto è più utile di un relativo per una chat che vive in una sola sessione
  - `TYPE_ICONS` → mappa tipo asset → glifo/emoji semplice (nessuna nuova libreria di icone, coerente con "niente dipendenze esterne")
- [x] **2.2** `app/js/api.js` — aggiungere `getRevisionDetail(revisionId)`
- [x] **2.3** `app/styles/main.css` — nuove regole (nessuna riscrittura di quelle esistenti):
  - media query sidebar (drawer + overlay sotto 900px)
  - `.similarity-pill` (sostituisce l'uso "nudo" di `.source-chip-sim` per il numero grezzo)
  - `.chat-msg-actions` (pulsante copia), `.chat-msg-time`
  - `.suggested-questions` (chip cliccabili nello stato vuoto chat)
  - `.filter-bar`, `.filter-chip` (catalogo)
  - `.type-icon`
  - stato `.file-drop.dragover`
  - `.queue-section-title` (separazione Nuovi/Rinnovi)
  - `.modal--danger` (variante compatta/allerta)
  - `:focus-visible` su elementi resi interattivi via JS (card, chip)

---

## 3. Frontend — pagina per pagina

### Globale / sidebar
- [x] **3.1** `index.html` — aggiungere bottone hamburger (visibile solo sotto breakpoint via CSS) + overlay per chiusura sidebar
- [x] **3.2** `app.js` — wiring apertura/chiusura drawer

### Chat
- [x] **3.3** `billy-source-chip.js` — usare `fmtSimilarity`, aggiungere `role="button"`, `tabindex="0"`, gestione tastiera (Enter/Spazio → stesso evento del click)
- [x] **3.4** `billy-chat-message.js` — aggiungere timestamp (`.setUserText`/`.setAnswer` impostano anche l'ora), pulsante "copia" solo su messaggi `role="billy"` con risposta completa (non su "sta pensando"/errore)
- [x] **3.5** `index.html` + `chat-view.js` — chip domande suggerite nello stato vuoto (click → precompila input, non invia in automatico)
- [x] **3.6** `index.html` + `chat-view.js` — pulsante "Nuova conversazione" (svuota thread + sessionStorage)
- [x] **3.7** `chat-view.js` — salva/ripristina il thread da `sessionStorage` (chiave dedicata, nessun impatto sul backend)

### Catalogo
- [x] **3.8** `billy-asset-card.js` — icona tipo (`TYPE_ICONS`), `fmtSimilarity` per il punteggio, `role="button"`, `tabindex="0"`, gestione tastiera
- [x] **3.9** `index.html` — barra filtri (chip certificazione + select tipo) e select ordinamento, contatore risultati
- [x] **3.10** `catalog-view.js` — stato filtri/ordinamento lato client (nessuna nuova chiamata API: si filtra/ordina la cache già caricata, coerente con `searchAssets`/`deepSearch` esistenti)

### Carica asset
- [x] **3.11** `upload-view.js` — handler reali `dragover`/`dragleave`/`drop` sulla dropzone (o, in alternativa se troppo fragile su HANA/CF, correggere il testo — **decisione presa in implementazione dopo prova**: si implementa il drag reale, è fattibile lato client puro)
- [x] **3.12** `upload-view.js` — validazione client-side estensione (`.pdf`, `.docx`, `.txt`) e dimensione massima file prima dell'invio, messaggio d'errore coerente con `.alert-error` esistente
- [x] **3.13** `upload-view.js` — messaggio di successo con azione "Vai alla coda di revisione" (cambia vista + refresh coda)

### Coda di revisione
- [x] **3.14** `billy-queue-row.js` — nuovo pulsante "Anteprima" (evento `preview`, detail `{revisionId}`), non sostituisce Approva/Rifiuta
- [x] **3.15** `queue-view.js` — handler `preview`: chiama `api.getRevisionDetail`, apre `billy-modal` con contenuto/descrizione/allegati (sola lettura, nessuna azione distruttiva in questo modale)
- [x] **3.16** `queue-view.js` — raggruppare la lista in due sezioni ("Nuovi contenuti" / "Rinnovi in scadenza") invece di un'unica lista mista
- [x] **3.17** `queue-view.js` — hint sotto il campo "% punti" nel modale di approvazione

### Trasversale
- [x] **3.18** `billy-modal.js` — supportare `variant: 'danger'` in `.open()`, applica classe `modal--danger` (larghezza ridotta, accento rosso sul bordo/titolo) — usato per elimina asset e rifiuta contenuto
- [x] **3.19** `catalog-view.js` / `queue-view.js` — passare `variant: 'danger'` alle chiamate `modal.open()` già esistenti per eliminazione/rifiuto (nessuna nuova azione, solo lo stile del modale già presente)

---

## 4. Verifica di coerenza (prima del test)

- [x] **4.1** Nessun componente in `components/` importa `api.js` direttamente (principio invariato dal refactor precedente) — `billy-queue-row` emette `preview`, non chiama l'API
- [x] **4.2** Tutti i nuovi eventi (`preview`) usano `bubbles: true`
- [x] **4.3** `getRevisionDetail` non modifica nessuna riga di dati (sola `SELECT`) — verificare leggendo l'handler prima di considerarlo chiuso
- [x] **4.4** La persistenza `sessionStorage` non rompe il primo avvio (nessun dato salvato → stato vuoto normale)
- [x] **4.5** Le nuove icone/percentuali non rompono il rendering quando i dati mancano (`_similarity` assente, `type` sconosciuto)

---

## 5. Test (su Cloud Foundry, browser reale)

- [x] **5.1** `mbt build` pulito, deploy, nessun errore — build isolata: i file non committati della Fase 6 (approuter/HTML5 App Repo, in sospeso da un'altra sessione) sono stati temporaneamente accantonati con `git stash` prima della build, per evitare di impacchettarli/deployarli senza la conferma esplicita che quella checklist richiede; ripristinati subito dopo (§6)
- [x] **5.2** Sidebar responsive: ridimensionare viewport, verificare drawer/hamburger — testato a 420px, hamburger visibile, drawer si apre/chiude con overlay
- [x] **5.3** Chat: timestamp, copia risposta, nuova conversazione, persistenza dopo refresh, chip suggerite, similarity leggibile — tutto verificato con una domanda reale; il pulsante copia è stato verificato a livello di logica (clipboard bloccata dal sandbox del browser di test, non dal codice: vedi registro deviazioni)
- [x] **5.4** Catalogo: filtri, ordinamento, contatore, icone tipo, similarity leggibile in ricerca approfondita — filtro "Certificato" passa da 4 a 2 risultati, ordinamento alfabetico verificato
- [x] **5.5** Upload: drag&drop reale, validazione client-side, azione post-successo verso la coda — file valido trascinato e accettato, file `.exe` correttamente rifiutato, pulsante "Vai alla coda" naviga correttamente
- [x] **5.6** Coda: anteprima contenuto su un item Nuovo, sezioni separate, hint "% punti" — verificato con un upload reale end-to-end (upload → anteprima → approvazione). **Non verificato** l'item di tipo Rinnovo: nessun asset con certificazione scaduta presente nei dati attuali per testarlo (vedi registro deviazioni)
- [x] **5.7** Modale distruttivo (elimina asset, rifiuta contenuto) visivamente distinto — classe `modal--danger` confermata applicata sul modale "Eliminare questo asset?"
- [x] **5.8** Navigazione da tastiera: Tab fino a una card/chip, Invio la apre — verificato su `billy-asset-card` (focus + keydown Enter apre il dettaglio)
- [x] **5.9** Console browser priva di errori in tutti i flussi sopra — nessun errore in tutta la sessione di test

---

## 6. Push / merge

- [x] **6.1** Commit su `dev` (solo i file di questo intervento — non toccare `mta.yaml`/`router/`/Fase 6 in sospeso)
- [x] **6.2** Push `dev`
- [x] **6.3** Checkout `master`, merge `dev`, push `master`
- [x] **6.4** Checkout `dev`

---

## Registro delle deviazioni

- **Test del pulsante "Copia"**: `navigator.clipboard.writeText` fallisce con "Write permission denied" nell'ambiente di browser automatizzato usato per il test (permesso clipboard-write negato al contesto sandbox), non per un difetto del codice. Il gestore cattura l'errore silenziosamente come da design (nessuna azione visibile in caso di clipboard non disponibile). In un browser reale con un click utente genuino su un'origine HTTPS il permesso viene normalmente concesso.
- **Item di tipo "Rinnovo" nella coda**: non c'erano asset con `certificationLevel: certifiedOutdated` nei dati reali al momento del test, quindi l'anteprima e il raggruppamento sono stati verificati solo sul percorso "Nuovi contenuti". La stessa function `getRevisionDetail` viene usata per entrambi i casi (un rinnovo riusa l'ultima revisione approvata, già gestito da `listReviewQueue`), quindi il rischio residuo è basso ma non è stato osservato direttamente.
- **`fmtRelativeTime` → `fmtTime`**: rinominata in fase di implementazione. Un orario assoluto ("18:01") è stato preferito a un tempo relativo ("2 minuti fa") perché la chat vive in un'unica sessione breve (nessuna persistenza multi-giorno prevista) e un orario fisso non richiede un timer di re-render per restare accurato.
- **Isolamento dal lavoro Fase 6 in sospeso**: `mta.yaml`, `router/`, `app/manifest.json`, `app/xs-app.json`, `html5-content/`, `scripts/zip-html5-content.js`, `package.json`/`package-lock.json` (dipendenza `jszip`) appartengono a un lavoro non committato di un'altra sessione (approuter/HTML5 App Repo, checklist propria in `fase6-checklist.md`, che richiede esplicitamente conferma utente prima di ogni deploy reale). Questi file sono stati messi da parte con `git stash` prima di build/deploy di questo intervento e ripristinati subito dopo, per evitare di includerli in un deploy non autorizzato — verificato anche con `cf apps`/`cf services` che nessuna risorsa Fase 6 sia stata effettivamente creata.
