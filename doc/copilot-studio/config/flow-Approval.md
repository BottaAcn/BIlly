# Guida: creare il flow "Billy - Asset Approval" in Power Automate

**URL**: `https://make.powerautomate.com`  
**Tempo stimato**: 30-45 minuti  
**Prerequisito**: library "Skill Index" già creata in SharePoint con le colonne `Status`, `Owner`, `AssetType`, `Description`, `CertificationLevel`, `ReviewedBy`, `ReviewNotes`

---

## Panoramica del flow

```
SharePoint item creato/modificato (Skill Index)
    ↓
Condition: Status = "in-review"?
    └─ YES →
        Start and wait for approval (Teams)
            ↓
        Condition: Approvato?
            ├─ YES → Update item (Status=published, ReviewedBy, ReviewNotes)
            │         → Notifica Teams all'owner: approvato ✅
            └─ NO  → Update item (Status=draft, ReviewNotes)
                      → Notifica Teams all'owner: rifiutato ❌
```

---

## Step 1 — Creare il flow

1. Aprire `https://make.powerautomate.com`
2. Cliccare **"+ Create"** → **"Automated cloud flow"**
3. **Flow name**: `Billy - Asset Approval`
4. Nel campo **"Choose your flow's trigger"** cercare: `SharePoint`
5. Selezionare **"When an item is created or modified"** (connettore SharePoint)
6. Cliccare **"Create"**

---

## Step 2 — Configurare il trigger SharePoint

1. Nel blocco trigger **"When an item is created or modified"**:
   - **Site Address**: `https://accenture.sharepoint.com/sites/BillyCatalog`
   - **List Name**: selezionare **"Skill Index"** dall'elenco
2. Il trigger si attiverà ogni volta che un item della lista viene creato o modificato

---

## Step 3 — Aggiungere Condition: Status = "in-review"

Non vogliamo che il flow si esegua per ogni modifica — solo quando lo Status passa a "in-review".

1. Cliccare **"+ New step"**
2. Cercare: `Condition` → selezionare **"Condition"** (Control)
3. Nel campo sinistro:
   - Cliccare il campo → **"Dynamic content"**
   - Cercare `Status` → selezionare **"Status"** (dall'output del trigger)
4. Campo centrale: selezionare **"is equal to"**
5. Campo destro: digitare esattamente `in-review`

---

## Step 4 — Ramo "Yes": avviare l'approvazione

Tutto quello che segue va aggiunto nel ramo **"If yes"**.

### Step 4a — Aggiungere "Start and wait for an approval"

1. Nel ramo **"If yes"** cliccare **"Add an action"**
2. Cercare: `Approval` → selezionare connettore **"Approvals"**
3. Selezionare azione **"Start and wait for an approval"**
4. Configurare:

   - **Approval type**: selezionare **"Approve/Reject - First to respond"**
   
   - **Title**:
     - Cliccare il campo → **"Dynamic content"**
     - Scrivere prima il testo: `Revisione asset Billy: `
     - Poi inserire dynamic content: **"Title"** (dal trigger)
     - Risultato nel campo: `Revisione asset Billy: @{triggerOutputs()?['body/Title']}`
   
   - **Assigned to**: inserire le email dei revisori senior separati da `;`
     - Esempio: `revisore1@accenture.com;revisore2@accenture.com`
     - [DA AGGIORNARE con le email reali dei revisori]
   
   - **Details**: cliccare il campo e inserire questo testo (misto statico + dynamic content):
     ```
     Tipo asset: [AssetType dal trigger]
     Livello certificazione richiesto: [CertificationLevel dal trigger]
     Caricato da: [Owner DisplayName dal trigger]
     
     Descrizione:
     [Description dal trigger]
     ```
     Per inserire i valori dynamic: posizionare il cursore nel punto giusto, cliccare **"Dynamic content"**, cercare e inserire il campo corrispondente.
   
   - **Item link**: 
     - Cliccare → Dynamic content → cercare `Link` → selezionare **"{Link}"** o **"Link to item"**
   
   - **Item link description**: `Apri in SharePoint`

---

### Step 4b — Condition: Approvato o Rifiutato?

1. Dopo il blocco Approval, cliccare **"Add an action"** nel ramo "If yes" (non creare un nuovo step al livello superiore)
2. Cercare: `Condition` → selezionare **"Condition"**
3. Campo sinistro:
   - Dynamic content → cercare `Outcome` → selezionare **"Outcome"** dall'output di "Start and wait for an approval"
4. Campo centrale: **"is equal to"**
5. Campo destro: `Approve`

---

### Step 4c — Ramo "Yes" (approvato): Update item

1. Nel sotto-ramo **"If yes"** cliccare **"Add an action"**
2. Cercare: `SharePoint` → **"Update item"**
3. Configurare:
   - **Site Address**: `https://accenture.sharepoint.com/sites/BillyCatalog`
   - **List Name**: `Skill Index`
   - **Id**: Dynamic content → **"ID"** (dall'output del trigger originale)
   - **Title**: Dynamic content → **"Title"** (obbligatorio, anche se non cambia)
   - **Status**: digitare `published`
   - **ReviewedBy**: Dynamic content → dall'output Approval → cercare **"Responder"** o **"Approver name"**
     > Se non trovi direttamente il nome: nell'output di Approval c'è un array `responses` — usa l'expression: `outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['responder']['displayName']`
   - **ReviewNotes**: Dynamic content → dall'output Approval → **"Comments"**
     > Expression: `outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['comments']`

---

### Step 4d — Ramo "Yes" (approvato): notifica Teams all'owner

1. Dopo Update item, cliccare **"Add an action"**
2. Cercare: `Teams` → selezionare connettore **"Microsoft Teams"**
3. Selezionare azione **"Post a message in a chat or channel"**
4. Configurare:
   - **Post as**: `Flow bot`
   - **Post in**: `Chat with Flow bot`
   - **Recipient**: Dynamic content → **"Owner Email"** dal trigger
     > Se non è disponibile direttamente, usare: `triggerOutputs()?['body/Author/Email']`
   - **Message**: inserire il testo seguente (con dynamic content dove indicato):
     ```
     ✅ Il tuo asset è stato approvato e pubblicato nel catalogo Billy.
     
     **Titolo**: [Title dal trigger]
     **Tipo**: [AssetType dal trigger]
     **Livello**: [CertificationLevel dal trigger]
     
     Note del revisore: [Comments dall'output Approval]
     
     Grazie per il contributo al catalogo!
     ```

---

### Step 4e — Ramo "No" (rifiutato): Update item

1. Nel sotto-ramo **"If no"** cliccare **"Add an action"**
2. Cercare: `SharePoint` → **"Update item"**
3. Configurare:
   - **Site Address**: `https://accenture.sharepoint.com/sites/BillyCatalog`
   - **List Name**: `Skill Index`
   - **Id**: Dynamic content → **"ID"** (dal trigger originale)
   - **Title**: Dynamic content → **"Title"**
   - **Status**: digitare `draft`
   - **ReviewNotes**: Expression: `outputs('Start_and_wait_for_an_approval')?['body/responses'][0]['comments']`

---

### Step 4f — Ramo "No" (rifiutato): notifica Teams all'owner

1. Dopo Update item, cliccare **"Add an action"**
2. Teams → **"Post a message in a chat or channel"**
3. Configurare:
   - **Post as**: `Flow bot`
   - **Post in**: `Chat with Flow bot`
   - **Recipient**: `triggerOutputs()?['body/Author/Email']`
   - **Message**:
     ```
     ❌ Il tuo asset non è stato approvato.
     
     **Titolo**: [Title dal trigger]
     
     Motivo: [Comments dall'output Approval]
     
     Puoi modificare l'asset e reinviarlo per revisione cambiando lo Status in "in-review".
     ```

---

## Step 5 — Salvare e attivare

1. Cliccare **"Save"** (Ctrl+S)
2. Verificare che non ci siano errori (icone rosse)
3. Se il flow è salvato correttamente, lo stato è "On" per default (flow automatici partono attivi)
4. Cliccare **"Test"** → **"Manually"** → **"Test"** per fare un test immediato

---

## Step 6 — Test del flow

1. Aprire la library "Skill Index" in SharePoint
2. Creare un nuovo item di test: Title = "Test Skill", Status = "in-review", compilare gli altri campi
3. Tornare in Power Automate → il flow deve attivarsi entro 1-2 minuti
4. Verificare nella sezione "Run history" che il flow sia partito
5. Il revisore deve ricevere una notifica di approvazione in Teams
6. Approvare dalla notifica Teams
7. Tornare in SharePoint → verificare che lo Status sia cambiato a "published"
8. L'owner deve ricevere notifica di conferma in Teams

---

## Replicare per le altre library

Questo flow è configurato per "Skill Index". Replicarlo per:
- **"Certified Documents"**: duplicare il flow (··· → Save As → `Billy - Asset Approval - Certified Docs`) e cambiare solo il List Name nel trigger
- **"Community Documents"**: duplicare e cambiare List Name → `Billy - Asset Approval - Community Docs`

---

## Troubleshooting comune

| Problema | Soluzione |
|---|---|
| Flow non si attiva quando cambio Status | Verificare che il trigger sia "When an item is **created or modified**", non solo "created" |
| Approver non riceve notifica Teams | Il connettore Approvals richiede che l'approver abbia una licenza M365 — verificare |
| "Owner Email" non disponibile come dynamic content | Usare l'expression: `triggerOutputs()?['body/Author/Email']` |
| Comments vuoto nell'output Approval | L'approver non ha inserito note — gestire con: `coalesce(outputs('...')?['body/responses'][0]['comments'], 'Nessuna nota')` |
| Flow in errore su Update item | Verificare che i nomi colonna nel flow corrispondano esattamente a quelli in SharePoint (case sensitive) |
