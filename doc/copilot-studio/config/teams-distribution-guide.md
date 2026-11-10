# Guida: distribuire Billy in Teams e M365

---

## 1. Teams — chat personale (senza IT, disponibile subito)

Questo metodo rende Billy accessibile a te e a chiunque tu condivida il link.

### Pubblicare l'agente

1. Aprire `https://copilotstudio.microsoft.com`
2. Selezionare l'agente **Billy**
3. Cliccare **"Publish"** in alto a destra
4. Nella finestra di conferma cliccare **"Publish"** (pubblica la versione corrente)
5. Attendere il messaggio "Your agent has been published"

### Abilitare il canale Teams

1. Nel menu sinistro dell'agente, cliccare **"Channels"**
2. Trovare il tile **"Microsoft Teams"**
3. Cliccare **"Turn on Teams"**
4. Nella finestra che si apre, cliccare **"Open in Teams"**
5. Teams si apre con Billy come bot — cliccare **"Add"** per aggiungerlo

### Condividere con colleghi

1. In Copilot Studio → Channels → Microsoft Teams
2. Cliccare **"Copy link"** — il link ha la forma:
   `https://teams.microsoft.com/l/chat/0/0?users=28:xxxx-xxxx`
3. Inviare questo link ai colleghi via Teams o email
4. Chi riceve il link lo apre e clicca "Add" per aggiungere Billy

---

## 2. M365 Copilot sidebar (senza IT, disponibile subito)

Billy apparirà nel pannello laterale di M365 Copilot come agente disponibile.

### Abilitare il canale

1. In Copilot Studio → Channels
2. Trovare il tile **"Microsoft 365 Copilot"**
3. Cliccare il toggle per attivarlo
4. Attendere 5-10 minuti per la propagazione

### Verificare

1. Aprire `https://microsoft365.com/copilot` (oppure aprire M365 Copilot in Teams)
2. Nella sidebar destra o in fondo alla chat, cercare la sezione **"Agents"** o **"Copilot agents"**
3. Billy deve apparire come agente disponibile
4. Cliccandolo si apre la chat con Billy direttamente in Copilot

> Se Billy non appare entro 30 minuti, verificare che l'account Accenture abbia la licenza M365 Copilot attiva: `https://admin.microsoft.com` → Users → [tuo account] → Licenses.

---

## 3. Teams tab — Power App catalogo

Questo rende la Power App "Billy Catalog" accessibile come tab in un team specifico.

### Prerequisito

La Power App "Billy Catalog" deve essere pubblicata (Fase 6 della checklist).

### Aggiungere la tab a un team

1. Aprire Microsoft Teams
2. Navigare nel team in cui vuoi aggiungere la tab (es. "SAP Practice Italia")
3. Cliccare sul canale dove aggiungere la tab (es. "Generale")
4. Cliccare il pulsante **"+"** vicino ai nomi delle tab esistenti
5. Nella finestra "Add a tab":
   - Cercare **"Power Apps"**
   - Selezionare il connettore **"Power Apps"**
   - Cliccare **"Add"**
6. Nella schermata successiva:
   - Selezionare **"Billy Catalog"** dall'elenco delle app disponibili
   - Cliccare **"Save"**
7. La tab "Billy Catalog" appare nel canale
8. Rinominare la tab se necessario: tasto destro sulla tab → "Rename" → `Catalogo Billy`

---

## 4. Teams — distribuzione org-wide (richiede IT)

Per rendere Billy disponibile a tutti gli utenti Accenture senza che ognuno debba aggiungere manualmente il bot, è necessario richiedere all'IT la pubblicazione dell'app nel Teams App Store aziendale.

### Informazioni necessarie prima di aprire il ticket

Raccogliere questi dati da Copilot Studio:

1. **App ID del bot**:
   - Copilot Studio → Settings → Advanced
   - Copiare il valore **"App ID"**: `xxxx-xxxx-xxxx-xxxx`
   
2. **App Manifest** (file zip da allegare al ticket):
   - Copilot Studio → Channels → Microsoft Teams → "Download manifest"
   - Salvare il file `.zip` scaricato

### Template ticket/email per IT

```
A: [email IT helpdesk o Teams Admin Accenture]
Oggetto: Richiesta pubblicazione bot Teams - Billy Knowledge Agent

Buongiorno,

chiedo la pubblicazione di un agente AI nel Microsoft Teams App Store aziendale
per la SAP Practice Italia.

Dettagli dell'agente:
- Nome: Billy - SAP Practice Knowledge Agent
- Descrizione: Agente AI per trovare documenti, procedure e skill certificate della SAP Practice Accenture
- App ID: [inserire App ID da Copilot Studio]
- Manifest allegato: [allegare file .zip scaricato da Copilot Studio]
- Scope: distribuzione alla SAP Practice Italia (oppure: tutto il tenant Accenture)

L'agente è stato sviluppato su Microsoft Copilot Studio con account Accenture,
è già testato e pubblicato in uso personale.

Per la pubblicazione org-wide è necessaria:
1. La revisione e approvazione del manifest nell'admin center Teams
2. La pubblicazione nella sezione "Built for your org" del Teams App Store

Referente tecnico: [tuo nome] - [tuo email]
Grazie
```

### Cosa succede dopo la richiesta

1. L'admin IT apre `https://admin.teams.microsoft.com`
2. Va su **Teams apps → Manage apps**
3. Carica il manifest zip tramite **"Upload new app"**
4. Imposta la policy di distribuzione (es. "Pinned for specific users/groups" o "Available for all")
5. L'app appare nella sezione **"Built for your org"** del Teams App Store per tutti gli utenti nel scope

### Stima tempi

- Approvazione ticket IT: 2-5 giorni lavorativi
- Propagazione dopo approvazione: 24-48 ore

---

## Riepilogo canali e requisiti

| Canale | Richiede IT | Tempo setup | Visibile a |
|---|---|---|---|
| Teams chat (link diretto) | No | 5 min | Chi riceve il link |
| M365 Copilot sidebar | No | 10 min | Solo il creator (e chi viene invitato) |
| Teams tab (Power App) | No | 10 min | Membri del team |
| Teams App Store org-wide | Sì | 3-7 gg | Tutti gli utenti nel tenant |
