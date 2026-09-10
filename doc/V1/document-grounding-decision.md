# Perché non usiamo il Document Grounding di SAP AI Core (tranne che per help.sap.com)

> Nato da un'esplorazione su MCP (09/09/2026): ci si è chiesti se il **Document Grounding** managed di SAP AI Core potesse sostituire in tutto o in parte la pipeline RAG scritta a mano (`Chunk` su HANA). Risposta: no, per i contenuti interni del catalogo — resta valido solo come fonte aggiuntiva su `help.sap.com`. Questo documento spiega perché, in modo che la domanda non debba riemergere ogni volta che si tocca l'argomento RAG/MCP.

## Cos'è il Document Grounding

Un modulo di SAP AI Core (parte dell'Orchestration API) che, dato un repository di documenti (SharePoint, S3, SFTP, ecc. — o chunk forniti via API), fa da solo chunking + embedding + ricerca vettoriale, restituendo contesto pertinente per una domanda. Esiste anche un repository **pre-provisionato di default, `help.sap.com`**: zero setup, copre "la maggior parte delle soluzioni SAP principali" (nessuna matrice di copertura ufficiale per prodotto — da verificare empiricamente per i prodotti che interessano).

## Cosa abbiamo già noi, e perché è diverso

Nello schema (`billy-app/db/schema.cds`) esistono due cose scollegate:

- **`Asset.attachments`** — BLOB del file originale su HANA (via `@cap-js/attachments`, kind `db`), usato *solo* per il download (vedi `downloadAttachment` in `catalog-service.js`, Fase 5). Billy non lo legge mai per rispondere.
- **`Chunk`** — la RAG vera: testo estratto → `chunkText` → `embed()` (SAP AI Core, `AzureOpenAiEmbeddingClient`) → riga con `embedding: Vector(3072)`, FK verso `Asset`, `certificationLevel` copiato. È questa tabella che `askBilly` interroga (`billy-service.js`), pesando la similarity per stato di certificazione:

```js
const CERTIFICATION_WEIGHT_SQL = `
  CASE c."CERTIFICATIONLEVEL"
    WHEN 'certified' THEN 1.0
    WHEN 'certifiedOutdated' THEN 0.75
    WHEN 'community' THEN 0.35
    ELSE 0.35
  END`;
```

## Le 4 ragioni per cui il Document Grounding non sostituisce questo, per i contenuti interni

1. **Attribuzione affidabile della fonte** (ragione originale, HANDOFF.md D1): ogni risposta di Billy deve linkare in modo affidabile dentro il *vostro* catalogo (`/catalog/asset/<id>`), che ha un ciclo di vita gestito da voi (chi ha caricato, chi ha certificato, quando scade). Il retrieval generico di Document Grounding non garantisce di restituire in modo affidabile "questo chunk = questa riga precisa del catalogo".
2. **La pesatura per certificazione è business logic vostra**: nessun retrieval generico sa cosa sia "certified" vs "community" per voi — è il `CASE` sopra, scritto a mano.
3. **Nessun risparmio di lavoro reale**: anche usando la Vector API di Document Grounding per bypassare i repository esterni, dovreste comunque calcolare voi chunk+embedding (lo fate già). A quel punto, interrogare la vostra tabella HANA con SQL locale ha meno pezzi mobili di chiamare un servizio esterno — nessun resource group aggiuntivo, nessun costo extra in AI Unit, nessuna latenza di rete in più.
4. **Il download del file originale resterebbe comunque un problema a parte**: Document Grounding fa retrieval testuale per generare risposte, non è uno storage per servire il file intatto all'utente — quel pezzo (BLOB su HANA, punto 1 sopra) andrebbe comunque costruito o pagato a parte (Work Zone/Document Management Service, anch'essi non gratuiti né già disponibili nel subaccount).

## Dove invece avrebbe senso: help.sap.com

Per la documentazione ufficiale SAP (non vostra, non certificata da voi, nessun link da garantire dentro il catalogo) i 4 punti sopra non si applicano: non c'è business logic di certificazione da rispettare, non c'è un file da far scaricare, non c'è niente "vostro" da duplicare. In questo caso specifico:

- **Zero setup**: repository `help.sap.com` già pronto, nessun documento da caricare.
- **Basso effort di integrazione**: si configura come modulo aggiuntivo nella stessa chiamata `OrchestrationClient` che `billy-app/srv/lib/ai.js` già usa — non serve un client MCP né un loop agentico, resta una singola chiamata.
- **Costo separato ma contenuto**: 0.005 AI Unit per record (fino a 50MB), esempio trovato: ~16,80€/anno per 40 record/anno a un prezzo di riferimento di ~7€/AI Unit — da verificare sul vostro contratto specifico.
- **Limite reale**: copertura prodotto non garantita/documentata ufficialmente — da testare empiricamente sui prodotti che interessano prima di fidarsene.

## Conclusione

Non sostituisce nulla di quello che già avete. Resta un'estensione facoltativa e a basso effort di Fase 1 (RAG), scoped separatamente, non prerequisito né blocco per nient'altro — da valutare solo se interessa arricchire le risposte di Billy con documentazione ufficiale SAP oltre al catalogo interno.
