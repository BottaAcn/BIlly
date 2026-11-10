# Billy × Copilot Studio — Checklist implementazione

Ogni task ha tutto il necessario per eseguirlo senza dover cercare altro: URL esatti, nomi colonne, valori choice, testo dei prompt, variabili d'ambiente, codice completo. Eseguire nell'ordine indicato — le fasi hanno dipendenze.

Legenda: `[ ]` = da fare · `[x]` = fatto · `[-]` = saltato/non applicabile

---

## FASE 0 — Backup completo da BTP

> **STOP. Non procedere alla Fase 1 finché tutti i file di backup non esistono localmente e sono stati aperti e verificati a mano.**

### 0.1 — Preparare cartella export

- [ ] Creare cartella `C:\code\billy-marketplace\exports\` (o dove preferisci, fuori dal repo)
- [ ] Creare sottocartella con data: `exports\2026-11-XX\`

### 0.2 — Eseguire export skill

> **Nota schema**: lo schema CDS reale usa `billy.Asset` come entità **unificata** per tutti i tipi (skill, document, interface, application, agent) + `billy.Chunk` per i chunk RAG separati. Non esistono tabelle separate `Skills` / `DocumentChunks`. Lo script qui sotto usa i nomi corretti.

- [ ] Aprire terminale nella cartella `billy-app\`
- [ ] Lo script è già in `exports\export-hana.js` — verificare che esista:

```
exports/export-hana.js   ← già creato, usa i nomi entità CDS corretti
```

Per riferimento, il contenuto è uno script Node.js che usa `SELECT.from('billy.Asset')` e `SELECT.from('billy.Chunk')`. Produce:
- `assets.json` — tutti gli asset pubblicati (tutti i tipi, `content` incluso)
- `chunks.json` — chunk RAG con campo `asset_ID` (non `documentId`)
- `summary.json` — conteggi per tipo e certificazione

**NON esiste** un file `skills.json` o `documents.json` — gli import scripts leggono da `assets.json` e filtrano per `type`.

```js
// SOLO PER RIFERIMENTO — il file reale è exports/export-hana.js
// Eseguire con: cd billy-app && node ../exports/export-hana.js

const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');

async function exportAll() {
  const db = await cds.connect.to('db');
  const timestamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, '..', 'exports', timestamp);
  fs.mkdirSync(outDir, { recursive: true });

  // --- SKILL ---
  const skills = await db.run(`
    SELECT
      ID, title, description, body AS content,
      certificationLevel, status, createdBy AS owner,
      createdAt, modifiedAt
    FROM billy_CatalogService_Skills
    WHERE status != 'deprecated'
    ORDER BY certificationLevel, title
  `);
  fs.writeFileSync(
    path.join(outDir, 'skills.json'),
    JSON.stringify(skills, null, 2),
    'utf8'
  );
  console.log(`✅ Skills: ${skills.length} record → exports/${timestamp}/skills.json`);

  // --- DOCUMENTI (chunk) ---
  // Adattare il nome tabella se diverso
  const docs = await db.run(`
    SELECT
      ID, documentId, title, chunkText, chunkIndex,
      certificationLevel, status, createdBy AS owner,
      createdAt
    FROM billy_CatalogService_DocumentChunks
    WHERE status = 'published'
    ORDER BY documentId, chunkIndex
  `);
  fs.writeFileSync(
    path.join(outDir, 'documents.json'),
    JSON.stringify(docs, null, 2),
    'utf8'
  );
  console.log(`✅ Document chunks: ${docs.length} record → exports/${timestamp}/documents.json`);

  // --- ASSET generici (se esiste tabella unificata) ---
  try {
    const assets = await db.run(`
      SELECT * FROM billy_CatalogService_Assets
      ORDER BY assetType, certificationLevel
    `);
    fs.writeFileSync(
      path.join(outDir, 'assets.json'),
      JSON.stringify(assets, null, 2),
      'utf8'
    );
    console.log(`✅ Assets: ${assets.length} record → exports/${timestamp}/assets.json`);
  } catch (e) {
    console.log('ℹ️  Tabella Assets non trovata — skip');
  }

  console.log(`\n📁 Export completo in: exports/${timestamp}/`);
}

exportAll().catch(err => {
  console.error('❌ Export fallito:', err.message);
  process.exit(1);
});
```

> **Nota sui nomi tabella**: i nomi esatti dipendono dallo schema HANA deployato. Se `billy_CatalogService_Skills` non esiste, controllare con `cds compile --to sql` o aprire HANA Explorer e cercare le tabelle con `BILLY` nel nome.

- [ ] Eseguire: `node exports/export-hana.js`
- [ ] Verificare che `skills.json` contenga almeno 22 record
- [ ] Aprire `skills.json` e verificare che il campo `content` sia compilato (non null/vuoto) per almeno le prime 5 skill
- [ ] Verificare che `documents.json` contenga record con `chunkText` compilato

### 0.3 — Verificare integrità export

- [ ] Contare skill: `node -e "const s=require('./exports/AAAA-MM-GG/skills.json'); console.log(s.length)"`
- [ ] Verificare che esistano tutti e 4 i livelli di certificazione:
  ```js
  const s = require('./exports/AAAA-MM-GG/skills.json');
  console.log([...new Set(s.map(x => x.certificationLevel))]);
  // Output atteso: ['certified', 'certifiedOutdated', 'community']
  ```
- [ ] Fare copia di sicurezza su OneDrive o Teams Files (fuori dalla macchina locale)

---

## FASE 1 — Verifica accessi e struttura SharePoint

### 1.1 — Verifica accesso Copilot Studio

- [ ] Aprire `https://copilotstudio.microsoft.com` con account `l.botta@accenture.com`
- [ ] Verificare che appaia la schermata home (non "accesso negato")
- [ ] Verificare che il pulsante **"Create"** o **"New agent"** sia visibile
- [ ] Controllare in alto a destra che il tenant sia **ACCENTURE** (non un tenant personale)
- [ ] Annotare il nome dell'environment attivo (es. "Default Environment" o "Accenture...") → `__________________`

### 1.2 — Verifica accesso Power Automate

- [ ] Aprire `https://make.powerautomate.com` con account Accenture
- [ ] Verificare che sia visibile la dashboard con "My flows"
- [ ] Controllare che l'environment in alto a destra corrisponda a quello di Copilot Studio

### 1.3 — Verifica accesso Power Apps

- [ ] Aprire `https://make.powerapps.com` con account Accenture
- [ ] Verificare che si possa cliccare "Create" → "Canvas app from blank"
- [ ] Verificare stesso environment di Copilot Studio e Power Automate

### 1.4 — Creare sito SharePoint "Billy Catalog"

- [ ] Aprire `https://accenture.sharepoint.com`
- [ ] Cliccare "Create site" → "Team site"
- [ ] **Site name:** `Billy Catalog`
- [ ] **Site address:** `BillyCatalog` (verificare disponibilità)
- [ ] **Privacy:** Private (solo chi viene invitato)
- [ ] **Language:** English (per compatibilità colonne in inglese)
- [ ] Cliccare "Create" e attendere la creazione
- [ ] Annotare URL sito: `https://accenture.sharepoint.com/sites/BillyCatalog` → `__________________`

### 1.5 — Creare library "Certified Documents"

- [ ] Nel sito Billy Catalog → New → Document library
- [ ] **Name:** `Certified Documents`
- [ ] Aggiungere colonne (tasto "+" nell'header della library):

| Nome colonna | Tipo | Configurazione |
|---|---|---|
| `AssetType` | Choice | Choices: `document`, `skill`, `interface`, `application`, `agent` · Default: `document` |
| `CertificationLevel` | Choice | Choices: `certified`, `certifiedOutdated`, `community`, `deprecated` · Default: `certified` |
| `Status` | Choice | Choices: `draft`, `in-review`, `published`, `deprecated` · Default: `draft` |
| `Owner` | Person | Allow multiple: No |
| `Description` | Multiple lines of text | Plain text, 6 lines |
| `ReviewedBy` | Person | Allow multiple: No |
| `ReviewNotes` | Multiple lines of text | Plain text, 4 lines |
| `ExternalLink` | Hyperlink | — |
| `Version` | Number | Default: 1 · Decimal places: 0 |

- [ ] Verificare che tutte le 9 colonne siano visibili nella vista default

### 1.6 — Creare library "Community Documents"

- [ ] Nel sito Billy Catalog → New → Document library
- [ ] **Name:** `Community Documents`
- [ ] Aggiungere le stesse 9 colonne della Fase 1.5 (stessi nomi, stessi valori)
  - Per `CertificationLevel`: default `community`

### 1.7 — Creare library "Skill Index"

> Questa library è la sorgente che Copilot Studio usa per il manifesto. Contiene SOLO Title e Description — NON il corpo della skill.

- [ ] Nel sito Billy Catalog → New → Document library
- [ ] **Name:** `Skill Index`
- [ ] Aggiungere colonne:

| Nome colonna | Tipo | Configurazione |
|---|---|---|
| `Description` | Multiple lines of text | Plain text, 8 lines · **Required: Yes** |
| `CertificationLevel` | Choice | Choices: `certified`, `certifiedOutdated`, `community`, `deprecated` · Default: `certified` |
| `Status` | Choice | Choices: `draft`, `in-review`, `published`, `deprecated` · Default: `published` |
| `Owner` | Person | Allow multiple: No |
| `SkillId` | Single line of text | Usato da LoadSkill per trovare il corpo |

- [ ] Creare una vista "Published Skills" con filtro: `Status` is equal to `published` AND `CertificationLevel` is not equal to `deprecated`
- [ ] Impostare "Published Skills" come vista default

### 1.8 — Creare library "Skill Content"

> Questa library contiene il corpo completo delle skill. NON è collegata come knowledge source — viene letta solo da LoadSkill.

- [ ] Nel sito Billy Catalog → New → Document library
- [ ] **Name:** `Skill Content`
- [ ] Aggiungere colonne:

| Nome colonna | Tipo | Configurazione |
|---|---|---|
| `Content` | Multiple lines of text | Enhanced rich text · **Required: Yes** · Unlimited lines |
| `SkillId` | Single line of text | Stessa SkillId della Skill Index corrispondente |
| `CertificationLevel` | Choice | Choices: `certified`, `certifiedOutdated`, `community`, `deprecated` |
| `Version` | Number | Default: 1 |
| `LastModifiedBy` | Person | — |

### 1.9 — Creare library "Agent Configs"

- [ ] Nel sito Billy Catalog → New → Document library
- [ ] **Name:** `Agent Configs`
- [ ] Aggiungere colonne:

| Nome colonna | Tipo | Configurazione |
|---|---|---|
| `AgentId` | Single line of text | ID univoco dell'agente |
| `SystemPrompt` | Multiple lines of text | Enhanced rich text · Unlimited |
| `AssignedSkills` | Multiple lines of text | Lista SkillId separati da virgola |
| `AssignedDocLibraries` | Multiple lines of text | Lista nomi library SP separati da virgola |
| `CopilotStudioAgentId` | Single line of text | ID agente in Copilot Studio (compilato dopo creazione) |
| `Status` | Choice | Choices: `draft`, `active`, `disabled` · Default: `draft` |
| `Owner` | Person | — |
| `Description` | Multiple lines of text | Plain text, 4 lines |

### 1.10 — Annotare Site ID e List ID (servono per le API)

- [ ] Aprire: `https://accenture.sharepoint.com/sites/BillyCatalog/_api/site` → annotare `Id`
- [ ] Oppure via Graph Explorer: `GET https://graph.microsoft.com/v1.0/sites/accenture.sharepoint.com:/sites/BillyCatalog`
  - Annotare `id` del sito: `__________________`
- [ ] `GET https://graph.microsoft.com/v1.0/sites/{siteId}/lists` → annotare gli ID delle liste:
  - Certified Documents list ID: `__________________`
  - Community Documents list ID: `__________________`
  - Skill Index list ID: `__________________`
  - Skill Content list ID: `__________________`
  - Agent Configs list ID: `__________________`

---

## FASE 2 — Creare l'agente Copilot Studio

### 2.1 — Creare nuovo agente

- [ ] Aprire `https://copilotstudio.microsoft.com`
- [ ] Cliccare **"Create"** → **"New agent"**
- [ ] Scegliere **"Skip to configure"** (non usare il wizard conversazionale)
- [ ] **Name:** `Billy`
- [ ] **Description:** `Billy è il knowledge agent di Accenture per la SAP Practice. Aiuta i consulenti a trovare documenti, procedure e skill certificate, e a navigare il catalogo di risorse.`
- [ ] **Instructions:** copia il testo esatto del §2.2 qui sotto
- [ ] Cliccare **"Create"**

### 2.2 — System instructions (testo esatto)

Copiare questo testo nel campo "Instructions" dell'agente:

```
Sei Billy, il knowledge agent della SAP Practice di Accenture.
Aiuti i consulenti a trovare documenti, procedure (skill) e risorse certificate.

## REGOLE FONDAMENTALI

1. Prima di rispondere a qualsiasi domanda tecnica, verifica SEMPRE se esiste una skill pertinente nel knowledge source "Skill Index". Se la trovi, chiama OBBLIGATORIAMENTE l'action LoadSkill con il suo SkillId prima di rispondere. Non rispondere mai su una procedura senza averla caricata per intero.

2. Hai due livelli di contenuto documentale:
   - "Certified Documents": fonte autorevole, validata da senior Accenture. Usala come prima scelta.
   - "Community Documents": contributi non validati. Usala solo se Certified non ha la risposta. In questo caso AVVISA SEMPRE l'utente: "Attenzione: questa informazione proviene da una fonte community non validata da un senior."

3. Nella risposta indica SEMPRE: titolo della fonte, livello di certificazione (certified / community), e data di ultima modifica se disponibile.

4. Se la domanda riguarda chiaramente il dominio di un sotto-agente specializzato, usa l'action RunSubAgent per delegare. Non provare a rispondere tu su argomenti fuori dal tuo ambito.

5. Se non trovi nessuna informazione pertinente né tra i documenti né tra le skill, dillo chiaramente: "Non ho trovato risorse nel catalogo su questo argomento. Potresti caricare una skill o un documento su questo tema?"

6. Non inventare procedure o informazioni tecniche. Cita solo ciò che hai trovato nel catalogo.

7. Quando un utente vuole caricare un nuovo asset (documento, skill, interfaccia, agente), guidalo al wizard di upload nella Power App del catalogo: [link Power App catalogo - da aggiornare dopo Fase 6]

## SOTTO-AGENTI DISPONIBILI
[Da aggiornare dopo Fase 7 con l'elenco degli agenti Connected]

## LINGUA
Rispondi sempre nella lingua in cui ti viene posta la domanda.
```

### 2.3 — Configurare harness

- [ ] Nel menu dell'agente → **"Settings"** → **"Generative AI"**
- [ ] Selezionare **"GitHub Copilot"** come orchestration model (non "Classic" né "Generative")
- [ ] Salvare le impostazioni

> Se "GitHub Copilot" non appare come opzione, significa che non è ancora abilitato nel tenant. Verificare in Copilot Studio Admin → Features → GitHub Copilot harness.

### 2.4 — Aggiungere knowledge source: Skill Index

- [ ] Nel menu dell'agente → **"Knowledge"** → **"Add knowledge"**
- [ ] Selezionare **"SharePoint"**
- [ ] Inserire URL della library Skill Index: `https://accenture.sharepoint.com/sites/BillyCatalog/Skill%20Index`
- [ ] **Name:** `Skill Index`
- [ ] **Description:** `Indice delle procedure e skill disponibili nel catalogo Billy. Contiene titolo e descrizione breve di ogni skill. NON contiene il corpo completo — per ottenere la procedura completa usare l'action LoadSkill.`
- [ ] Cliccare "Add"

### 2.5 — Aggiungere knowledge source: Certified Documents

- [ ] Nel menu dell'agente → **"Knowledge"** → **"Add knowledge"** → **"SharePoint"**
- [ ] URL: `https://accenture.sharepoint.com/sites/BillyCatalog/Certified%20Documents`
- [ ] **Name:** `Certified Documents`
- [ ] **Description:** `Documenti tecnici certificati e validati da senior Accenture della SAP Practice. Fonte autorevole — usare come prima scelta.`
- [ ] Cliccare "Add"

### 2.6 — Aggiungere knowledge source: Community Documents

- [ ] Nel menu dell'agente → **"Knowledge"** → **"Add knowledge"** → **"SharePoint"**
- [ ] URL: `https://accenture.sharepoint.com/sites/BillyCatalog/Community%20Documents`
- [ ] **Name:** `Community Documents`
- [ ] **Description:** `Documenti e contributi della community, non validati da senior. Usare solo se Certified Documents non contiene la risposta. Avvisare sempre l'utente della natura non validata della fonte.`
- [ ] Cliccare "Add"

### 2.7 — Test base (senza actions)

- [ ] Aprire il pannello "Test your agent" (tasto in alto a destra)
- [ ] Inviare: `Ciao Billy, quante skill hai disponibili?`
  - Atteso: Billy risponde citando skill trovate nello Skill Index (anche se è ancora vuoto, deve rispondere con 0 o "non ne trovo")
- [ ] Inviare: `Descrivi brevemente cosa sai fare`
  - Atteso: Billy descrive il suo ruolo come da system instructions
- [ ] Se le risposte sono coerenti: ✅ agente base funzionante

---

## FASE 3 — Power Automate flows

### 3.1 — Flow: LoadSkill

- [ ] Aprire `https://make.powerautomate.com`
- [ ] **"Create"** → **"Instant cloud flow"**
- [ ] **Flow name:** `Billy - LoadSkill`
- [ ] **Trigger:** `When an HTTP request is received` (cerca "HTTP request")
- [ ] Nel trigger, impostare **"Request Body JSON Schema"**:

```json
{
  "type": "object",
  "properties": {
    "skillId": {
      "type": "string",
      "description": "SkillId o titolo della skill da caricare"
    }
  },
  "required": ["skillId"]
}
```

- [ ] Aggiungere step: **"Get items" (SharePoint)**
  - **Site Address:** `https://accenture.sharepoint.com/sites/BillyCatalog`
  - **List Name:** `Skill Content`
  - **Filter Query:** `SkillId eq '@{triggerBody()?['skillId']}'`
  - **Top Count:** `1`

- [ ] Aggiungere step: **"Condition"**
  - **Condition:** `length(outputs('Get_items')?['body/value'])` is greater than `0`

- [ ] Nel ramo **"Yes"** aggiungere: **"Response"**
  - **Status Code:** `200`
  - **Headers:** `Content-Type: application/json`
  - **Body:**
  ```json
  {
    "found": true,
    "title": "@{first(outputs('Get_items')?['body/value'])?['Title']}",
    "content": "@{first(outputs('Get_items')?['body/value'])?['Content']}",
    "certificationLevel": "@{first(outputs('Get_items')?['body/value'])?['CertificationLevel']}",
    "version": "@{first(outputs('Get_items')?['body/value'])?['Version']}",
    "lastModified": "@{first(outputs('Get_items')?['body/value'])?['Modified']}"
  }
  ```

- [ ] Nel ramo **"No"** aggiungere: **"Response"**
  - **Status Code:** `404`
  - **Body:**
  ```json
  {
    "found": false,
    "error": "Skill non trovata con SkillId: @{triggerBody()?['skillId']}"
  }
  ```

- [ ] Salvare il flow
- [ ] **Annotare l'HTTP POST URL** che compare nel trigger: `__________________`
  (formato: `https://prod-XX.XX.logic.azure.com:443/workflows/...`)

### 3.2 — Flow: Approval workflow

- [ ] **"Create"** → **"Automated cloud flow"**
- [ ] **Flow name:** `Billy - Asset Approval`
- [ ] **Trigger:** `When an item is created or modified (SharePoint)`
  - **Site Address:** `https://accenture.sharepoint.com/sites/BillyCatalog`
  - **List Name:** `Skill Index`
  - (Replicare poi per Certified Documents e Community Documents)

- [ ] Aggiungere step: **"Condition"**
  - **Condition:** `triggerOutputs()?['body/Status']` is equal to `in-review`

- [ ] Nel ramo **"Yes"**:

  - Step 1: **"Start and wait for an approval"**
    - **Approval type:** `Approve/Reject - First to respond`
    - **Title:** `Revisione asset Billy: @{triggerOutputs()?['body/Title']}`
    - **Assigned to:** *(inserire email dei revisori senior, separati da `;`)*
    - **Details:**
      ```
      Tipo asset: @{triggerOutputs()?['body/AssetType']}
      Livello certificazione richiesto: @{triggerOutputs()?['body/CertificationLevel']}
      Caricato da: @{triggerOutputs()?['body/Owner/DisplayName']}
      
      Descrizione: @{triggerOutputs()?['body/Description']}
      
      Link diretto: @{triggerOutputs()?['body/{Link}']}
      ```
    - **Item link:** `@{triggerOutputs()?['body/{Link}']}`

  - Step 2: **"Condition"** sul risultato approvazione
    - **Condition:** `outputs('Start_and_wait_for_an_approval')?['body/outcome']` is equal to `Approve`

  - Ramo **"Approve" → Yes**:
    - **"Update item" (SharePoint)**
      - Site: `https://accenture.sharepoint.com/sites/BillyCatalog`
      - List: `Skill Index`
      - ID: `@{triggerOutputs()?['body/ID']}`
      - Status: `published`
      - ReviewedBy: *(email del revisore dall'output approvazione)*
      - ReviewNotes: `@{outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['comments']}`
    - **"Post a message in a chat or channel" (Teams)**
      - Post in: `Chat with Flow bot`
      - Recipient: `@{triggerOutputs()?['body/Owner/Email']}`
      - Message:
        ```
        ✅ Il tuo asset **@{triggerOutputs()?['body/Title']}** è stato **approvato** e pubblicato nel catalogo Billy.
        Livello: @{triggerOutputs()?['body/CertificationLevel']}
        Note del revisore: @{outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['comments']}
        ```

  - Ramo **"Approve" → No** (Rejected):
    - **"Update item" (SharePoint)**
      - Status: `draft`
      - ReviewNotes: `@{outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['comments']}`
    - **"Post a message in a chat or channel" (Teams)**
      - Recipient: `@{triggerOutputs()?['body/Owner/Email']}`
      - Message:
        ```
        ❌ Il tuo asset **@{triggerOutputs()?['body/Title']}** è stato **rifiutato**.
        Motivo: @{outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['comments']}
        Puoi modificarlo e ricaricarlo cambiando lo Status in "in-review".
        ```

- [ ] Salvare il flow
- [ ] Replicare il flow per le library `Community Documents` e `Certified Documents` (stesso identico flow, cambia solo il List Name nel trigger)

### 3.3 — Flow: PublishAsset

- [ ] **"Create"** → **"Instant cloud flow"**
- [ ] **Flow name:** `Billy - PublishAsset`
- [ ] **Trigger:** `When an HTTP request is received`
- [ ] **Request Body JSON Schema:**

```json
{
  "type": "object",
  "properties": {
    "assetId": { "type": "string" },
    "listName": { "type": "string", "description": "Nome della library SharePoint" }
  },
  "required": ["assetId", "listName"]
}
```

- [ ] Aggiungere step: **"Get item" (SharePoint)**
  - Site: `https://accenture.sharepoint.com/sites/BillyCatalog`
  - List Name: `@{triggerBody()?['listName']}`
  - ID: `@{triggerBody()?['assetId']}`

- [ ] Aggiungere step: **"Update item" (SharePoint)**
  - Status: `published`

- [ ] Aggiungere step: **"Post message" (Teams)** — notifica all'owner

- [ ] Aggiungere step: **"Response"** → `{"success": true, "assetId": "@{triggerBody()?['assetId']}"}`

- [ ] Salvare il flow
- [ ] **Annotare URL:** `__________________`

### 3.4 — Flow: Notifica community nuovi asset

- [ ] **"Create"** → **"Automated cloud flow"**
- [ ] **Flow name:** `Billy - Notifica Pubblicazione`
- [ ] **Trigger:** `When an item is created or modified (SharePoint)`
  - List: `Skill Index`
  - Condition check: Status = `published` (aggiungere condition come in 3.2)
- [ ] Step: **"Post message in a channel" (Teams)**
  - Team: *(nome del team Accenture dove si vuole la notifica)*
  - Channel: *(nome canale, es. "Billy Aggiornamenti")*
  - Message:
    ```
    📚 Nuovo asset pubblicato nel catalogo Billy!
    
    **@{triggerOutputs()?['body/Title']}**
    Tipo: @{triggerOutputs()?['body/AssetType']} | Livello: @{triggerOutputs()?['body/CertificationLevel']}
    Caricato da: @{triggerOutputs()?['body/Owner/DisplayName']}
    
    @{triggerOutputs()?['body/Description']}
    ```
- [ ] Salvare il flow

---

## FASE 4 — Collegare le Actions a Copilot Studio

### 4.1 — Action: LoadSkill

- [ ] Aprire l'agente Billy in Copilot Studio
- [ ] Menu → **"Actions"** → **"Add an action"**
- [ ] Selezionare **"Power Automate flow"**
- [ ] Selezionare il flow **"Billy - LoadSkill"**
- [ ] **Action name:** `LoadSkill`
- [ ] **Description:** `Carica il corpo completo di una skill/procedura dal catalogo. Da usare SEMPRE quando si identificano skill pertinenti nello Skill Index, prima di rispondere. Input: skillId (string) — il SkillId o il titolo esatto della skill.`
- [ ] **Input parameter:**
  - Name: `skillId`
  - Type: `String`
  - Description: `SkillId o titolo della skill da caricare. Trovalo nel campo SkillId dello Skill Index.`
  - Required: `Yes`
- [ ] **Output parameter:**
  - Name: `content`
  - Description: `Corpo completo della skill con la procedura dettagliata`
- [ ] Salvare l'action

### 4.2 — Action: PublishAsset

- [ ] Menu → **"Actions"** → **"Add an action"** → **"Power Automate flow"**
- [ ] Selezionare il flow **"Billy - PublishAsset"**
- [ ] **Action name:** `PublishAsset`
- [ ] **Description:** `Pubblica un asset approvato nel catalogo Billy. Usare solo quando l'utente ha i permessi per pubblicare e l'asset è in stato "approved".`
- [ ] **Input parameters:**
  - `assetId`: String, Required, "ID SharePoint dell'asset da pubblicare"
  - `listName`: String, Required, "Nome della library SharePoint (es. 'Skill Index', 'Certified Documents')"
- [ ] Salvare l'action

### 4.3 — Aggiornare system instructions con le actions

- [ ] Aprire le Instructions dell'agente
- [ ] Aggiungere questa sezione alle istruzioni (dopo le REGOLE FONDAMENTALI):

```
## ACTIONS DISPONIBILI

### LoadSkill(skillId)
Usa questa action OGNI VOLTA che trovi una skill pertinente nello Skill Index.
- skillId: il valore del campo SkillId dell'item trovato nello Skill Index
- L'action restituisce il corpo completo della procedura (campo "content")
- Leggi il contenuto restituito PRIMA di rispondere all'utente

### PublishAsset(assetId, listName)
Pubblica un asset che è stato approvato.
- assetId: ID numerico dell'item SharePoint
- listName: nome esatto della library ("Skill Index", "Certified Documents", "Community Documents")
- Usare solo su richiesta esplicita dell'utente con permessi adeguati
```

- [ ] Salvare

### 4.4 — Test actions

- [ ] Importare prima almeno 2-3 skill (Fase 5) per poter testare
- [ ] Nel pannello Test: `Spiega come si crea un report in SAP Analytics Cloud`
  - Atteso: Billy cerca nello Skill Index → trova skill SAC → chiama LoadSkill → risponde con il corpo
  - Verificare nei log (sezione "Activity"): deve apparire la chiamata a LoadSkill

---

## FASE 5 — Import dati da BTP a SharePoint

### 5.1 — Installare dipendenze script import

- [ ] Creare cartella `imports\` nella root del progetto (fuori da `billy-app\`)
- [ ] Creare `imports\package.json`:

```json
{
  "name": "billy-sharepoint-import",
  "version": "1.0.0",
  "description": "Import skill e documenti da BTP export a SharePoint",
  "main": "import-skills.js",
  "dependencies": {
    "@microsoft/microsoft-graph-client": "^3.0.2",
    "@azure/identity": "^4.0.0",
    "node-fetch": "^3.3.2"
  }
}
```

- [ ] Eseguire: `cd imports && npm install`

### 5.2 — Creare App Registration in Entra ID (richiede admin Accenture — una tantum)

> Questa operazione richiede un Global Admin o Application Admin nel tenant Accenture. Da richiedere via ticket IT o chiedere a un collega con i permessi.

**Istruzioni da fornire all'admin:**

```
Richiedere la creazione di una App Registration in Entra ID con questi parametri:
- Display name: "Billy Catalog Import Script"
- Type: Single tenant
- Redirect URI: nessuna (è un'app server-to-server)
- API permissions: Microsoft Graph → Application permissions:
    - Sites.ReadWrite.All
    - User.Read.All (per risolvere i nomi owner)
- Grant admin consent: sì
- Client secret: creare uno con scadenza 1 anno, fornire il valore

Fornire al richiedente:
- Tenant ID (Directory ID)
- Client ID (Application ID)
- Client Secret value
```

- [ ] Ricevere da admin:
  - `TENANT_ID`: `__________________`
  - `CLIENT_ID`: `__________________`
  - `CLIENT_SECRET`: `__________________`

### 5.3 — Creare file .env per lo script import

- [ ] Creare `imports\.env` (NON committare questo file):

```
TENANT_ID=__________________
CLIENT_ID=__________________
CLIENT_SECRET=__________________
SHAREPOINT_SITE_URL=https://accenture.sharepoint.com/sites/BillyCatalog
SKILL_INDEX_LIST_ID=__________________
SKILL_CONTENT_LIST_ID=__________________
CERTIFIED_DOCS_LIST_ID=__________________
COMMUNITY_DOCS_LIST_ID=__________________
```

- [ ] Aggiungere `imports/.env` al `.gitignore`

### 5.4 — Creare script import-skills.js

- [ ] Creare `imports\import-skills.js`:

```js
// imports/import-skills.js
// Eseguire con: node import-skills.js
// Importa le skill da exports/AAAA-MM-GG/skills.json su SharePoint

require('dotenv').config();
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);
const fs = require('fs');
const path = require('path');

// --- CONFIGURAZIONE ---
// Cambiare questa data con quella dell'export effettuato
const EXPORT_DATE = '2026-11-XX'; // ← CAMBIARE
const SKILLS_FILE = path.join(__dirname, '..', 'exports', EXPORT_DATE, 'skills.json');

const SITE_URL = process.env.SHAREPOINT_SITE_URL;
const SKILL_INDEX_LIST_ID = process.env.SKILL_INDEX_LIST_ID;
const SKILL_CONTENT_LIST_ID = process.env.SKILL_CONTENT_LIST_ID;

// Estrae il Site ID dall'URL (formato: accenture.sharepoint.com:/sites/BillyCatalog:)
const SITE_ID = SITE_URL.replace('https://', '').replace('/sites/', ':/sites/') + ':';

async function getGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.TENANT_ID,
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  return Client.initWithMiddleware({ authProvider });
}

async function importSkills() {
  const client = await getGraphClient();
  const skills = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8'));
  
  console.log(`Importo ${skills.length} skill da ${SKILLS_FILE}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const skill of skills) {
    // Genera un SkillId stabile dall'ID originale BTP
    const skillId = `btp-${skill.ID}`;
    
    try {
      // 1. Crea item in Skill Index (solo manifesto — NO content)
      await client
        .api(`/sites/${SITE_ID}/lists/${SKILL_INDEX_LIST_ID}/items`)
        .post({
          fields: {
            Title: skill.title,
            Description: skill.description || '',
            CertificationLevel: skill.certificationLevel || 'community',
            Status: skill.status === 'published' ? 'published' : 'draft',
            SkillId: skillId
          }
        });
      
      // 2. Crea item in Skill Content (corpo completo)
      await client
        .api(`/sites/${SITE_ID}/lists/${SKILL_CONTENT_LIST_ID}/items`)
        .post({
          fields: {
            Title: skill.title,
            Content: skill.content || '',
            SkillId: skillId,
            CertificationLevel: skill.certificationLevel || 'community',
            Version: 1
          }
        });
      
      successCount++;
      console.log(`  ✅ ${skill.title} (${skillId})`);
      
      // Pausa per non saturare le API (rate limit SharePoint: ~300 req/min)
      await new Promise(r => setTimeout(r, 250));
      
    } catch (err) {
      errorCount++;
      console.error(`  ❌ ${skill.title}: ${err.message}`);
    }
  }
  
  console.log(`\nImport completato: ${successCount} successi, ${errorCount} errori`);
}

importSkills().catch(err => {
  console.error('Script fallito:', err);
  process.exit(1);
});
```

- [ ] Eseguire: `node imports/import-skills.js`
- [ ] Verificare in SharePoint "Skill Index" che le skill siano apparse
- [ ] Verificare che una skill aperta abbia il campo `SkillId` compilato
- [ ] Verificare in "Skill Content" che lo stesso `SkillId` esista e `Content` sia compilato

### 5.5 — Creare script import-documents.js

- [ ] Creare `imports\import-documents.js`:

```js
// imports/import-documents.js
// Importa i documenti (come file o come testo) nelle library Certified/Community

require('dotenv').config();
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);
const fs = require('fs');
const path = require('path');

const EXPORT_DATE = '2026-11-XX'; // ← CAMBIARE
const DOCS_FILE = path.join(__dirname, '..', 'exports', EXPORT_DATE, 'documents.json');
const SITE_URL = process.env.SHAREPOINT_SITE_URL;
const SITE_ID = SITE_URL.replace('https://', '').replace('/sites/', ':/sites/') + ':';
const CERTIFIED_LIST_ID = process.env.CERTIFIED_DOCS_LIST_ID;
const COMMUNITY_LIST_ID = process.env.COMMUNITY_DOCS_LIST_ID;

async function getGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.TENANT_ID, process.env.CLIENT_ID, process.env.CLIENT_SECRET
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  return Client.initWithMiddleware({ authProvider });
}

async function importDocs() {
  const client = await getGraphClient();
  
  // Raggruppa chunk per documentId
  const chunks = JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8'));
  const byDoc = {};
  for (const chunk of chunks) {
    if (!byDoc[chunk.documentId]) byDoc[chunk.documentId] = [];
    byDoc[chunk.documentId].push(chunk);
  }
  
  console.log(`Importo ${Object.keys(byDoc).length} documenti (${chunks.length} chunk totali)`);
  
  for (const [docId, docChunks] of Object.entries(byDoc)) {
    docChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const firstChunk = docChunks[0];
    
    // Ricostruisce il testo completo del documento dai chunk
    const fullText = docChunks.map(c => c.chunkText).join('\n\n');
    
    const isCertified = ['certified', 'certifiedOutdated'].includes(firstChunk.certificationLevel);
    const listId = isCertified ? CERTIFIED_LIST_ID : COMMUNITY_LIST_ID;
    
    try {
      // Carica come file .txt nella library appropriata
      const fileName = `${firstChunk.title.replace(/[^a-zA-Z0-9 ]/g, '_')}.txt`;
      
      // Upload file content
      await client
        .api(`/sites/${SITE_ID}/drives`)
        .get()
        .then(async drives => {
          const drive = drives.value[0]; // Primo drive del sito
          await client
            .api(`/drives/${drive.id}/root:/${fileName}:/content`)
            .put(Buffer.from(fullText, 'utf8'));
        });
      
      console.log(`  ✅ ${firstChunk.title} (${docChunks.length} chunk, ${isCertified ? 'certified' : 'community'})`);
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.error(`  ❌ ${firstChunk.title}: ${err.message}`);
    }
  }
}

importDocs().catch(err => {
  console.error('Script fallito:', err);
  process.exit(1);
});
```

- [ ] Eseguire: `node imports/import-documents.js`
- [ ] Verificare in SharePoint "Certified Documents" che i documenti siano apparsi
- [ ] Verificare in SharePoint "Community Documents" i documenti community

---

## FASE 6 — Power Apps: catalogo e wizard upload

### 6.1 — Creare Canvas App "Billy Catalog"

- [ ] Aprire `https://make.powerapps.com`
- [ ] **"Create"** → **"Canvas app from blank"**
- [ ] **App name:** `Billy Catalog`
- [ ] **Format:** Tablet (più comodo per catalogo)
- [ ] Cliccare "Create"

### 6.2 — Connettere SharePoint come data source

- [ ] Nel pannello sinistro → **"Data"** → **"Add data"**
- [ ] Cerca "SharePoint" → Seleziona SharePoint connector
- [ ] Inserisci URL sito: `https://accenture.sharepoint.com/sites/BillyCatalog`
- [ ] Seleziona tutte e 5 le library come data source:
  - `Certified Documents`
  - `Community Documents`
  - `Skill Index`
  - `Skill Content`
  - `Agent Configs`

### 6.3 — Schermata 1: Catalogo (Home)

- [ ] Rinominare Screen1 → `CatalogScreen`
- [ ] Aggiungere **Gallery** (Vertical) con la seguente formula su Items:
  ```
  Filter(
    'Skill Index',
    Status = "published",
    (
      IsBlank(SearchBox.Text) ||
      Title in SearchBox.Text ||
      Description in SearchBox.Text
    ),
    (
      FilterDropdown.Selected.Value = "Tutti" ||
      CertificationLevel = FilterDropdown.Selected.Value
    )
  )
  ```
- [ ] Aggiungere sopra alla gallery:
  - **Text input** `SearchBox`: Placeholder = "Cerca skill o documento..."
  - **Dropdown** `FilterDropdown`: Items = `["Tutti", "certified", "certifiedOutdated", "community"]`
  - **Button** "Carica nuovo asset" → OnSelect = `Navigate(UploadScreen)`
  - **Button** "Coda revisione" → OnSelect = `Navigate(ReviewScreen)` (solo per utenti senior)
- [ ] Nel template della gallery aggiungere:
  - Label: `ThisItem.Title` (bold, 16pt)
  - Label: `ThisItem.Description` (12pt, 2 righe max)
  - Badge: `ThisItem.CertificationLevel` (colore verde=certified, giallo=community)
  - Label data: `Text(ThisItem.Modified, "dd/mm/yyyy")`

### 6.4 — Schermata 2: Wizard upload

- [ ] Aggiungere nuova schermata → rinominare `UploadScreen`
- [ ] Aggiungere form **"Edit form"** con questi campi e formule:

| Campo form | Control | DefaultValue | Validazione |
|---|---|---|---|
| Titolo | Text input | — | `!IsBlank(Self.Text)` |
| Tipo asset | Dropdown | `"skill"` | Items: `["document","skill","interface","application","agent"]` |
| Livello richiesto | Dropdown | `"community"` | Items: `["certified","certifiedOutdated","community"]` |
| Descrizione | Text input multiline | — | `Len(Self.Text) >= 50` |
| Contenuto skill | Text input multiline | — | visibile solo se AssetType = "skill" |
| File allegato | Attachment control | — | visibile solo se AssetType = "document" |

- [ ] Aggiungere bottone **"Invia per revisione"**:
  ```
  OnSelect:
  If(
    IsBlank(TitleInput.Text) || IsBlank(DescriptionInput.Text),
    Notify("Compila tutti i campi obbligatori", NotificationType.Error),
    
    Patch(
      'Skill Index',
      Defaults('Skill Index'),
      {
        Title: TitleInput.Text,
        Description: DescriptionInput.Text,
        AssetType: AssetTypeDropdown.Selected.Value,
        CertificationLevel: CertLevelDropdown.Selected.Value,
        Status: "in-review",
        Owner: User()
      }
    );
    
    Notify("Asset inviato per revisione! Riceverai una notifica Teams.", NotificationType.Success);
    Navigate(CatalogScreen)
  )
  ```

### 6.5 — Schermata 3: Review queue

- [ ] Aggiungere schermata → `ReviewScreen`
- [ ] Gallery filtrata: `Filter('Skill Index', Status = "in-review")`
- [ ] Per ogni item: bottoni "Approva" e "Rifiuta" con Patch su Status e chiamata al flow di notifica

### 6.6 — Pubblicare la app in Teams

- [ ] In Power Apps → File → Save → Publish
- [ ] **"Add to Teams"** → segui wizard
- [ ] **App name in Teams:** `Billy Catalog`
- [ ] Il tab apparirà nei team in cui si aggiunge l'app
- [ ] Aggiornare le system instructions di Billy con il link alla Power App

---

## FASE 7 — Sub-agenti (Connected Agents)

### 7.1 — Creare il primo sotto-agente

- [ ] Aprire Copilot Studio → **"Create"** → **"New agent"**
- [ ] **Name:** `Billy-[Dominio]` (es. `Billy-SAC` per SAP Analytics Cloud)
- [ ] **Instructions:** 
  ```
  Sei un agente specializzato in [DOMINIO]. 
  Rispondi SOLO a domande relative a [DOMINIO]. 
  Per argomenti fuori dal tuo ambito, rispondi: "Questo argomento non è nel mio dominio. 
  Rivolgiti al Billy principale."
  Hai accesso alle skill e ai documenti relativi a [DOMINIO].
  ```
- [ ] **Harness:** GitHub Copilot
- [ ] Aggiungere knowledge source: library SP filtrata per tag o per nome skill
- [ ] Aggiungere action LoadSkill (stesso flow, stessa configurazione)
- [ ] Pubblicare l'agente
- [ ] Annotare **Agent ID** (visibile nelle impostazioni): `__________________`

### 7.2 — Collegare il sotto-agente a Billy principale

- [ ] Aprire l'agente Billy principale
- [ ] Menu → **"Connections"** → **"Add connection"** → **"Agent"**
- [ ] Selezionare `Billy-[Dominio]`
- [ ] **Connection name:** `Billy-[Dominio]`
- [ ] Aggiornare le system instructions di Billy aggiungendo nella sezione SOTTO-AGENTI:
  ```
  ## SOTTO-AGENTI DISPONIBILI
  
  - Billy-SAC (agentId: [ID]): esperto di SAP Analytics Cloud e BI reporting.
    Delega a lui quando la domanda riguarda SAC, Stories, SAC Analytics Designer, 
    Live Data Connection, Planning, ecc.
  ```
- [ ] Salvare

### 7.3 — Aggiungere action RunSubAgent

> In Copilot Studio, i Connected Agents si invocano nativamente — non serve un'action Power Automate separata. La connessione configurata al 7.2 è sufficiente. L'agente principale decide da solo quando delegare in base alle istruzioni.

- [ ] Verificare nel pannello Test: `Puoi dirmi come creare una Story in SAC?`
  - Atteso: Billy principale riconosce il dominio SAC → delega a Billy-SAC → risposta da Billy-SAC

---

## FASE 8 — Testing manuale

### 8.1 — Checklist test funzionali

Per ogni test: aprire il pannello Test di Copilot Studio o la chat in Teams.

#### Test RAG e certification

- [ ] **T01** — Domanda su documento certificato: `Come si configura XSUAA in CAP?`
  - Atteso: risposta da Certified Documents, cita fonte certificata
- [ ] **T02** — Domanda su documento community: *(se esiste un documento community)*
  - Atteso: risposta con warning "fonte community non validata"
- [ ] **T03** — Domanda senza risposta: `Come si fa il caffe espresso perfetto?`
  - Atteso: "Non ho trovato risorse nel catalogo su questo argomento"

#### Test skill + LoadSkill

- [ ] **T04** — Domanda che attiva una skill: *(usare una delle 22 skill importate)*
  - Atteso: Billy cerca in Skill Index → trova skill → chiama LoadSkill → risponde con il contenuto
  - Verificare nei log Activity: deve apparire chiamata a LoadSkill con il SkillId corretto
- [ ] **T05** — Domanda vaga che potrebbe usare più skill: *(domanda generica del dominio)*
  - Atteso: Billy sceglie la skill più pertinente, non tutte

#### Test upload workflow

- [ ] **T06** — Upload asset via Power App: caricare una skill di test con Status="in-review"
  - Atteso: notifica approvazione in Teams al revisore
- [ ] **T07** — Approvare l'asset dalla notifica Teams
  - Atteso: Status → published, notifica di conferma all'owner
- [ ] **T08** — Verificare che la skill appena approvata sia visibile a Billy
  - Atteso: dopo pochi minuti (re-indexing SharePoint), Billy trova la nuova skill

#### Test sotto-agente (dopo Fase 7)

- [ ] **T09** — Delega a sotto-agente: domanda nel dominio specifico
  - Atteso: Billy principale delega → sotto-agente risponde → risposta coerente

### 8.2 — I 35 casi BTP (manuale)

Eseguire a mano i casi del benchmark `billy-app/test/run-35.js` che non dipendono da Python:

- [ ] Caso 1: `__________________` → Skill attesa: `__________________` → Billy ha usato skill: `[ ]`
- [ ] Caso 2: `__________________` → Skill attesa: `__________________` → Billy ha usato skill: `[ ]`
- [ ] *(compilare durante i test)*
- [ ] Conteggio finale: `____ / 35`
- [ ] Soglia accettazione: ≥ 28/35

### 8.3 — Verifica log Activity

Per ogni test da T04 in poi:
- [ ] Aprire "Activity" in Copilot Studio → trovare la conversazione di test
- [ ] Verificare che l'action LoadSkill appaia nella catena di reasoning
- [ ] Verificare che il `skillId` passato a LoadSkill corrisponda allo SkillId dello Skill Index
- [ ] Verificare che la risposta citi il contenuto effettivo della skill (non un'invenzione)

---

## FASE 9 — Distribuzione

### 9.1 — Pubblicare in Teams (uso personale, senza IT)

- [ ] In Copilot Studio → **"Publish"** → **"Publish"** (pubblica la versione corrente)
- [ ] Menu → **"Channels"** → **"Microsoft Teams"**
- [ ] Cliccare **"Turn on Teams"**
- [ ] Cliccare **"Open in Teams"** per aprire la chat con Billy
- [ ] Condividere il link con i colleghi per testing esteso (link diretto al bot)

### 9.2 — Pubblicare in M365 Copilot sidebar

- [ ] In Copilot Studio → **"Channels"** → **"Microsoft 365 Copilot"**
- [ ] Attivare il toggle
- [ ] Billy apparirà nella sidebar di Copilot come agente disponibile
- [ ] Verificare aprendo M365 Copilot (`microsoft365.com/copilot`) → sezione Agents

### 9.3 — Tab catalogo in Teams

- [ ] Aprire un team in Teams → **"+"** (aggiungi tab)
- [ ] Cercare "Power Apps" → selezionare `Billy Catalog`
- [ ] Configurare la tab con nome "Catalogo Billy"

### 9.4 — Distribuzione org-wide (richiede IT)

- [ ] Aprire ticket IT richiedendo: "Approvazione e distribuzione del bot Teams 'Billy' per tutti gli utenti della SAP Practice"
- [ ] Fornire: App ID del bot (visibile in Copilot Studio → Settings → Advanced)
- [ ] In attesa di approvazione: Bot accessibile solo via link diretto

---

## FASE 10 — MCP (applicazioni esterne)

> Da implementare quando si ha una prima applicazione esterna con endpoint MCP disponibile.

### 10.1 — Configurare MCP connector in Copilot Studio

- [ ] Aprire l'agente Billy → **"Actions"** → **"Add an action"** → **"Model Context Protocol (MCP)"**
- [ ] **Server URL:** `[URL endpoint MCP dell'applicazione esterna]`
- [ ] **Authentication:** *(dipende dall'app — API key, OAuth, ecc.)*
- [ ] Copilot Studio scopre automaticamente i tool esposti dall'endpoint MCP
- [ ] Aggiungere descrizione agli strumenti scoperti per guidare il modello
- [ ] Aggiornare system instructions con la lista dei tool MCP disponibili

---

## Variabili da annotare (riepilogo)

Tenere aggiornato questo riepilogo man mano che si completano i task:

```
# SharePoint
SHAREPOINT_SITE_URL=https://accenture.sharepoint.com/sites/BillyCatalog
SHAREPOINT_SITE_ID=
SKILL_INDEX_LIST_ID=
SKILL_CONTENT_LIST_ID=
CERTIFIED_DOCS_LIST_ID=
COMMUNITY_DOCS_LIST_ID=
AGENT_CONFIGS_LIST_ID=

# Entra ID (App Registration per script import)
TENANT_ID=
CLIENT_ID=
CLIENT_SECRET=

# Power Automate flow URLs
FLOW_LOADSKILL_URL=
FLOW_PUBLISH_ASSET_URL=

# Copilot Studio
COPILOT_STUDIO_AGENT_ID=
COPILOT_STUDIO_ENVIRONMENT_ID=

# Sub-agenti Connected
BILLY_SAC_AGENT_ID=
[altri sotto-agenti...]

# Export BTP
EXPORT_DATE=
SKILLS_COUNT=
DOCS_COUNT=
```

---

## Criteri go-live / spegnimento BTP

- [ ] Fase 0 completata (backup verificato)
- [ ] Fase 2 completata (agente risponde correttamente senza actions)
- [ ] Fase 4 completata (LoadSkill funziona su almeno 5 skill)
- [ ] Fase 5 completata (22 skill importate, documenti importati)
- [ ] Testing T01-T08 tutti verdi
- [ ] ≥ 28/35 casi benchmark manuali superati
- [ ] **Conferma esplicita dell'utente** → solo allora spegnere BTP

---

*Checklist creata novembre 2026. Aggiornare man mano che i task vengono completati.*
