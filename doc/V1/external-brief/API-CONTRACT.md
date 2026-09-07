# Contratto API — Billy backend (per sviluppo frontend esterno)

> Questo è il contratto **esatto e verificato** (non dedotto dal codice, ma confermato con chiamate reali contro il backend deployato) a cui il frontend deve integrarsi. **Il backend è fisso**: chi implementa il frontend non deve modificare né proporre modifiche a questi endpoint — solo consumarli.

**Base URL (ambiente di sviluppo/test attuale):**
```
https://accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com
```

**Autenticazione:** nessuna, per ora. Ogni endpoint è pubblico (`auth: kind: dummy` lato server — è una scelta deliberata e temporanea, non un bug). Non implementare login/token: **verrà aggiunto per ultimo** lato backend, il frontend andrà adattato in quel momento, non prima.

**Protocollo:** REST semplice (non OData, non GraphQL). Le **action** CDS sono `POST` con body JSON. Le **function** CDS sono `GET` con query string. Le entità esposte supportano `GET` in stile REST (lista e dettaglio per ID), non sintassi OData (`$filter`, `$expand` **non** supportati).

**Content-Type:** `application/json` per tutte le richieste POST, tranne dove specificato diversamente (upload file: vedi `uploadAsset`).

---

## 1. `BillyService` — chat RAG

### `POST /rest/billy/askBilly`

Domanda in linguaggio naturale → risposta con citazioni.

**Request:**
```json
{ "question": "Come funziona lo smart working?" }
```

**Response (200):**
```json
{
  "answer": "In base alle informazioni disponibili, lo smart working funziona nel seguente modo:\n\n- È **consentito fino a 3 giorni a settimana**\n...\n\n> ⚠️ **Attenzione:** questa informazione proviene da una fonte **non certificata**...",
  "sources": [
    {
      "assetId": "7098713a-1699-4756-8a2f-300574e3909d",
      "title": "Policy smart working",
      "similarity": 0.23000006463091735,
      "certificationLevel": "community",
      "link": "/catalog/asset/7098713a-1699-4756-8a2f-300574e3909d"
    }
  ]
}
```

**Note per il frontend:**
- `answer` è **Markdown**, non testo semplice — va renderizzato come tale (grassetto, blockquote di avviso, liste). Non è HTML.
- Il modello **stesso** avvisa nel testo quando cita una fonte non certificata (vedi l'esempio sopra: il blockquote `⚠️` è generato dal modello, non è un elemento che il frontend deve costruire — ma può essere estratto/stilizzato se il frontend vuole evidenziarlo diversamente).
- `certificationLevel` per ogni source è uno tra: `"community"`, `"certified"`, `"certifiedOutdated"`, `"deprecated"` (quest'ultimo in pratica non compare mai tra le source, è escluso a monte lato server).
- `link` è un path relativo (`/catalog/asset/<id>`) — **il frontend decide il routing reale**, questo è solo il contratto di cosa aspettarsi come riferimento all'asset.
- `sources` può essere un array vuoto se non ci sono asset pertinenti pubblicati.
- **Non c'è ancora lo streaming esposto lato REST** in questo endpoint (arriva tutto insieme a fine elaborazione) — prevedere comunque uno stato di caricamento, la risposta può richiedere diversi secondi (embedding + retrieval + generazione LLM).

---

## 2. `CatalogService` — catalogo/marketplace

Tutti gli endpoint sotto `/rest/catalog/...`.

### 2.1 `GET /rest/catalog/Asset`

Lista di tutti gli asset **pubblicati** (`published: true` — gli asset in coda di revisione non compaiono qui).

**Response (200)** — verificata reale:
```json
[
  {
    "ID": "0ab92df0-bfbb-48f7-91b2-0f72453e781b",
    "title": "Procedura onboarding nuovi assunti",
    "description": null,
    "type": "document",
    "certificationLevel": "community",
    "published": true,
    "certifiedAt": null,
    "certificationExpiresAt": null,
    "certifiedBy_ID": null,
    "uploadedBy_ID": "4fee0f2d-3971-46d4-ae9b-0bf94198485c",
    "externalLink": null,
    "createdAt": "2026-09-07T14:37:42.399Z",
    "createdBy": "privileged",
    "modifiedAt": "2026-09-07T14:37:42.399Z",
    "modifiedBy": "privileged"
  }
]
```

**Attenzione ai nomi campo — non uniformi tra endpoint diversi (è così lato server, non un errore di battitura da correggere):**
- Qui la chiave primaria è **`ID`** (maiuscolo) — perché è il campo grezzo dell'entità CDS.
- In `askBilly` sopra invece è **`assetId`** (camelCase) — perché è un campo costruito a mano nella action.
- Il frontend deve gestire entrambe le convenzioni a seconda dell'endpoint, **non assumere che sia sempre lo stesso nome**.
- `certifiedBy_ID`/`uploadedBy_ID` (non `certifiedById`/`uploadedById`) — convenzione CDS per le association, con underscore.

`type` è uno tra: `document`, `skill`, `tool`, `application`, `interface`, `other`.

### 2.2 `GET /rest/catalog/Asset/{ID}`

Dettaglio di un singolo asset pubblicato. Stessa forma dell'elemento sopra, un solo oggetto (non array).

**Nota importante:** questa risposta **non include gli allegati** (`attachments`) — vanno richiesti separatamente, vedi 2.7.

### 2.3 `POST /rest/catalog/uploadAsset`

Carica un nuovo asset. **Va sempre in coda di revisione** (mai pubblicato immediatamente, nemmeno al livello base `community`).

**Request:**
```json
{
  "title": "Titolo asset",
  "description": "Descrizione libera",
  "type": "document",
  "content": "Testo incollato direttamente (alternativa a fileContent)",
  "externalLink": "",
  "fileContent": null,
  "fileName": null,
  "fileMimeType": null
}
```

**Regola:** fornire **esattamente uno** tra `content` (testo semplice) e `fileContent` (file, **base64**, con `fileName` e `fileMimeType` associati — es. `application/pdf`, `.docx` MIME type). Se mancano entrambi → errore 400.

**Response (200):**
```json
{
  "ID": "<uuid nuovo asset>",
  "title": "Titolo asset",
  "description": "Descrizione libera",
  "type": "document",
  "certificationLevel": "community",
  "published": false
}
```

**Nota:** l'asset **non compare** in `GET /rest/catalog/Asset` finché non viene approvato (vedi 2.5) — `published` è `false` a questo punto.

### 2.4 `GET /rest/catalog/listReviewQueue`

Lista di tutto ciò che è in attesa di revisione — **funzione GET, non action POST** (bug reale trovato in Fase 2: le CDS `function` richiedono sempre GET, mai POST, altrimenti 404).

**Response (200):**
```json
[
  {
    "kind": "revision",
    "revisionId": "<uuid>",
    "assetId": "<uuid>",
    "title": "Titolo",
    "type": "document",
    "submittedBy": "Nome Cognome",
    "submittedAt": "2026-09-08T10:00:00.000Z"
  },
  {
    "kind": "renewal",
    "revisionId": "<uuid della revisione da riusare per il rinnovo>",
    "assetId": "<uuid>",
    "title": "Titolo asset scaduto",
    "type": "document",
    "submittedBy": null,
    "submittedAt": null
  }
]
```

Due `kind` distinti nello stesso array — il frontend deve distinguerli visivamente:
- `"revision"`: contenuto nuovo o modificato in attesa di prima approvazione
- `"renewal"`: asset già certificato ma **scaduto** (`certifiedOutdated`), in attesa di rinnovo — nessun nuovo contenuto, va solo ri-approvato

### 2.5 `POST /rest/catalog/reviewRevision`

Approva o rifiuta una revisione in coda.

**Request:**
```json
{
  "revisionId": "<uuid>",
  "approve": true,
  "validityMonths": 12,
  "pointsPct": 100,
  "reason": ""
}
```

- `approve: false` → la revisione viene rifiutata, l'asset resta invariato (se era la prima revisione, resta non pubblicato)
- `validityMonths` e `pointsPct` sono rilevanti solo se `approve: true`
- Se la revisione è un **rinnovo** (vedi `kind: "renewal"` sopra) e si prova a mandare `approve: false` → errore 400 esplicito (un rinnovo non si "rifiuta", si usa `setCertificationLevel` per deprecare)

**Response (200):** l'oggetto `Asset` completo aggiornato (stessa forma di 2.1/2.2).

### 2.6 `POST /rest/catalog/setCertificationLevel`

Cambia manualmente lo stato di un asset — **transizioni libere** (qualsiasi stato → qualsiasi altro, nessun vincolo di sequenza lato server).

**Request:**
```json
{
  "assetId": "<uuid>",
  "certificationLevel": "deprecated",
  "validityMonths": 12
}
```

`certificationLevel` uno tra: `community`, `certified`, `certifiedOutdated`, `deprecated`. `validityMonths` rilevante solo se si imposta `certified`.

**Response (200):** `Asset` completo aggiornato.

### 2.7 `GET /rest/catalog/Asset/{ID}/attachments`

Lista degli allegati di un asset (endpoint auto-generato standard, funziona regolarmente — **solo il download è custom**, vedi 2.8).

**Response (200)** — verificata reale:
```json
[
  {
    "ID": "5929063f-1c4c-40cc-9997-6e798fa91b16",
    "filename": "Arriva un.pdf",
    "mimeType": "application/pdf",
    "status": "Unscanned",
    "hash": "8656ee...",
    "up__ID": "6ed5d3bc-faa2-4429-97c3-6930bb97b169",
    "url": null,
    "note": null,
    "createdAt": "...", "createdBy": "...", "modifiedAt": "...", "modifiedBy": "..."
  }
]
```

**`status: "Unscanned"` è normale e atteso** — il malware scanning è disattivato in questa fase per decisione esplicita di prodotto (non un errore da segnalare all'utente come warning bloccante; se lo si vuole mostrare, un badge informativo neutro è sufficiente, non un colore di allarme).

### 2.8 `GET /rest/catalog/downloadAttachment?assetId=<uuid>&attachmentId=<uuid>`

Scarica il file originale. **Non è JSON** — risposta binaria diretta con header `Content-Type` e `Content-Disposition: attachment; filename="..."` già impostati dal server. Usare direttamente come `href` di un link `<a>` o aprire in una nuova tab — **non parsare come JSON**.

⚠️ **Non usare** l'URL "ovvio" `Asset/{ID}/attachments/{attachmentId}/content` (pattern standard `@cap-js/attachments`) — è noto rompersi con questo protocollo (crash del processo server). Usare **sempre e solo** questo endpoint dedicato.

### 2.9 `GET /rest/catalog/searchAssets?query=<testo>`

Ricerca full-text istantanea (nessuna chiamata AI, `LIKE` su titolo/descrizione, solo asset pubblicati).

**Response (200)** — verificata reale:
```json
[
  { "ID": "...", "title": "Policy smart working", "description": null, "type": "document", "certificationLevel": "community", "published": true }
]
```

### 2.10 `GET /rest/catalog/deepSearch?query=<testo>`

Ricerca semantica (stesso motore RAG di `askBilly`, ma restituisce solo un ranking di asset, non una risposta testuale). Utile per "trova asset simili a..." invece di "rispondi a...".

**Response (200)** — verificata reale:
```json
[
  { "assetId": "7098713a-...", "title": "Policy smart working", "similarity": 0.370 }
]
```

Nota: qui la chiave è di nuovo **`assetId`** (camelCase), non `ID` — stessa inconsistenza di cui sopra, gestirla esplicitamente.

### 2.11 `POST /rest/catalog/deleteAsset`

Elimina definitivamente un asset (e tutto ciò che dipende da esso: allegati, chunk, revisioni).

**Request:** `{ "assetId": "<uuid>" }` → **Response:** `true`

⚠️ Azione distruttiva e irreversibile — il frontend deve avere una conferma esplicita (dialog), non un singolo click.

### 2.12 `POST /rest/catalog/editAsset`

Propone una modifica a un asset esistente (**passa anch'essa dalla coda di revisione**, non aggiorna nulla live finché non approvata).

**Request:** stessa forma di `uploadAsset` più `assetId`. **Response:** `{ "revisionId": "<uuid>" }`.

---

## 3. Ruoli applicativi (NON sicurezza reale — solo per la UX)

Il `Player` corrente ha due flag: `isCertifier`, `isAdmin`. **Non esiste ancora login**, quindi non c'è modo per il frontend di sapere "chi sono io" in modo affidabile — un solo `Player` di default viene usato lato server per ogni richiesta in questa fase. **Non costruire UI condizionata sul ruolo utente per ora** (es. "nascondi il pulsante approva se non sei certificatore") — il backend stesso rifiuta con `403` chi non ha il ruolo giusto (vedi `reviewRevision`/`setCertificationLevel`/`deleteAsset`), quindi è già protetto lato server anche senza nascondere nulla lato UI. La UI può mostrare tutto e lasciare che sia il 403 a bloccare, oppure mostrare un semplice avviso — non è un problema di sicurezza da risolvere ora.

---

## 4. Cosa NON esiste ancora (non costruire la UI aspettandosi questi endpoint)

- **Nessun endpoint di gamification/leaderboard/punti.** Il modello dati (`Season`, `PointEvent`, `totalPoints` su `Player`) esiste nello schema ma **non è ancora popolato né esposto** da nessun servizio. Se si costruisce una pagina Leaderboard, va fatta con **dati finti/mock**, chiaramente isolata, pronta per essere ricollegata quando l'endpoint esisterà.
- **Nessun login/autenticazione.**
- **Nessuno streaming** della risposta di Billy (arriva tutta insieme).

## 5. Errori — formato

Gli errori applicativi (es. 403, 404, 400) tornano nel formato standard di errore CAP:
```json
{ "error": { "code": "...", "message": "Testo leggibile in italiano, già pronto per essere mostrato all'utente" } }
```
Il campo `message` è già scritto in linguaggio naturale dal backend (es. `"Solo Certifier o Admin possono revisionare"`) — il frontend può mostrarlo direttamente, non serve tradurlo o riformularlo.
