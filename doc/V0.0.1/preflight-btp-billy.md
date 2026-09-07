# Pre-flight check — Marketplace "Billy" su SAP BTP

Guida di verifica da eseguire **prima** di scrivere una riga di codice. Obiettivo: capire in mezza giornata se il tuo global account e subaccount sono pronti, cosa manca, e chi devi andare a cercare per sbloccarlo.

Ogni sezione ha la stessa struttura: **cosa verifichi → dove → come → se manca → riferimento**.

Alla fine c'è una tabella Go/No-Go da compilare.

---

## Legenda dei livelli

Prima di partire, tieni presente la gerarchia BTP, perché metà della confusione sui permessi nasce da qui:

```
Global Account          ← contratto commerciale, entitlement disponibili, T&C
   └── Directory        ← raggruppamento opzionale
        └── Subaccount  ← qui si ASSEGNANO le quote, si creano istanze, si vive
             └── Cloud Foundry Org
                  └── Space   ← qui girano le app
```

Regola d'oro: **gli entitlement esistono a livello di global account, ma vanno assegnati al subaccount**. Il 90% dei "non trovo il servizio nel Service Marketplace" è questo.

---

# PARTE 0 — I tuoi ruoli

Questa è la prima cosa da verificare, perché se non hai i permessi tutto il resto è teoria.

## 0.1 — I tuoi ruoli a livello di global account

**Cosa verifichi:** se puoi vedere e modificare gli entitlement.

**Dove:** BTP Cockpit → il tuo global account → `Security` → `Users` → cerca il tuo utente → sezione `Role Collections`.

**Cosa vuoi trovare:** `Global Account Administrator`.

- `Global Account Administrator` ti permette di fare amministrazione di subaccount, role collection, identity provider, entitlement e region a livello di global account.
- `Global Account Viewer` ti dà solo lettura. Con questo puoi fare il check ma non puoi sistemare nulla.

**Se manca:** ti serve qualcuno che ce l'ha. Nota però una cosa utile: chi ha `Global Account Administrator` può usare l'opzione **"Add Me as Admin"** su un subaccount per darsi accesso amministrativo a quel subaccount. Quindi la richiesta minima da fare al tuo admin è: "dammi Subaccount Administrator sul subaccount X", che è molto più facile da ottenere del ruolo globale.

**Riferimento:** [Role Collections and Roles in Global Accounts, Directories, and Subaccounts](https://help.sap.com/docs/btp/sap-business-technology-platform/role-collections-and-roles-in-global-accounts-directories-and-subaccounts)

## 0.2 — I tuoi ruoli a livello di subaccount

**Cosa verifichi:** se puoi creare istanze di servizio, destination e role collection.

**Dove:** BTP Cockpit → subaccount → `Security` → `Users` → tuo utente.

**Cosa vuoi trovare:** `Subaccount Administrator`.

**Perché conta:** senza questo non crei istanze di servizio, non configuri destination, non assegni role collection. È il ruolo minimo per lavorare.

## 0.3 — I tuoi ruoli Cloud Foundry

**Cosa verifichi:** se puoi deployare.

**Dove:** BTP Cockpit → subaccount → `Cloud Foundry` → `Spaces` → il tuo space → `Members`.

**Cosa vuoi trovare:** `Space Developer` come minimo. Meglio `Space Manager`.

**Attenzione, questo è un friction point reale:** per creare istanze di servizio serve **Space Manager oppure Org Manager**; il ruolo `Space Developer` standard non è sufficiente. Se hai solo Space Developer riuscirai a fare `cf push` ma non a creare l'istanza di AI Core.

I ruoli sono distinti:
- **Org Manager** → gestisce l'organizzazione, può creare space e aggiungere membri (aggiungendo un membro a uno space lo aggiunge automaticamente anche all'org)
- **Space Manager** → gestisce i membri di quello space
- **Space Developer** → deploya e gestisce app e servizi nello space

**Riferimento:** [Creating New Space Members and Assigning Space Developer Roles](https://help.sap.com/docs/btp/sap-business-technology-platform/creating-new-space-members-and-assigning-space-developer-roles-to-them)

## 0.4 — Il tuo utente: S-user o utente IdP?

**Cosa verifichi:** con quale identità stai lavorando.

**Dove:** in alto a destra nel Cockpit, o in `Security → Users` guarda la colonna `Identity Provider`.

**Perché conta:** i ruoli a livello di global account tipicamente vanno su S-user autenticati contro SAP ID Service. Se la tua azienda ha federato un IdP corporate (IAS/Entra ID), potresti avere due identità distinte e assegnare il ruolo a quella sbagliata. Se assegni una role collection e "non funziona", controlla sempre di averla assegnata all'identità con cui fai effettivamente login.

## ✅ Checklist Parte 0

- [ ] So se sono Global Account Administrator o Viewer
- [ ] Sono Subaccount Administrator sul subaccount target
- [ ] Sono Space Manager (non solo Space Developer) su almeno uno space
- [ ] So con quale identity provider faccio login

---

# PARTE 1 — Global account: commerciale e prerequisiti legali

## 1.1 — Tipo di contratto

**Cosa verifichi:** se hai un modello commerciale che ti permette di consumare servizi a pagamento.

**Dove:** BTP Cockpit → global account → pagina di overview, oppure `Usage`.

**Cosa vuoi sapere:** stai su **BTPEA (Enterprise Agreement)**, **CPEA/Pay-As-You-Go**, o **Trial**?

**Perché conta molto:** il Generative AI Hub è a consumo su token. Se sei su un contratto Trial non ci vai in produzione. Se sei su free tier ci sperimenti ma con limiti su modelli e quote.

**Distinzione importante da tenere a mente:** il **trial** è solo per test (90 giorni, app che si fermano ogni notte per pulizia e vanno riavviate a mano). Il **free tier** invece è un account produttivo senza limiti di tempo, con un percorso di upgrade ai piani a pagamento che ti fa mantenere il lavoro già fatto. Per un progetto come il tuo: free tier per la fase 1, mai trial.

**Riferimento:** [Trial Accounts and Free Tier](https://help.sap.com/docs/btp/sap-business-technology-platform/trial-accounts-and-free-tier) · [SAP BTP Free Trial](https://www.sap.com/products/technology-platform/trial.html)

## 1.2 — Accettazione dei Termini AI

**Cosa verifichi:** se i T&C per i servizi AI sono stati accettati a livello di global account.

**Dove:** di solito compare come banner o step obbligatorio quando provi ad aggiungere l'entitlement di AI Core. Alcune organizzazioni lo bloccano centralmente.

**Se manca:** non è un problema tecnico, è un giro con legal/procurement. **Fallo partire adesso**, perché è la cosa con il lead time più lungo di tutta questa lista e non dipende da te.

## 1.3 — Entitlement disponibili nel global account

**Cosa verifichi:** cosa hai comprato / cosa è disponibile da assegnare.

**Dove:** BTP Cockpit → global account → `Entitlements` → `Service Assignments`. Qui vedi il totale disponibile e quanto è già assegnato ai vari subaccount.

**Cosa cerchi (lista completa per questo progetto):**

| Servizio | Piano | A cosa serve | Criticità |
|---|---|---|---|
| SAP AI Core | **extended** | LLM + Generative AI Hub | 🔴 Bloccante |
| SAP AI Launchpad | standard | UI per gestire modelli, grounding, prompt | 🔴 Bloccante |
| SAP HANA Cloud | hana | DB + vector engine | 🔴 Bloccante |
| SAP HANA Schemas & HDI Containers | hdi-shared | schema per CAP | 🔴 Bloccante |
| Cloud Foundry Runtime | standard | far girare l'app | 🔴 Bloccante |
| Authorization and Trust Management (XSUAA) | application / broker | auth | 🔴 Bloccante |
| Destination | lite | connessione CAP → AI Core | 🔴 Bloccante |
| HTML5 Application Repository | app-host, app-runtime | hosting frontend | 🟡 Fase 2 |
| SAP Build Work Zone, standard edition | standard | runtime per HTML5 repo | 🟡 Fase 2 |
| Object Store | standard | file upload | 🟡 Fase 3 |
| Malware Scanning | clamav / standard | scan degli upload | 🟡 Fase 3 |
| SAP Business Application Studio | standard-edition | IDE cloud | 🟢 Opzionale |
| Cloud Logging (o Application Logging) | standard | log | 🟢 Consigliato |
| Continuous Integration & Delivery | default | CI/CD | 🟢 Opzionale |

> **Il piano `extended` di AI Core non è negoziabile.** Il Generative AI Hub è disponibile in SAP AI Core esclusivamente con l'extended service plan. Se nel tuo global account c'è solo il piano `standard`, sei bloccato: serve un giro commerciale.

**Riferimento:** [SAP AI Core Service Plans](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/service-plans)

## ✅ Checklist Parte 1

- [ ] So il tipo di contratto (BTPEA / CPEA / free tier / trial)
- [ ] I T&C AI sono accettati (o ho aperto la richiesta)
- [ ] AI Core **extended** è disponibile nel global account
- [ ] AI Launchpad è disponibile
- [ ] HANA Cloud + HDI Containers disponibili
- [ ] Ho annotato quali dei 🟡 e 🟢 mancano

---

# PARTE 2 — Subaccount: regione, entitlement, quote

## 2.1 — Regione (fallo subito, è irreversibile)

**Cosa verifichi:** in quale region e su quale hyperscaler sta il subaccount.

**Dove:** BTP Cockpit → subaccount → overview, campo `Region` (es. `eu10 (AWS - Europe/Frankfurt)`).

**Perché è il check più importante di tutta la guida:** la disponibilità dei modelli attraverso il Generative AI Hub non è uniforme tra le region BTP. Le region US East, EU West e AP hanno la copertura più ampia. Se configuri AI Core in una region non supportata l'istanza si crea normalmente ma alcuni modelli **semplicemente non appaiono** nell'Hub — non compaiono come "non disponibili", non ci sono. È un fallimento silenzioso.

**Come verifichi davvero:** non fidarti dei blog, controlla la **SAP Note 3437766** (`https://me.sap.com/notes/3437766`), che è la fonte di verità per modelli disponibili, versioni supportate, conversion rate dei token, rate limit e date di retirement. **Iscriviti alla nota** (icona stella) per ricevere le notifiche automatiche sui cambiamenti.

**Se la region è sbagliata:** non si sposta un subaccount. Ne crei uno nuovo nella region giusta. Meglio scoprirlo ora che alla fase 3.

## 2.2 — Entitlement assegnati al subaccount

**Cosa verifichi:** che gli entitlement del punto 1.3 siano effettivamente **assegnati a questo subaccount**, non solo disponibili nel global account.

**Dove:** BTP Cockpit → subaccount → `Entitlements` → `Service Assignments`.

**Come si aggiungono:** global account → `Entitlements` → `Entity Assignments` → seleziona il subaccount → `Configure Entitlements` → `Add Service Plans`.

**L'errore di entitlement più comune:** aggiungere SAP AI Core ma **non** SAP AI Launchpad. AI Core è il servizio runtime, AI Launchpad è la UI che ti dà accesso al prompt editor e al catalogo modelli del Generative AI Hub. Senza AI Launchpad puoi fare chiamate API ma non hai interfaccia visuale per sperimentare. Aggiungi entrambi.

## 2.3 — Quote

**Cosa verifichi:** che la quota assegnata non sia zero.

**Dove:** stessa schermata di sopra, colonna della quantità.

**Friction point documentato:** la **quota di default per AI Core è zero** e va impostata esplicitamente. Devi metterla ad almeno 1 unità sul piano extended perché la creazione dell'istanza sia possibile.

Valori di partenza sensati:
- AI Core extended: 1
- HANA Cloud: 1
- HDI Containers: 1 (poi cresce con gli space)
- Cloud Foundry Runtime: almeno 3-4 unità (CAP srv + approuter + margine)
- XSUAA: 1
- Destination: 1

## 2.4 — Subscription attive

**Cosa verifichi:** quali applicazioni SaaS sono già sottoscritte.

**Dove:** subaccount → `Services` → `Instances and Subscriptions`, filtro su `Subscriptions`.

**Cosa cerchi:** SAP AI Launchpad, SAP Business Application Studio, SAP Build Work Zone standard edition.

**Se non ci sono:** `Service Marketplace` → cerca il servizio → `Create` → scegli il piano di subscription. Richiede l'entitlement già assegnato.

## ✅ Checklist Parte 2

- [ ] Regione annotata: ______________
- [ ] Ho verificato la disponibilità dei modelli che mi servono nella SAP Note 3437766 per la mia region
- [ ] Sono iscritto alla SAP Note 3437766
- [ ] AI Core extended assegnato al subaccount con quota ≥ 1
- [ ] AI Launchpad assegnato e **sottoscritto**
- [ ] HANA Cloud + HDI assegnati
- [ ] CF Runtime con quota sufficiente

---

# PARTE 3 — Cloud Foundry

## 3.1 — Ambiente CF abilitato

**Dove:** subaccount → `Cloud Foundry` → deve esistere un'organizzazione.

**Se manca:** `Enable Cloud Foundry`. Ti chiede nome org e istanza.

## 3.2 — Space

**Dove:** subaccount → `Cloud Foundry` → `Spaces`.

**Cosa vuoi:** almeno uno space (chiamalo `dev`). Se prevedi un percorso verso la produzione, crea già `dev` e `prod` separati: rifarlo dopo significa rifare destination, service instance e role collection.

## 3.3 — Endpoint API

**Cosa verifichi:** l'API endpoint per il `cf login`.

**Dove:** subaccount → overview → `Cloud Foundry Environment` → campo `API Endpoint`. Formato tipo `https://api.cf.eu10-004.hana.ondemand.com`.

**Annotalo**, ti serve subito nella Parte 8.

## ✅ Checklist Parte 3

- [ ] CF abilitato, org esistente
- [ ] Almeno uno space, io sono Space Manager
- [ ] API endpoint annotato: ______________

---

# PARTE 4 — SAP AI Core: la parte dove ci si incarta

Questa è la sezione con più trappole. Segui l'ordine.

## 4.1 — Istanza di AI Core

**Cosa verifichi:** se esiste già un'istanza, e con quale piano.

**Dove:** subaccount → `Services` → `Instances and Subscriptions` → filtro `Instances` → cerca `aicore`.

**Se esiste:** controlla che il piano sia `extended`. Se è `standard`, va aggiornato (`Update` sull'istanza), non basta crearne un'altra.

**Se non esiste:** `Service Marketplace` → `SAP AI Core` → piano `extended` → `Create`.

Durante la creazione ti viene proposto un parametro di configurazione JSON. Per l'accesso standard al Generative AI Hub la configurazione di default è sufficiente, ma **non lasciarla vuota**: alcune feature di accesso ai modelli richiedono che la configurazione sia presente anche se valorizzata con i default.

**Riferimento:** [Create a Service Instance](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/create-a-service-instance) · [Initial Setup](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/initial-setup)

## 4.2 — Service key

**Cosa verifichi:** se esiste una service key e se ne hai accesso.

**Dove:** click sull'istanza → `Service Keys`.

**Se non esiste:** `Create` → dai un nome → `Create`.

**I 4 valori che ti servono** e che devi salvare in un posto sicuro:

```json
{
  "clientid": "...",
  "clientsecret": "...",
  "url": "https://<tenant>.authentication.<region>.hana.ondemand.com",
  "serviceurls": {
    "AI_API_URL": "https://api.ai.<...>.hana.ondemand.com"
  }
}
```

**Da sapere prima di scrivere codice:** AI Core usa **OAuth 2.0 client credentials flow**, non una semplice API key. L'applicazione deve prima chiamare il token endpoint con clientid e clientsecret per ottenere un bearer token, poi includerlo in ogni chiamata. I token scadono e vanno rinnovati. Molti team si aspettano un pattern ad API key e restano sorpresi. Se usi l'SDK ufficiale, questo lo gestisce lui.

**Nota di governance da tenere presente per il futuro:** una service key standard di AI Core dà al possessore tutti gli scope dell'API, cioè accesso amministrativo completo al tenant. Creare una key "Team A" e una "Team B" dà l'apparenza della separazione senza nessuna enforcement. Se domani questa piattaforma diventa multi-team, la risposta corretta è il modello Content-as-a-Service (subaccount provider che pubblica un service broker, subaccount consumer con credenziali a scope ridotto e resource group condiviso). Non ti serve ora, ma sappi che esiste. [Approfondimento](https://thesapguide.com/blog/generative-ai-hub-governance-sap-btp/)

## 4.3 — Resource group

**Cosa verifichi:** che esista almeno un resource group.

**Il friction point che ferma più team:** la configurazione del resource group si fa **tramite AI Core API, non dal BTP Cockpit**. E i modelli **non sono visibili nell'Hub finché non esiste un resource group**, anche se AI Core e AI Launchpad sono configurati correttamente. Quindi il sintomo classico ("ho fatto tutto ma il catalogo modelli è vuoto") ha quasi sempre questa causa.

**Come verifichi cosa hai già:**

```bash
# 1. Ottieni il token
TOKEN=$(curl -s -X POST "<url>/oauth/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=<clientid>' \
  -d 'client_secret=<clientsecret>' | jq -r .access_token)

# 2. Lista i resource group esistenti
curl -s "<AI_API_URL>/v2/admin/resourceGroups" \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Se non ce n'è nessuno, creane uno:**

```bash
curl -X POST "<AI_API_URL>/v2/admin/resourceGroups" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"resourceGroupId": "default"}'
```

**Se vuoi anche il Document Grounding** (per `help.sap.com`), il resource group deve avere la label giusta. Un resource group custom deve avere la label `document-grounding: true` per poter usare il document grounding service; si imposta da AI Launchpad in fase di creazione, oppure via AI API.

```bash
curl -X POST "<AI_API_URL>/v2/admin/resourceGroups" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "resourceGroupId": "billy",
    "labels": [
      {"key": "ext.ai.sap.com/document-grounding", "value": "true"}
    ]
  }'
```

> Verifica la sintassi esatta della label nella doc corrente, perché il prefisso del namespace è cambiato tra le versioni: [Create a Resource Group for AI Data Management](https://help.sap.com/docs/sap-ai-core/generative-ai/create-resource-group-for-grounding)

**Consiglio:** crea `billy-dev` e `billy-prod` come resource group separati fin dall'inizio. Ti dà isolamento dei deployment e delle metriche di consumo senza costi aggiuntivi.

## 4.4 — Deployment di orchestration

**Cosa verifichi:** che esista un deployment di orchestration in stato `RUNNING`.

**Perché conta:** l'orchestration service gira su AI Core sotto lo scenario globale `orchestration` e ti serve almeno un deployment (o quello presente nel resource group di default) per usare l'API armonizzata.

**Come verifichi:**

```bash
curl -s "<AI_API_URL>/v2/lm/deployments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "AI-Resource-Group: default" | jq '.resources[] | {id, status, scenarioId, configurationName}'
```

**Buona notizia:** cerca nella risposta il deployment con `configurationName` uguale a `defaultOrchestrationConfig` e prendi il suo `deploymentUrl`: quello è il tuo orchestration URL. Spesso esiste già nel resource group di default e non devi crearlo.

**Se non c'è:** lo crei da AI Launchpad (`ML Operations → Configurations → Create`, scenario `orchestration`) oppure via API. Tutorial ufficiale: [Set up Generative AI Hub in SAP AI Core](https://developers.sap.com/tutorials/ai-core-genaihub-provisioning..html)

## 4.5 — Deployment dei modelli e verifica reale della disponibilità

**Cosa verifichi:** quali modelli puoi effettivamente usare **nella tua region**.

**Come:** l'orchestration deployment ti dà accesso a un set di modelli. Puoi anche restringerlo esplicitamente, che è utilissimo per il governance della spesa:

```json
[{"modelName": "gpt-4.1-nano"}, {"modelName": "gpt-4o-mini"},
 {"modelName": "gemini-2.0-flash-lite"}, {"modelName": "mistralai--mistral-small-instruct"}]
```

Questo restringe l'istanza ai modelli specificati. Senza versione, viene usata l'ultima disponibile. È il modo per imporre policy interne di utilizzo e per abilitare o bloccare temporaneamente modelli non ancora approvati.

**Naming dei modelli, attenzione:** i modelli Anthropic usano un **doppio trattino** (`anthropic--claude-4.5-sonnet`, `anthropic--claude-4.5-haiku`), quelli OpenAI no. Lista esatta nella SAP Note 3437766.

**Test pratico immediato:** apri AI Launchpad → Generative AI Hub → Chat / Prompt Editor e prova un prompt su ognuno dei modelli che ti interessano. Prima di scrivere codice, usa il Prompt Editor per verificare che il setup funzioni: è il modo più rapido per validare che entitlement, istanza, resource group e accesso ai modelli siano tutti configurati bene.

**Strategia di upgrade:** quando crei un deployment scegli tra **auto upgrade** e **manual upgrade**. Deciderlo consapevolmente: auto-upgrade ti evita il lavoro di manutenzione ma ti espone a cambi di comportamento del modello senza preavviso. Per Billy in produzione consiglio manual, con un job che monitora la SAP Note.

**Trappola da evitare in codice:** i `deployment_id` cambiano quando SAP aggiorna le versioni dei modelli. Recuperali programmaticamente dall'API invece di hardcodarli — i deployment ID hardcodati sono la causa più comune di fallimenti improvvisi dopo un aggiornamento di modello. L'SDK ufficiale li risolve da nome+versione, quindi usando l'SDK il problema si evita da solo.

## 4.6 — Endpoint: nasci in v2

**Cosa verifichi:** che tutto quello che scrivi usi `/v2/completion`.

**Perché:** l'endpoint orchestration iniziale è deprecato e sarà dismesso il **31 ottobre 2026**. Va usata la v2, aggiornando l'endpoint a `/v2/completion` e adattando i payload.

Metà dei blog e tutorial che troverai online usa la v1. Controlla sempre la data del post.

## ✅ Checklist Parte 4

- [ ] Istanza AI Core esistente, piano **extended**
- [ ] Service key creata, 4 valori salvati in modo sicuro
- [ ] Almeno un resource group esiste (verificato via API)
- [ ] Resource group con label document-grounding (se lo voglio usare)
- [ ] Deployment orchestration in stato RUNNING, URL annotato
- [ ] Ho testato **dal Prompt Editor** i modelli che mi servono
- [ ] Modelli confermati disponibili nella mia region: ______________
- [ ] So che devo usare `/v2/completion`

---

# PARTE 5 — SAP AI Launchpad: ruoli

Le role collection di AI Launchpad sono granulari e i nomi non sono intuitivi. Questi sono quelli reali, dalla documentazione ufficiale.

## 5.1 — Role collection di default

**Dove:** subaccount → `Security` → `Role Collections`, cerca quelle che iniziano con `ailaunchpad_`.

| Role collection | A cosa serve |
|---|---|
| `ailaunchpad_connections_editor` | Creare/modificare/eliminare connessioni al runtime AI (SAP AI Core) |
| `ailaunchpad_allow_all_resourcegroups` | Accesso a **tutti** i resource group |
| `ailaunchpad_mloperations_viewer` | Vedere contenuti di scenari e resource group |
| `ailaunchpad_mloperations_editor` | Vedere scenari, vedere e modificare contenuti dei resource group |
| `ailaunchpad_aicore_admin_viewer` | Vedere le autenticazioni per i workflow AI Core |
| `ailaunchpad_aicore_admin_editor` | Modificare le autenticazioni per i workflow AI Core |
| `ailaunchpad_genai_experimenter` | Sperimentazione prompt e orchestration, vedere i disclaimer |
| `ailaunchpad_genai_manager` | Come sopra + **gestione dei prompt** |
| `ailaunchpad_genai_administrator` | Cancellazione dati utente, gestione disclaimer |
| `ailaunchpad_functions_explorer_viewer_v2` / `_editor_v2` | Scenari e risorse ML |

**Nota importante:** il Generative AI Hub è disponibile attraverso il ruolo di default `viewer`. L'accesso all'Hub si **revoca** assegnando il ruolo equivalente `without_genai` (es. `viewer_without_genai`). Questo è controintuitivo: se vedi che qualcuno non accede all'Hub, controlla se ha una role collection `_without_genai`.

**Limite da conoscere:** gli utenti che hanno **solo** `genai_experimenter` o `prompt_experimenter` **non possono salvare i prompt** in AI Launchpad. Per te che stai costruendo, serve `genai_manager`.

## 5.2 — Ruoli per il Grounding Management

Se usi il Document Grounding, per l'app Grounding Management serve uno tra `genai_viewer`, `genai_experimenter`, `genai_manager`, `grounding_manager` o `grounding_viewer`. Per **creare** un data repository serve `grounding_manager` o `genai_manager`.

Inoltre, per creare una pipeline di data repository serve un **generic secret** per l'AI data management con la label grounding abilitata.

## 5.3 — Cosa assegnarti tu

Set minimo per te come builder del progetto:

```
ailaunchpad_connections_editor
ailaunchpad_mloperations_editor
ailaunchpad_aicore_admin_editor
ailaunchpad_genai_manager
ailaunchpad_allow_all_resourcegroups
```

**Come:** subaccount → `Security` → `Users` → tuo utente → `Assign Role Collection`.

**Attenzione:** dopo aver assegnato una role collection devi **fare logout e login** da AI Launchpad, altrimenti il token vecchio non ha i nuovi scope e vedrai ancora la UI vuota. È l'errore che fa perdere mezz'ora a tutti almeno una volta.

**Riferimento:** [Allow Access to SAP AI Launchpad](https://help.sap.com/docs/ai-launchpad/sap-ai-launchpad/allow-access-to-sap-ai-launchpad) · [Grounding Management](https://help.sap.com/docs/ai-launchpad/sap-ai-launchpad/grounding-management)

## ✅ Checklist Parte 5

- [ ] Ho assegnato a me stesso le 5 role collection della 5.3
- [ ] Ho fatto logout/login
- [ ] AI Launchpad si apre e vedo la connessione al mio AI Core runtime
- [ ] Vedo il resource group nel dropdown
- [ ] Vedo il catalogo modelli nel Generative AI Hub

---

# PARTE 6 — SAP HANA Cloud

## 6.1 — Istanza esistente e stato

**Dove:** subaccount → `Instances and Subscriptions` → cerca `hana`. Oppure apri **SAP HANA Cloud Central** dal Cockpit.

**Cosa verifichi:**
- l'istanza esiste
- è in stato **RUNNING** (le istanze HANA Cloud possono essere schedulate per fermarsi la notte, il che va benissimo per risparmiare in dev ma ti fa impazzire se non lo sai)
- la versione

## 6.2 — Vector engine

**Cosa verifichi:** che il tipo `REAL_VECTOR` sia supportato.

**Come:** apri SAP HANA Database Explorer e lancia:

```sql
CREATE TABLE VECTEST (ID INT, V REAL_VECTOR(3));
INSERT INTO VECTEST VALUES (1, TO_REAL_VECTOR('[1,2,3]'));
SELECT ID, COSINE_SIMILARITY(V, TO_REAL_VECTOR('[1,2,3]')) FROM VECTEST;
DROP TABLE VECTEST;
```

Se questo passa, il vector engine c'è e il tuo RAG è tecnicamente possibile. È il test più rapido e definitivo.

## 6.3 — NLP / embedding nativi (opzionale ma valuta)

**Cosa verifichi:** se puoi generare embedding dentro il database, senza round-trip verso AI Core.

**Come:**

```sql
SELECT VECTOR_EMBEDDING('Hello world!', 'DOCUMENT', 'SAP_NEB.20240715') FROM DUMMY;
```

Se funziona, l'NLP è abilitato. Serve abilitare il **Natural Language Processing** nelle impostazioni di HANA Cloud. Il modello `SAP_NEB.20240715` genera embedding a 768 dimensioni.

**Ma attenzione, questo ti riguarda direttamente:** in CAP la funzione `vector_embedding` come calculated element on-write è ancora **in beta e supportata solo dal runtime CAP Java**. Tu vai su Node.js, quindi calcolerai gli embedding a livello applicativo con l'SDK. L'NLP nativo resta comunque interessante come opzione per job batch di re-indexing in SQL puro.

**Riferimento:** [capire — Vector Embeddings](https://cap.cloud.sap/docs/guides/databases/vector-embeddings)

## 6.4 — HDI Container

**Cosa verifichi:** che il piano `hdi-shared` sia disponibile (è quello che CAP usa per deployare lo schema).

**Dove:** `Entitlements` → cerca `SAP HANA Schemas & HDI Containers`.

## 6.5 — Utente e accesso da Database Explorer

**Cosa verifichi:** di avere credenziali per aprire l'istanza e lanciare SQL. Se non riesci ad aprire il Database Explorer, ti serve il ruolo di admin su HANA Cloud Central, che è separato dai ruoli BTP.

## ✅ Checklist Parte 6

- [ ] Istanza HANA Cloud esistente e RUNNING
- [ ] Test `REAL_VECTOR` passato
- [ ] Ho verificato se l'NLP è abilitato (`VECTOR_EMBEDDING`)
- [ ] `hdi-shared` disponibile
- [ ] Accedo al Database Explorer e lancio SQL

---

# PARTE 7 — Servizi di supporto

Questi servono dalla fase 2-3 in poi. Verificali ora così sai cosa chiedere in un colpo solo, invece di fare tre richieste separate all'admin.

## 7.1 — Destination service

**Cosa verifichi:** che il servizio esista e che tu possa creare destination.

**Dove:** subaccount → `Connectivity` → `Destinations`.

**Cosa ti servirà creare** (non ora, ma sappi che serve): una destination verso AI Core con questa forma:

```
Name: GENERATIVE_AI_HUB
Type: HTTP
URL: <AI_API_URL dalla service key>
ProxyType: Internet
Authentication: OAuth2ClientCredentials
tokenServiceURL: <url dalla service key>/oauth/token
clientId / clientSecret: dalla service key
Additional Properties:
  URL.headers.AI-Resource-Group: default
  URL.headers.Content-Type: application/json
  HTML5.DynamicDestination: true
```

Questo pattern è documentato nel sample ufficiale [cap-ai-vector-engine-sample](https://github.com/SAP-samples/cap-ai-vector-engine-sample).

## 7.2 — Object Store

**Cosa verifichi:** disponibilità dell'entitlement `objectstore`, piano `standard`.

**Perché:** `@cap-js/attachments` richiede un service binding valido a un Object Store, tipicamente provisionato tramite SAP BTP, dichiarato nell'`mta.yaml` come `org.cloudfoundry.managed-service` con `service: objectstore` e `service-plan: standard`.

**Nota commerciale:** l'Object Store è un servizio a pagamento che tipicamente non è nel free tier. Se stai in free tier, per la fase 1 puoi tenere i file in HANA come LargeString e migrare dopo. Non è elegante ma ti sblocca.

## 7.3 — Malware Scanning

**Cosa verifichi:** disponibilità dell'entitlement.

**Perché è non-negoziabile per te:** stai costruendo una piattaforma dove **chiunque in azienda carica file**. L'AttachmentService usa il servizio BTP di malware scanning per scansionare gli allegati, ed è abilitato di default per tutti i profili quando c'è uno storage configurato. Buona notizia: te lo dà gratis il plugin, devi solo avere l'istanza.

**Riferimento:** [cap-js/attachments](https://github.com/cap-js/attachments)

## 7.4 — HTML5 Application Repository + Work Zone

**Cosa verifichi:** entitlement `html5-apps-repo` con i piani `app-host` e `app-runtime`, più una subscription che faccia da runtime.

**Perché serve il secondo pezzo:** per eseguire applicazioni HTML5 dal repository serve una subscription abilitata nel subaccount. **SAP Build Work Zone, standard edition** è la più semplice da configurare.

**Nota:** i piani `app-host` e `app-runtime` dell'HTML5 Application Repository, insieme a Service Manager (`container`), sono tipicamente **già selezionati di default** quando si crea un subaccount. Quindi probabilmente li hai già.

**Riferimento:** [multi-cloud-html5-apps-samples](https://github.com/SAP-samples/multi-cloud-html5-apps-samples) · [SAP CAP Lessons Learned: Deploy app on HTML5 Repository](https://community.sap.com/t5/technology-blog-posts-by-members/sap-cap-lessons-learned-deploy-app-on-html5-repository/ba-p/13950921)

## 7.5 — Logging

**Cosa verifichi:** se hai Cloud Logging o Application Logging.

**Perché:** Application Logging è in via di deprecazione a favore di **SAP Cloud Logging**. Se stai partendo ora, parti direttamente con Cloud Logging.

## ✅ Checklist Parte 7

- [ ] Posso creare destination
- [ ] Object Store disponibile (o ho un piano B per la fase 1)
- [ ] Malware Scanning disponibile
- [ ] HTML5 App Repo (`app-host` + `app-runtime`) disponibile
- [ ] Un runtime per HTML5 sottoscritto (Work Zone standard edition)
- [ ] Cloud Logging disponibile

---

# PARTE 8 — Tooling locale

## 8.1 — Node.js

```bash
node -v
```

**Cosa vuoi:** Node.js **v22 minimo**, v24 LTS raccomandato. Su `cds 10` Node v22 è il runtime minimo supportato.

## 8.2 — CAP CDS

```bash
npm i -g @sap/cds-dk
cds -v
```

## 8.3 — Cloud Foundry CLI + plugin MultiApps

```bash
cf -v
cf add-plugin-repo CF-Community https://plugins.cloudfoundry.org
cf install-plugin multiapps
cf plugins
```

Il plugin `multiapps` serve per deployare i file `.mtar` (`cf deploy`). Senza quello non deployi un progetto MTA.

**Riferimento:** [MultiApps CF CLI Plugin](https://github.com/cloudfoundry-incubator/multiapps-cli-plugin)

## 8.4 — MBT (MTA Build Tool)

```bash
npm i -g mbt
mbt -v
```

## 8.5 — btp CLI (opzionale ma molto utile)

Ti permette di fare tutti i check delle Parti 1-3 da terminale invece che a click. Se il tuo admin ti dà i permessi ma non il tempo, questo diventa il tuo migliore amico.

## 8.6 — Login e verifica finale

```bash
cf login -a <API_ENDPOINT> --sso
cf target        # verifica org e space
cf services      # cosa c'è già nello space
cf marketplace | grep -i -E "aicore|hana|objectstore|xsuaa|destination|html5"
```

Quest'ultimo comando è il check più veloce di tutti: se `aicore` non appare in `cf marketplace`, l'entitlement non è assegnato al subaccount, punto.

## ✅ Checklist Parte 8

- [ ] Node ≥ 22
- [ ] `cds` funziona
- [ ] `cf` + plugin `multiapps`
- [ ] `mbt`
- [ ] `cf login` riuscito, target su org/space corretti
- [ ] `cf marketplace` mostra `aicore` con piano `extended`

---

# PARTE 9 — Smoke test end-to-end (mezz'ora)

Se le Parti 0-8 sono verdi, questo test dimostra che il progetto è tecnicamente fattibile **oggi** nel tuo landscape. Fallo prima di scrivere qualsiasi cosa.

## 9.1 — Progetto minimo

```bash
cds init billy-smoketest --add nodejs
cd billy-smoketest
npm i @sap-ai-sdk/orchestration
```

## 9.2 — Chiamata all'LLM

Crea `test-llm.js`:

```js
import { OrchestrationClient } from '@sap-ai-sdk/orchestration';

const client = new OrchestrationClient({
  promptTemplating: {
    model: { name: 'anthropic--claude-4.5-sonnet' }  // adatta al tuo modello disponibile
  }
});

const res = await client.chatCompletion({
  messages: [{ role: 'user', content: 'Rispondi solo: OK' }]
});

console.log(res.getContent());
```

Per l'esecuzione in locale ti serve il binding delle credenziali AI Core (via `cds bind` in modalità hybrid, o `default-env.json`). Documentazione: [SAP Cloud SDK for AI](https://sap.github.io/ai-sdk/) · [sample-code ufficiale](https://github.com/SAP/ai-sdk-js/blob/main/sample-code/src/orchestration.ts)

**Se stampa OK:** entitlement, service key, resource group, deployment orchestration e modello funzionano tutti. Questa è la milestone più importante di tutto il pre-flight.

## 9.3 — Streaming

Sostituisci `chatCompletion` con `stream()` e verifica che i chunk arrivino progressivamente. Serve perché la tua landing è una chat tipo ChatGPT e senza streaming l'esperienza è inaccettabile.

Guida per portarlo al browser dentro CAP: [Streaming LLM Output with CAP and WebSockets](https://community.sap.com/t5/technology-blog-posts-by-sap/streaming-llm-output-with-cap-and-websockets/ba-p/14224282)

## 9.4 — Vettori end-to-end

1. Entità CDS con `embedding : Vector(1536)` (o la dimensione del tuo embedding model)
2. `cds deploy --to hana`
3. Genera l'embedding di 3 frasi via SDK, inseriscile
4. Fai una query con `COSINE_SIMILARITY` e verifica che l'ordinamento sia sensato

**Se questo funziona, il RAG è fatto.** Tutto il resto è ingegneria, non incognita tecnica.

## 9.5 — Deploy di un'app vuota

```bash
mbt build
cf deploy mta_archives/*.mtar
```

Verifica che il deploy vada a buon fine e che la route risponda. Sembra banale ma è dove escono i problemi di quota CF, di HDI container e di XSUAA.

## ✅ Checklist Parte 9

- [ ] Chiamata LLM riuscita
- [ ] Streaming funzionante
- [ ] Insert + similarity search su HANA funzionanti
- [ ] Deploy MTA riuscito

---

# PARTE 10 — Go / No-Go

| # | Requisito | Bloccante | Stato | Note / chi contattare |
|---|---|---|---|---|
| 1 | T&C AI accettati | 🔴 | | lead time più lungo, parti da qui |
| 2 | AI Core piano **extended** | 🔴 | | senza questo non c'è Gen AI Hub |
| 3 | Region con i modelli che servono | 🔴 | | non si cambia dopo |
| 4 | Sono Subaccount Admin | 🔴 | | |
| 5 | Sono Space Manager (non solo Developer) | 🔴 | | serve per creare istanze |
| 6 | Resource group esistente | 🔴 | | solo via API |
| 7 | Orchestration deployment RUNNING | 🔴 | | |
| 8 | HANA Cloud RUNNING + `REAL_VECTOR` ok | 🔴 | | |
| 9 | Smoke test 9.2 passato | 🔴 | | la vera prova del nove |
| 10 | Smoke test 9.4 passato | 🔴 | | |
| 11 | Role collection AI Launchpad | 🟡 | | lavori via API se manca |
| 12 | Object Store | 🟡 | | serve in fase 3 |
| 13 | Malware Scanning | 🟡 | | obbligatorio prima di aprire l'upload |
| 14 | HTML5 App Repo + Work Zone | 🟡 | | serve in fase 2 |
| 15 | Cloud Logging | 🟢 | | |
| 16 | Tooling locale completo | 🟢 | | |

**Regola di decisione:**
- Tutti i 🔴 verdi → **si parte con la fase 1**, i 🟡 li chiedi in parallelo mentre sviluppi
- Un 🔴 rosso su 1, 2 o 3 → **fermati**, è un tema commerciale o di architettura, non tecnico
- Un 🔴 rosso su 4, 5 o 6 → **una mail al tuo admin BTP** e sei sbloccato in un giorno

---

# Appendice A — I 6 friction point da tenere sotto il cuscino

Da una guida pratica SAP che elenca esplicitamente le cose che non stanno nella documentazione ufficiale:

1. **Entitlement AI Launchpad dimenticato.** AI Core da solo non basta: va aggiunto SAP AI Launchpad separatamente, altrimenti non hai accesso UI all'Hub.
2. **Quota di default a zero.** BTP alloca zero quota per default: va impostata esplicitamente ad almeno 1 unità dopo aver aggiunto l'entitlement.
3. **Resource group non creato.** I modelli sono invisibili nell'Hub finché non esiste un resource group: va creato via chiamata API prima di aprire il Launchpad.
4. **OAuth, non una semplice API key.** AI Core usa OAuth 2.0 client credentials: implementa la logica di refresh del token prima di scrivere codice AI.
5. **Gap regionali sui modelli.** I modelli assenti dal tuo catalogo sono probabilmente non disponibili nella tua region: verifica la disponibilità prima di scegliere la region del subaccount.
6. **Deployment ID hardcodati.** I deployment ID cambiano con gli aggiornamenti dei modelli: recuperali programmaticamente per evitare fallimenti silenziosi dopo un aggiornamento SAP.

Fonte: [SAP Generative AI Hub: A Practitioner's Setup Guide](https://community.sap.com/t5/artificial-intelligence-blogs-posts/sap-generative-ai-hub-a-practitioner-s-setup-guide/ba-p/14344910)

A questi ne aggiungo tre miei, dalla ricerca fatta:

7. **Endpoint v1 dismesso il 31/10/2026.** Nasci in `/v2/completion`.
8. **CAP LLM Plugin archiviato.** Il Cloud SDK for AI è l'SDK ufficiale e raccomandato per clienti e partner e per tutti i casi produttivi; il CAP LLM Plugin è un contributo community, non un prodotto SAP. Metà dei tutorial online usa il plugin: ignorali.
9. **Logout/login dopo ogni assegnazione di role collection.** Altrimenti il token vecchio non ha i nuovi scope.

---

# Appendice B — Cosa chiedere all'admin BTP, in una sola mail

Se scopri che ti mancano dei permessi, questo è il testo da mandare, così non fai tre giri.

> Ciao,
> sto avviando un progetto interno su BTP (piattaforma di knowledge sharing con chatbot RAG). Mi servirebbe, sul subaccount `<NOME>`:
>
> **Ruoli per me:**
> - `Subaccount Administrator`
> - `Space Manager` sullo space `<NOME>` (non solo Space Developer: serve per creare istanze di servizio)
> - Role collection: `ailaunchpad_connections_editor`, `ailaunchpad_mloperations_editor`, `ailaunchpad_aicore_admin_editor`, `ailaunchpad_genai_manager`, `ailaunchpad_allow_all_resourcegroups`
>
> **Entitlement da assegnare al subaccount (con quota ≥ 1):**
> - SAP AI Core — piano **extended** (obbligatorio: il Generative AI Hub esiste solo su questo piano)
> - SAP AI Launchpad — piano standard, con subscription attivata
> - SAP HANA Cloud + SAP HANA Schemas & HDI Containers (`hdi-shared`)
> - Cloud Foundry Runtime — almeno 4 unità
> - Destination (`lite`), XSUAA
> - Object Store (`standard`) e Malware Scanning
> - HTML5 Application Repository (`app-host`, `app-runtime`)
> - SAP Build Work Zone, standard edition
>
> **Prerequisito legale:** confermi che i Termini e Condizioni per i servizi AI sono accettati a livello di global account? Se no, chi devo coinvolgere?
>
> **Domanda:** in quale region è il subaccount? Mi serve per verificare la disponibilità dei modelli (SAP Note 3437766).
>
> Grazie!

---

# Appendice C — Link di riferimento

**Documentazione ufficiale SAP**
- [What Is SAP AI Core?](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/what-is-sap-ai-core)
- [SAP AI Core — Initial Setup](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/initial-setup)
- [SAP AI Core — Service Plans](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/service-plans)
- [Generative AI Hub](https://help.sap.com/docs/sap-ai-core/generative-ai/generative-ai-hub)
- [Orchestration](https://help.sap.com/docs/sap-ai-core/generative-ai/orchestration)
- [Resource Groups](https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/resource-groups)
- [Allow Access to SAP AI Launchpad](https://help.sap.com/docs/ai-launchpad/sap-ai-launchpad/allow-access-to-sap-ai-launchpad)
- [Grounding Management](https://help.sap.com/docs/ai-launchpad/sap-ai-launchpad/grounding-management)
- [Role Collections and Roles in Global Accounts, Directories, and Subaccounts](https://help.sap.com/docs/btp/sap-business-technology-platform/role-collections-and-roles-in-global-accounts-directories-and-subaccounts)
- [Working with Role Collections](https://help.sap.com/docs/btp/sap-business-technology-platform/working-with-role-collections)
- [Trial Accounts and Free Tier](https://help.sap.com/docs/btp/sap-business-technology-platform/trial-accounts-and-free-tier)
- **SAP Note 3437766** — Availability of Generative AI Models: `https://me.sap.com/notes/3437766`

**Tutorial**
- [Set up Generative AI Hub in SAP AI Core](https://developers.sap.com/tutorials/ai-core-genaihub-provisioning..html)
- [Orchestration (V2) with Grounding Capabilities](https://developers.sap.com/tutorials/ai-core-orchestration-grounding-v2..html)

**SDK e sample**
- [SAP Cloud SDK for AI](https://sap.github.io/ai-sdk/)
- [SAP/ai-sdk-js](https://github.com/SAP/ai-sdk-js)
- [btp-cap-genai-rag](https://github.com/SAP-samples/btp-cap-genai-rag) — reference implementation da cui partire
- [cap-ai-vector-engine-sample](https://github.com/SAP-samples/cap-ai-vector-engine-sample) — pattern della destination
- [cap-js/attachments](https://github.com/cap-js/attachments)
- [multi-cloud-html5-apps-samples](https://github.com/SAP-samples/multi-cloud-html5-apps-samples)

**CAP**
- [capire — Vector Embeddings](https://cap.cloud.sap/docs/guides/databases/vector-embeddings)
- [capire — MCP Protocol Adapter](https://cap.cloud.sap/docs/guides/protocols/mcp)
- [capire — Plugins](https://cap.cloud.sap/docs/plugins/)

**Architecture Center**
- [Generative AI on SAP BTP](https://architecture.learning.sap.com/docs/ref-arch/e5eb3b9b1d)
- [Agentic AI & AI Agents](https://architecture.learning.sap.com/docs/ref-arch/98efa0)

**Community (con data, per valutare l'attualità)**
- [A Practitioner's Setup Guide](https://community.sap.com/t5/artificial-intelligence-blogs-posts/sap-generative-ai-hub-a-practitioner-s-setup-guide/ba-p/14344910) — mar 2026
- [Streaming LLM Output with CAP and WebSockets](https://community.sap.com/t5/technology-blog-posts-by-sap/streaming-llm-output-with-cap-and-websockets/ba-p/14224282) — nov 2025
- [Generative AI Hub Governance](https://thesapguide.com/blog/generative-ai-hub-governance-sap-btp/) — giu 2026
- [Serie RAG on SAP BTP (Kevin Riedelsheimer)](https://kevinriedelsheimer.com/blog/posts/2026/02/10/building-rag-applications-on-sap-btp-part-3-implementing-the-rag-flow/) — feb 2026
