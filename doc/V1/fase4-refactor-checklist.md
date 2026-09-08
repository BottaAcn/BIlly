# Checklist — Refactor Fase 4: da vanilla JS a Web Components

> Riferimento: [architecture.md](architecture.md) §5, [frontend-design-research.md](frontend-design-research.md). Stesso workflow delle fasi precedenti: analisi approfondita → checklist → verifica coerenza → implementazione → test → push `dev` → merge `master` → ritorno a `dev`.
>
> **Non è una nuova fase numerata**: è un refactor della Fase 4 già completata (commit `3ed2e59`), che sostituisce l'implementazione (vanilla JS, un unico `app.js`) con una architettura modulare a componenti riutilizzabili, senza cambiare nessuna funzionalità già verificata. Decisione presa in sessione (08-09/09/2026): niente framework (React scartato), **Web Components nativi** (Custom Elements, standard del browser dal 2018, nessuna libreria esterna da mantenere).

---

## 0. Decisione architetturale (perché Web Components e non React/altro)

- **Scartato React + shadcn/ui**: introdurrebbe una dipendenza esterna a vita (React stesso, la build tool, l'ecosistema npm) — in questo progetto abbiamo già avuto un problema di tooling reale (bug `cds watch` ESM/Windows) che ha reso concreta la preoccupazione "meno dipendenze da mantenere possibile". Il vanilla JS attuale è già in produzione, funziona, copre tutte le funzioni.
- **Scelto Web Components (Custom Elements API)**: standard nativo del browser (non una libreria), zero dipendenze npm aggiuntive, nessun build step, componenti realmente riutilizzabili e incapsulati (a differenza delle funzioni-stringa attuali tipo `badgeHtml()`), si integra senza attrito con l'app già deployata (stesso meccanismo di serve statico via `app/`).
- **Nessuna Shadow DOM**: i componenti renderizzano nel *light DOM* (non isolato). Scelta deliberata: le CSS custom properties (design tokens) attraverserebbero comunque la Shadow DOM, ma isolare gli stili costringerebbe a duplicare/iniettare `styles.css` in ogni componente — complessità non giustificata per un team piccolo che vuole un solo foglio di stile condiviso. Trade-off accettato: nessun incapsulamento stile stretto, in cambio di semplicità.
- **Moduli ES nativi** (`<script type="module">`, `import`/`export` tra file): anche questo è JavaScript standard, non un bundler — permette comunque una struttura a più file senza build step.
- **Comunicazione tra componenti**: proprietà/attributi in ingresso, **CustomEvent** in uscita (stesso principio di "props down, events up" di qualsiasi framework moderno) — un componente non chiama mai `fetch()` direttamente, non conosce l'API: emette un evento con l'intento ("l'utente ha cliccato approva"), la vista/controller decide cosa fare. Questo è ciò che rende i componenti davvero riutilizzabili altrove.

---

## 1. Struttura cartelle (nuova)

```
billy-app/app/
├── index.html
├── styles/
│   └── main.css                    (rinominato da styles.css, contenuto invariato)
└── js/
    ├── app.js                      (bootstrap: importa viste, wiring nav, mount iniziale)
    ├── api.js                      (unico punto di chiamata fetch, rispecchia API-CONTRACT.md)
    ├── utils.js                    (escapeHtml, fmtDate, CERT_LABELS, TYPE_LABELS)
    ├── components/
    │   ├── billy-badge.js          (atomo: pallino colorato + etichetta stato certificazione)
    │   ├── billy-modal.js          (generico: dialog con titolo/corpo/footer, api .open()/.close())
    │   ├── billy-toast-container.js(gestisce coda toast, api .show(msg, type))
    │   ├── billy-source-chip.js    (citazione in chat: usa billy-badge, evento "open-asset")
    │   ├── billy-chat-message.js   (bolla chat utente/Billy, markdown, compone billy-source-chip)
    │   ├── billy-asset-card.js     (card catalogo, evento "open")
    │   └── billy-queue-row.js      (riga coda revisione, eventi "approve"/"reject")
    └── views/
        ├── chat-view.js            (logica vista chat: invio, thread, thinking state)
        ├── catalog-view.js         (logica vista catalogo: ricerca, griglia, apertura dettaglio)
        ├── upload-view.js          (logica form upload)
        └── queue-view.js           (logica coda: caricamento, approva/rifiuta)
```

**Convenzione di naming**: ogni custom element ha prefisso `billy-` (obbligatorio per gli standard Custom Elements: un tag custom deve contenere almeno un trattino) — coerente con D14 (prefisso `billy-` su ogni risorsa del progetto, qui esteso ai componenti).

---

## 2. Contratto di ciascun componente (proprietà in ingresso, eventi in uscita)

| Componente | Proprietà/attributi | Eventi emessi | Nota |
|---|---|---|---|
| `billy-badge` | `level` (attributo) | — | Puramente presentazionale |
| `billy-modal` | — (pilotato via metodi) | `close` (interno, per overlay click) | Metodi: `.open({title, bodyHtml, footerButtons})`, `.close()` |
| `billy-toast-container` | — | — | Metodo: `.show(message, type)` |
| `billy-source-chip` | `asset-id`, `title`, `similarity`, `certification-level`, `link` (attributi) | `open-asset` (detail: `{assetId}`, `bubbles:true`) | Compone `billy-badge` internamente |
| `billy-chat-message` | proprietà JS `role`, `content` (markdown o testo), `sources` (array) | `open-asset` (ri-emesso/bubbling da `billy-source-chip`) | Rendering markdown solo se `role==='billy'` |
| `billy-asset-card` | proprietà JS `asset` (oggetto) | `open` (detail: `{assetId}`) | |
| `billy-queue-row` | proprietà JS `item` (oggetto) | `approve` (detail: `{revisionId}`), `reject` (detail: `{revisionId}`) | Nasconde "Rifiuta" se `item.kind==='renewal'` (stessa regola del backend) |

**Principio generale da rispettare in implementazione**: nessun componente in `components/` importa `api.js`. Solo i moduli in `views/` chiamano l'API e ascoltano gli eventi dei componenti.

**Chiarimento sul routing di `open-asset` (due ascoltatori diversi, livelli diversi)**:
- Dentro `catalog-view.js`: un listener locale sul contenitore griglia intercetta l'evento `open` di `billy-asset-card` (nome diverso, stesso concetto, stessa vista — non serve cambiare vista, solo aprire il modale dettaglio)
- In `app.js` (bootstrap, livello globale): un listener su `document` intercetta `open-asset` da **qualunque** `billy-source-chip` (che vive dentro la chat, quindi in una vista diversa) — cambia vista a "catalog" e poi chiama l'apertura del dettaglio. Questo disaccoppia `chat-view.js` da `catalog-view.js`: nessuno dei due importa l'altro, la connessione la fa solo il bootstrap.

---

## 3. Corrispondenza funzionale con l'attuale (nessuna funzione persa o aggiunta)

- [x] Chat: invio domanda, stato "sta pensando", risposta markdown, fonti come chip cliccabili, click su fonte apre dettaglio asset
- [x] Catalogo: griglia asset, ricerca full-text, toggle ricerca approfondita, click card apre dettaglio
- [x] Dettaglio asset (modale): metadati, allegati con link download, azioni Elimina/Cambia stato
- [x] Upload: tab testo/file, submit, messaggio di conferma, aggiornamento contatore coda
- [x] Coda di revisione: righe con tag Nuovo/Rinnovo, approva (con validityMonths/pointsPct), rifiuta, badge contatore in sidebar
- [x] Navigazione tra le 4 viste, stato attivo nel sidebar
- [x] Toast di conferma/errore
- [x] Effetto visivo "orb" sulla chat vuota (invariato, resta CSS puro, non è un componente)

---

## 4. Passi di implementazione (in ordine)

- [x] **4.1** Creare `js/utils.js` — spostare `CERT_LABELS`, `TYPE_LABELS`, `escapeHtml`, `fmtDate` dall'attuale `app.js`
- [x] **4.2** Creare `js/api.js` — spostare/isolare tutte le chiamate `fetch` esistenti in funzioni nominate (`askBilly`, `listAssets`, `searchAssets`, `deepSearch`, `getAsset`, `getAttachments`, `uploadAsset`, `editAsset`, `listReviewQueue`, `reviewRevision`, `setCertificationLevel`, `deleteAsset`), stessa logica di gestione errori già presente
- [x] **4.3** Creare `js/components/billy-badge.js` — Custom Element con `observedAttributes: ['level']`, `attributeChangedCallback` per aggiornare il rendering
- [x] **4.4** Creare `js/components/billy-modal.js` — porta la logica di `openModal`/`closeModal` dentro il componente, espone `.open()`/`.close()` come metodi dell'istanza
- [x] **4.5** Creare `js/components/billy-toast-container.js` — porta la logica di `toast()` dentro il componente
- [x] **4.6** Creare `js/components/billy-source-chip.js` — usa `<billy-badge>` internamente, emette `open-asset`
- [x] **4.7** Creare `js/components/billy-chat-message.js` — rendering markdown (usa `marked` globale, invariato), compone `billy-source-chip` per le fonti
- [x] **4.8** Creare `js/components/billy-asset-card.js` — emette `open`
- [x] **4.9** Creare `js/components/billy-queue-row.js` — emette `approve`/`reject`, nasconde "Rifiuta" per i rinnovi
- [x] **4.10** Creare `js/views/chat-view.js` — usa `billy-chat-message`, chiama `api.askBilly`
- [x] **4.11** Creare `js/views/catalog-view.js` — usa `billy-asset-card`, `billy-modal` per il dettaglio, chiama `api.listAssets`/`searchAssets`/`deepSearch`/`getAsset`/`getAttachments`/`deleteAsset`/`setCertificationLevel`
- [x] **4.12** Creare `js/views/upload-view.js` — porta la logica del form, chiama `api.uploadAsset`
- [x] **4.13** Creare `js/views/queue-view.js` — usa `billy-queue-row`, `billy-modal` per il dialog di approvazione, chiama `api.listReviewQueue`/`reviewRevision`
- [x] **4.14** Riscrivere `js/app.js` — solo bootstrap: import dei componenti (side-effect, per la registrazione `customElements.define`), import e init delle viste, wiring nav/routing (invariato da oggi: hash-link intercettati, cambio vista attiva)
- [x] **4.15** Aggiornare `index.html` — `<script type="module" src="js/app.js">`, rimuovere il vecchio `<script src="app.js">`, aggiornare riferimento CSS a `styles/main.css`
- [x] **4.16** Eliminare i vecchi `app/app.js` e `app/styles.css` — fatto dopo verifica completa in browser reale su CF

---

## 5. Verifica di coerenza (da fare PRIMA del deploy, come da schema)

- [x] **5.1** Rileggere ogni componente e verificare che nessuno importi `api.js` direttamente (principio §2)
- [x] **5.2** Verificare che ogni evento emesso da un componente sia con `bubbles: true` (altrimenti la vista che ascolta su un contenitore padre non lo riceve)
- [x] **5.3** Verificare che `index.html` referenzi i nuovi path (`styles/main.css`, `js/app.js`) e non i vecchi
- [x] **5.4** Verificare che `mta.yaml`/`scripts/copy-app.js` continuino a funzionare (copiano l'intera cartella `app/`, quindi la nuova struttura a sottocartelle deve essere inclusa automaticamente — **verificare comunque dopo il build**, non assumere)
- [x] **5.5** Confrontare la lista task §3 con la UI finale, una per una

---

## 6. Test (su Cloud Foundry, non in locale — `cds watch` non utilizzabile su questa macchina)

- [x] **6.1** `mbt build` pulito, verificare che `gen/srv/app/` contenga la nuova struttura a sottocartelle
- [x] **6.2** Deploy (`cf deploy`), stessa procedura già collaudata
- [x] **6.3** Verifica browser reale (non solo curl) di tutte le funzioni elencate in §3, una per una — chat con markdown+citazioni, click citazione→cambio vista+apertura dettaglio, ricerca semplice, ricerca approfondita (similarity score), upload testo, coda di revisione (approvazione con validity/pct), eliminazione asset: tutto verificato con dati reali su CF
- [x] **6.4** Verificare la console del browser per errori JS silenziosi (import falliti, componenti non registrati, ecc.) — nessun errore in console durante l'intera sessione di test

---

## 7. Push / merge (schema standard del progetto)

- [ ] **7.1** Commit su `dev` con messaggio descrittivo
- [ ] **7.2** Push `dev` a `origin`
- [ ] **7.3** Checkout `master`, merge `dev`, push `master`
- [ ] **7.4** Checkout `dev` (ritorno, come da schema)

---

## Registro delle deviazioni

*(da compilare durante l'esecuzione se qualcosa cambia rispetto a quanto scritto qui)*
