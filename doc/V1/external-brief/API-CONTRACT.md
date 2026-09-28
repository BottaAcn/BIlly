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

## 1. `BillyService` — chat agentica

Billy non è più un RAG one-shot: è un **agente con tool loop**. Ad ogni domanda decide da solo se cercare nei documenti (`searchKnowledge`) e/o se caricare ed **eseguire** una delle skill pubblicate nel marketplace (`loadSkill`), eventualmente più volte in sequenza. Il frontend non controlla né vede questa scelta se non attraverso gli eventi della variante in streaming (§1.2).

### 1.1 `POST /rest/billy/askBilly` (non-streaming)

Domanda in linguaggio naturale → risposta con citazioni.

Usato anche come tool MCP (Fase 7), quindi restituisce sempre un risultato unico a fine elaborazione.

**Request:**
```json
{
  "question": "Come funziona lo smart working?",
  "history": [
    { "role": "user", "content": "Ciao, chi sei?" },
    { "role": "assistant", "content": "Sono Billy, l'assistente della practice..." }
  ]
}
```

`history` è **opzionale** (i turni precedenti della conversazione, senza quello corrente: la domanda corrente va in `question`). Sono ammessi solo i ruoli `"user"` e `"assistant"`; il server tiene gli ultimi 20 messaggi e ignora il resto. Omettendolo, il comportamento è identico a prima.

**Quanto storico mandare (contratto esplicito, non un dettaglio del frontend):**
- Il client **conserva** molto più di quello che manda. Il frontend di riferimento persiste le conversazioni in `localStorage` (chiave `billy-chat-history`, tetto di 200 messaggi / ~400 KB, con taglio dei più vecchi) solo per poterle rileggere.
- Al server manda invece **solo la conversazione in corso** — una conversazione si chiude all'apertura della pagina e al "reset" della chat — e di quella **solo gli ultimi 16 messaggi**. Mandare settimane di storico gonfierebbe il contesto e il costo in token senza aggiungere pertinenza.
- Il server applica comunque un proprio tetto difensivo: tiene **gli ultimi 20 messaggi** di `history`, scarta ruoli diversi da `user`/`assistant` e tronca i contenuti oltre 8.000 caratteri. Un client che manda di più non riceve un errore: il surplus viene semplicemente ignorato.

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
- `similarity` è `null` quando la fonte è una **skill** che Billy ha caricato ed eseguito, non un documento recuperato per similarità. È la convenzione che distingue i due casi: `similarity === null` ⇒ fonte-skill, valore numerico ⇒ fonte-documento. Il frontend non deve renderizzare "0% rilevanza" in quel caso.
- Questo endpoint **non streamma** (arriva tutto insieme a fine elaborazione) — prevedere uno stato di caricamento, la risposta può richiedere parecchi secondi (l'agente può fare più giri di tool prima di rispondere). Per i passi intermedi usare §1.2.

### 1.2 `POST /rest/billy/askBillyStream` (streaming, SSE)

Stessa elaborazione di `askBilly`, ma i passi intermedi arrivano man mano. **Non è un'action CDS** ma una rotta express dedicata (un'action CDS non può fare Server-Sent Events): non compare fra i tool MCP.

**Request:** identica a `askBilly` (`question` + `history` opzionale).

**Response (200):** `Content-Type: text/event-stream`. Ogni messaggio SSE è una riga `data: <json>` seguita da una riga vuota. Il primo byte inviato è il commento SSE `: ok`, per aprire subito la connessione.

Tipi di evento:

| `type` | Campi | Significato |
|---|---|---|
| `tool` | `name`, `args` | Billy sta per eseguire uno strumento. `name` è `"searchKnowledge"` (con `args.query`) o `"loadSkill"` (con `args.skillId`). |
| `result` | `name`, `ok`, `summary` | Strumento eseguito. `summary` sono i primi 200 caratteri del risultato, solo per diagnostica: non va mostrato all'utente. |
| `delta` | `text` | Pezzo di testo generato dal modello. |
| `answer` | `answer`, `sources` | Risposta finale, **stessa identica forma** del body di `askBilly`. È l'ultimo evento di una richiesta riuscita. |
| `error` | `message` | Errore a metà elaborazione. La connessione viene poi chiusa. |

Esempio di flusso:
```
: ok

data: {"type":"tool","name":"searchKnowledge","args":{"query":"stima effort AM"}}

data: {"type":"result","name":"searchKnowledge","ok":true,"summary":"- [certified] Listino AM: ..."}

data: {"type":"delta","text":"In base"}

data: {"type":"delta","text":" ai documenti"}

data: {"type":"answer","answer":"In base ai documenti...","sources":[{"assetId":"...","title":"Leva #1 — Devil's Advocate sulle stime","similarity":null,"certificationLevel":"certified","link":"/catalog/asset/..."}]}
```

**Note:**
- I `delta` di un giro che finisce in tool call sono un preambolo del modello ("ora cerco..."), non la risposta: alla ricezione di un evento `tool` conviene **azzerare** l'anteprima accumulata. L'unico testo autorevole è `answer`.
- L'assenza di un evento `answer` prima della chiusura dello stream significa richiesta interrotta.
- Se il client chiude la connessione, il server interrompe il loop invece di lasciarlo orfano.

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
- All'approvazione il contenuto della revisione viene copiato sull'asset. Per gli asset di tipo `document` (e tutti gli altri tipi) vengono anche generati i chunk per il RAG; per `type: "skill"` **no**: una procedura spezzata in frammenti da 700 caratteri produce istruzioni mutilate. Le skill non entrano nel retrieval per similarità — Billy le carica intere quando servono (§1). Se una revisione approvata cambia il tipo di un asset da `document` a `skill`, i chunk preesistenti vengono eliminati.

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
- ~~**Nessuno streaming** della risposta di Billy.~~ Ora esiste: `POST /rest/billy/askBillyStream` (§1.2). L'action `askBilly` resta comunque non-streaming.

## 5. Errori — formato

Gli errori applicativi (es. 403, 404, 400) tornano nel formato standard di errore CAP:
```json
{ "error": { "code": "...", "message": "Testo leggibile in italiano, già pronto per essere mostrato all'utente" } }
```
Il campo `message` è già scritto in linguaggio naturale dal backend (es. `"Solo Certifier o Admin possono revisionare"`) — il frontend può mostrarlo direttamente, non serve tradurlo o riformularlo.
