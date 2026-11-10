# Guida: creare il flow "Billy - LoadSkill" in Power Automate

**URL**: `https://make.powerautomate.com`  
**Tempo stimato**: 20-30 minuti  
**Prerequisito**: library "Skill Content" già creata in SharePoint con le colonne `SkillId` e `Content`

---

## Panoramica del flow

```
HTTP Request (trigger)
    ↓
Get items da SharePoint (Skill Content, filtro su SkillId)
    ↓
Condition: trovati risultati?
    ├─ YES → Response 200 con content della skill
    └─ NO  → Response 404 con errore
```

---

## Step 1 — Creare il flow

1. Aprire `https://make.powerautomate.com`
2. Verificare in alto a destra di essere nell'environment corretto (stesso di Copilot Studio)
3. Cliccare **"+ Create"** nel menu laterale sinistro
4. Cliccare **"Instant cloud flow"**
5. Nel campo **"Flow name"** inserire esattamente: `Billy - LoadSkill`
6. Nella sezione **"Choose how to trigger this flow"** cercare: `HTTP`
7. Selezionare **"When a HTTP request is received"** (connettore: Request)
8. Cliccare **"Create"**

---

## Step 2 — Configurare il trigger HTTP

Dopo la creazione, il designer si apre con il blocco trigger già presente.

1. Cliccare sul blocco **"When a HTTP request is received"** per espanderlo
2. Cliccare su **"Use sample payload to generate schema"**
3. Nella finestra che si apre, incollare questo JSON esatto:
   ```json
   {
     "skillId": "btp-42"
   }
   ```
4. Cliccare **"Done"**
5. Il campo **"Request Body JSON Schema"** si compila automaticamente con:
   ```json
   {
     "type": "object",
     "properties": {
       "skillId": {
         "type": "string"
       }
     }
   }
   ```
6. Nel campo **"Method"** selezionare **"POST"**
7. Lasciare vuoto il campo "Relative path"
8. L'URL HTTP POST verrà generato dopo il primo salvataggio — annotarlo alla fine

---

## Step 3 — Aggiungere "Get items" da SharePoint

1. Sotto il trigger, cliccare **"+ New step"**
2. Nel campo di ricerca digitare: `SharePoint`
3. Selezionare il connettore **"SharePoint"**
4. Nella lista di azioni selezionare **"Get items"**
5. Configurare i campi:

   - **Site Address**: cliccare il campo e selezionare il sito Billy Catalog dall'elenco, oppure digitare manualmente: `https://accenture.sharepoint.com/sites/BillyCatalog`
   - **List Name**: cliccare il campo → selezionare **"Skill Content"** dall'elenco (se non appare subito, cliccare "Enter custom value" e digitare `Skill Content`)
   
6. Cliccare **"Show advanced options"** (link blu sotto i campi principali)
7. Nel campo **"Filter Query"** inserire questa espressione esatta:
   ```
   SkillId eq '@{triggerBody()?['skillId']}'
   ```
   > Attenzione: le virgolette singole attorno all'espressione dynamic content fanno parte del filtro OData e sono obbligatorie.
   
8. Nel campo **"Top Count"** inserire: `1`
9. Lasciare tutti gli altri campi come sono

---

## Step 4 — Aggiungere la Condition

1. Cliccare **"+ New step"**
2. Cerca: `Condition`
3. Selezionare **"Condition"** (connettore Control)
4. Nel campo sinistro della condizione, cliccare e poi cliccare **"Expression"**
5. Nel campo expression inserire:
   ```
   length(outputs('Get_items')?['body/value'])
   ```
6. Cliccare **"OK"**
7. Nel campo centrale selezionare **"is greater than"**
8. Nel campo destro inserire il numero: `0`

   > Il nome esatto dell'espressione (`Get_items`) dipende dal nome che Power Automate ha assegnato allo step precedente. Se hai rinominato lo step "Get items", usa quel nome senza spazi e con underscore. Per verificare il nome: clicca sui tre puntini (···) sullo step Get items → "Rename" → annota il nome assegnato.

---

## Step 5 — Ramo "Yes" (skill trovata): aggiungere Response 200

1. Nel ramo **"If yes"** cliccare **"Add an action"**
2. Cerca: `Response`
3. Selezionare **"Response"** (connettore Request)
4. Configurare i campi:

   - **Status Code**: `200`
   
   - **Headers**: cliccare **"Add new header"**
     - Header name: `Content-Type`
     - Value: `application/json`
   
   - **Body**: cliccare il campo e inserire questo JSON esatto. Ogni valore tra `@{...}` è una espressione dynamic content:
   
   ```json
   {
     "found": true,
     "title": "@{first(outputs('Get_items')?['body/value'])?['Title']}",
     "content": "@{first(outputs('Get_items')?['body/value'])?['Content']}",
     "certificationLevel": "@{first(outputs('Get_items')?['body/value'])?['CertificationLevel']}",
     "version": @{first(outputs('Get_items')?['body/value'])?['Version']},
     "lastModified": "@{first(outputs('Get_items')?['body/value'])?['Modified']}"
   }
   ```
   
   > Nota: `version` non ha virgolette perché è un numero. Se Power Automate dà errore di parsing, avvolgi anche quello in virgolette: `"version": "@{...}"`.
   
5. Cliccare **"Show advanced options"**
6. Nel campo **"Response Body JSON Schema"** inserire:
   ```json
   {
     "type": "object",
     "properties": {
       "found": { "type": "boolean" },
       "title": { "type": "string" },
       "content": { "type": "string" },
       "certificationLevel": { "type": "string" },
       "version": { "type": "number" },
       "lastModified": { "type": "string" }
     }
   }
   ```

---

## Step 6 — Ramo "No" (skill non trovata): aggiungere Response 404

1. Nel ramo **"If no"** cliccare **"Add an action"**
2. Cerca: `Response`
3. Selezionare **"Response"** (connettore Request)
4. Configurare:
   - **Status Code**: `404`
   - **Headers**: `Content-Type: application/json`
   - **Body**:
   ```json
   {
     "found": false,
     "error": "Skill non trovata con SkillId: @{triggerBody()?['skillId']}"
   }
   ```

---

## Step 7 — Salvare e attivare il flow

1. Cliccare **"Save"** in alto a destra (o Ctrl+S)
2. Verificare che non ci siano errori (indicati da icone rosse sui blocchi)
3. Se il flow è salvato correttamente, tornare al blocco trigger **"When a HTTP request is received"**
4. L'**HTTP POST URL** è ora visibile sotto il campo Method — copiarlo e salvarlo nel file `.env` e nella checklist:
   ```
   FLOW_LOADSKILL_URL=https://prod-XX.XX.logic.azure.com:443/workflows/...
   ```
5. Cliccare **"Turn on"** (se il flow è in stato "Off")

---

## Step 8 — Testare il flow

1. Aprire un terminale (o Postman, o qualsiasi client HTTP)
2. Fare una richiesta POST all'URL del flow:
   ```bash
   curl -X POST "https://prod-XX.logic.azure.com:443/workflows/..." \
     -H "Content-Type: application/json" \
     -d "{\"skillId\": \"btp-1\"}"
   ```
3. Se la skill con SkillId `btp-1` esiste in SharePoint "Skill Content", la risposta deve essere:
   ```json
   {
     "found": true,
     "title": "Nome della skill",
     "content": "Corpo completo...",
     "certificationLevel": "certified",
     "version": 1,
     "lastModified": "2026-09-28T..."
   }
   ```
4. Con uno SkillId inesistente (es. `btp-99999`), la risposta deve essere:
   ```json
   {
     "found": false,
     "error": "Skill non trovata con SkillId: btp-99999"
   }
   ```

---

## Troubleshooting comune

| Problema | Cosa controllare |
|---|---|
| Errore "Connection not authorized" su SharePoint | Cliccare sul blocco Get items → connessione SharePoint → ri-autenticarsi con account Accenture |
| Filter query non funziona (ritorna 0 risultati) | Verificare che il nome colonna in SharePoint sia esattamente `SkillId` (case sensitive) |
| Body della Response ha caratteri di escape errati | Usare il campo "Expression" invece di scrivere il JSON direttamente nel campo Body |
| Il flow non appare in Copilot Studio | Verificare che sia nello stesso Environment; il flow deve essere attivo ("On") |
| URL trigger non visibile | Salvare il flow almeno una volta — l'URL viene generato al primo salvataggio |
