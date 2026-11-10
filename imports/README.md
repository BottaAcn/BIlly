# Billy × SharePoint — Script di migrazione

Script per migrare i dati di Billy da SAP BTP (export HANA) a Microsoft SharePoint via Graph API.

## Prerequisiti

- **Node.js** ≥ 18
- **App Registration in Entra ID** con permessi `Sites.ReadWrite.All` e `User.Read.All` (Application, non Delegated) — richiede un Global Admin o Application Admin Accenture (operazione una tantum)
- **Sito SharePoint** già creato: `https://accenture.sharepoint.com/sites/BillyCatalog`
- **File di export** generati da `../exports/export-hana.js`

## Setup

```bash
cd imports
npm install
cp .env.example .env
# Compilare .env con i valori reali
```

## Ottenere App Registration (da richiedere all'IT)

Istruzioni da fornire all'admin:

> Creare una App Registration in Entra ID:
> - **Display name**: `Billy Catalog Import Script`
> - **Supported account types**: Single tenant
> - **API permissions** (Application, non Delegated):
>   - `Microsoft Graph → Sites.ReadWrite.All`
>   - `Microsoft Graph → User.Read.All`
> - **Grant admin consent**: sì
> - **Client secret**: creare con scadenza 1 anno
>
> Fornire: Tenant ID, Client ID, Client Secret value

## Ordine di esecuzione

### 1. Export da BTP (prima di tutto)

```bash
cd ..
node exports/export-hana.js
# Verifica: exports/AAAA-MM-GG/skills.json e documents.json
```

### 2. Provisioning SharePoint

Crea tutte le library e le colonne. Idempotente — sicuro da rieseguire.

```bash
node provision-sharepoint.js
```

Output: stampa gli ID delle liste. Copiare nel `.env`:
```
SHAREPOINT_SITE_ID=...
SKILL_INDEX_LIST_ID=...
SKILL_CONTENT_LIST_ID=...
CERTIFIED_DOCS_LIST_ID=...
COMMUNITY_DOCS_LIST_ID=...
AGENT_CONFIGS_LIST_ID=...
```

### 3. Import skill

```bash
# Dry-run prima (verifica senza scrivere)
node import-skills.js --dry-run

# Import effettivo
node import-skills.js
# Oppure con data esplicita:
node import-skills.js --date 2026-11-10
```

### 4. Import documenti

```bash
node import-documents.js --dry-run
node import-documents.js
```

## Troubleshooting

### Errore 429 (Too Many Requests)
Normale — lo script gestisce il retry automaticamente con exponential backoff. Se persiste, aumentare le pause in `import-skills.js` (riga `setTimeout(r, 250)`) a 500ms o più.

### Errore 403 (Forbidden)
- Verificare che l'App Registration abbia `Sites.ReadWrite.All` come permesso **Application** (non Delegated)
- Verificare che l'admin abbia dato il **Grant admin consent**
- Verificare che `SHAREPOINT_SITE_URL` nel .env punti al sito corretto

### Errore "Site not found"
- Verificare che il sito SharePoint esista e che l'URL nel .env sia corretto (senza trailing slash)
- Il sito deve essere creato dall'utente prima di eseguire questi script

### Colonne non create / errore "InvalidRequest"
Alcuni tipi di colonna (es. `personOrGroup`) richiedono che il sito sia di tipo Team (non Communication). Verificare il tipo di sito in SharePoint Admin.

### Import parziale / script interrotto
Gli script sono idempotenti: rieseguire riprenderà dall'inizio saltando gli item già presenti (la verifica avviene tramite `SkillId` per le skill). Per i documenti il file viene sovrascritto se già presente.

## Struttura file creati

```
imports/
├── package.json
├── .env.example          ← template configurazione
├── .env                  ← NON committare
├── graph-client.js       ← client Graph condiviso + retry
├── provision-sharepoint.js  ← crea library + colonne
├── import-skills.js      ← importa skill (manifesto + corpo)
├── import-documents.js   ← importa documenti (chunk → file .txt)
└── README.md
```

## Note di sicurezza

- **Non committare `.env`** — contiene il client secret
- Il client secret scade dopo 1 anno — rinnovarlo in Entra ID prima della scadenza
- Se il secret viene esposto, revocarlo immediatamente in Entra ID > App registrations > Certificates & secrets
