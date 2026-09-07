# Prompt pronto per tool esterno

> Copia-incolla questo testo nel tool scelto. Se il tool supporta l'upload di file di riferimento, allega anche `PROJECT-BRIEF.md` e `API-CONTRACT.md` (stessa cartella) — sono la versione estesa di quanto riassunto qui sotto. Se il tool accetta solo testo, questo prompt da solo è autosufficiente.

---

Costruisci **solo il frontend** di un'applicazione web interna aziendale chiamata **Billy**. Il backend esiste già, è deployato, ed è **fisso**: non proporre modifiche al backend, non inventare endpoint diversi da quelli elencati sotto.

## Cos'è Billy

Uno strumento interno (non consumer, non marketing) con due funzioni:
1. **Chat RAG**: i colleghi fanno domande in linguaggio naturale su documentazione aziendale (policy, procedure) e ricevono risposte con **citazioni cliccabili** verso i documenti originali, ognuna con un badge di affidabilità (vedi sotto).
2. **Catalogo/marketplace**: i colleghi caricano documenti (testo o file), che passano da una **coda di revisione** prima di diventare visibili/citabili da Billy.

Verrà usato ogni giorno per lavoro: **priorità a rapidità e leggibilità**, non a effetti spettacolari.

## Direzione visiva

- **Dark mode di default**, come tema di prima classe, non un invert di un tema chiaro
- **Un solo colore accento** per tutto (pulsanti primari, stati attivi) — resto della palette neutro (grigi/neri). Riferimenti di tono: **Linear**, **Raycast**, **Stripe** (dashboard), **Claude.ai** (per la UI di chat specificamente)
- Densità alta per liste/tabelle (catalogo, coda di revisione), spaziosità per la lettura distesa (messaggi chat)
- Componenti consigliati: **shadcn/ui** come base, **Magic UI** per micro-interazioni discrete. Evita librerie da landing-page pesanti (Aceternity va bene solo su un singolo hero, non diffuso)
- **Un solo momento visivo "di impatto"** (anche animato/3D) è accettabile, e solo sulla schermata iniziale della chat — mai su superfici che si aprono ripetutamente (catalogo, form, coda di revisione)
- **Palette stato certificazione, coerente ovunque appaia** (stesso significato = stesso colore in ogni punto dell'app):
  - `certified` → verde (verificato, valido)
  - `certifiedOutdated` → ambra (era verificato, scaduto — non è "sbagliato", va rinnovato)
  - `community` → grigio neutro (mai verificato — non è un errore, è uno stato normale)
  - `deprecated` → grigio scuro/disattivato (raro lato utente)
- Evita: parallax diffuso, animazioni di entrata su ogni elemento, 3D fuori dal singolo punto concesso, tema chiaro/scuro entrambi curati a metà (scegli scuro e basta)

## Pagine da costruire

1. **Chat Billy** (priorità massima) — input domanda, risposta in **Markdown** (va renderizzata come Markdown vero, non testo semplice: contiene grassetto, elenchi, blockquote di avviso), sotto la risposta le fonti citate con badge di certificazione colorato e link cliccabile. Nessuno streaming: la risposta arriva tutta insieme dopo 5-15 secondi — prevedi un loading state che comunichi "sto pensando", non un semplice spinner
2. **Catalogo**: lista asset pubblicati (titolo, tipo, badge certificazione), ricerca full-text istantanea **+ un pulsante/toggle esplicito "ricerca approfondita"** che usa un endpoint semantico diverso — l'utente deve capire che sono due modalità distinte
3. **Dettaglio asset**: metadati + allegato scaricabile se presente
4. **Upload**: form titolo/descrizione/tipo + **testo incollato OPPURE file** (alternative esplicite, non entrambe obbligatorie) — comunica chiaramente che va in revisione, non è visibile subito
5. **Coda di revisione**: lista di elementi in attesa, due tipi diversi da distinguere visivamente ("nuovo contenuto da approvare" vs "asset scaduto da rinnovare"), azione approva/rifiuta
6. **Leaderboard** (bassa priorità, costruisci con **dati finti/mock** — il backend per punti/classifica non esiste ancora)

## Contratto API (verificato con chiamate reali, non dedotto)

Base URL: `https://accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com`

Nessuna autenticazione per ora (non costruire login). Action = `POST` con body JSON, function = `GET` con query string.

- `POST /rest/billy/askBilly` — body `{"question": "..."}` → `{"answer": "...markdown...", "sources": [{"assetId","title","similarity","certificationLevel","link"}]}`
- `GET /rest/catalog/Asset` — lista asset pubblicati: `[{"ID","title","description","type","certificationLevel","published","certifiedAt","certificationExpiresAt","externalLink","uploadedBy_ID","certifiedBy_ID","createdAt","modifiedAt",...}]` — **qui la chiave è `ID`, non `assetId`** (incoerenza reale del backend, gestiscila)
- `GET /rest/catalog/Asset/{ID}` — dettaglio (stessa forma, un solo oggetto). Non include gli allegati.
- `GET /rest/catalog/Asset/{ID}/attachments` — lista allegati: `[{"ID","filename","mimeType","status","up__ID",...}]`. `status:"Unscanned"` è normale (scanning disattivato per scelta di prodotto, non è un errore)
- `GET /rest/catalog/downloadAttachment?assetId=<id>&attachmentId=<id>` — **risposta binaria diretta** (non JSON), usa come `href` di un link
- `POST /rest/catalog/uploadAsset` — body `{"title","description","type","content"?,"externalLink"?,"fileContent"?(base64),"fileName"?,"fileMimeType"?}` — fornire ESATTAMENTE uno tra `content` e `fileContent` → risposta `{"ID","title","description","type","certificationLevel","published":false}`
- `POST /rest/catalog/editAsset` — come sopra + `assetId` → `{"revisionId"}`
- `GET /rest/catalog/listReviewQueue` — `[{"kind":"revision"|"renewal","revisionId","assetId","title","type","submittedBy","submittedAt"}]`
- `POST /rest/catalog/reviewRevision` — body `{"revisionId","approve":bool,"validityMonths"?,"pointsPct"?,"reason"?}` → Asset completo aggiornato
- `POST /rest/catalog/setCertificationLevel` — body `{"assetId","certificationLevel","validityMonths"?}` → Asset completo aggiornato
- `POST /rest/catalog/deleteAsset` — body `{"assetId"}` → `true` (azione distruttiva, richiedi conferma esplicita in UI)
- `GET /rest/catalog/searchAssets?query=...` — ricerca full-text: `[{"ID","title","description","type","certificationLevel","published"}]`
- `GET /rest/catalog/deepSearch?query=...` — ricerca semantica: `[{"assetId","title","similarity"}]` (**qui la chiave è `assetId`**, non `ID`)

Gli errori tornano come `{"error":{"code":"...","message":"testo già in italiano, leggibile, mostrabile diretto all'utente"}}`.

## Vincoli assoluti

- Non implementare login/autenticazione (arriverà dopo, separatamente)
- Non inventare endpoint diversi da quelli sopra
- Non assumere che le chiavi JSON siano uniformi tra endpoint diversi — verificale una per una come indicato
- La Leaderboard va con dati finti, chiaramente isolati e sostituibili
- In caso di dubbio su un comportamento non specificato qui, segnalalo come domanda invece di indovinare
