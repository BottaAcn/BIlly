# Audit del routing delle 22 skill del Toolkit AI dentro Billy

Data: 2026-09-28 · Fonte skill: `C:\Users\l.botta\OneDrive - Accenture\AI Contest - Generale\Toolkit AI`
Meccanismo analizzato: `billy-app/srv/lib/agent.js` (manifesto `title` + `description` nel system prompt, `loadSkill(skillId)` per il corpo).
Seeder analizzato: `billy-app/scripts/seed-skills.js` (carica **tutti** i 22 `SKILL.md` verbatim, description non riscritta).

---

## 1. Verdetto in tre righe

**No: così com'è il routing funziona male.** 12 delle 22 skill (i fogli di design della SAC Factory) aprono la description con la stessa identica frase — *"Redige il foglio NN_XXX della progettazione SAC come voce design_sheets dello spec.json"* — e nel manifesto di Billy quella frase compare sotto l'etichetta **"Quando usarla:"**, dove è una non-risposta: descrive l'artefatto prodotto, non il bisogno che la attiva.

Il problema non è però solo la collisione: è **invertito**. Le uniche due description che rispondono alla domanda larga e realistica ("aiutami col design SAC") sono l'orchestratore (02) e il renderer (17) — cioè esattamente le due il cui corpo in Billy **non può fare nulla**, perché sono wrapper attorno a script Python (`run_factory.py`, `run_render.py`) e Billy ha solo due tool, `searchKnowledge` e `loadSkill`, senza esecuzione di codice.

Secondo problema indipendente e altrettanto grave: **5 skill su 22 sono ineseguibili in Billy** (02, 03, 17, 18, e in parte 16) e **1 è un guscio vuoto** (leva6, il cui corpo di conoscenza vive in un file `Scenari_Planning.md` che il seeder non carica). Raccomandazione: pubblicarne **8**, non 22.

---

## 2. Inventario

### 2.1 Cosa è davvero una skill

`LEVA/` contiene 7 cartelle ma **solo 4 hanno un `SKILL.md`**. Confermato anche da `ASSET_CATALOG.md` ("installa `leva1`, `leva2`, `leva6`, `leva7` in `~/.claude/skills`").

| Cartella | Ha SKILL.md | Cos'è |
|---|---|---|
| `leva1-devils-advocate` | sì | skill |
| `leva2-traduttore-valore` | sì | skill |
| `leva3-simulatore-negoziazione` | **no** | app HTML standalone (`index.html`) |
| `leva4-knowledge-base` | **no** | app HTML + adapter Python/Excel |
| `leva5-digital-twin` | **no** | app HTML + adapter Python/Excel |
| `leva6-scenari-planning` | sì | skill (+ `Scenari_Planning.md`) |
| `leva7-anticipatore-gare` | sì | skill (+ template HTML) |

Fuori da `LEVA/` ci sono altre due cartelle **senza** `SKILL.md`: `business-case/` e `pm-status-report/` (app HTML). Non entrano nel catalogo skill — vedi §4.5 (buchi).

Totale: **4 LEVA + 18 micro-skill = 22 skill**, che è esattamente ciò che `findSkillFiles()` trova oggi.

### 2.2 Tabella completa

Legenda autonomia: **A** = autonoma (risponde da sola a una domanda utente) · **P** = pezzo di pipeline · **I** = infrastruttura (nessuna domanda utente la attiva) · **C** = richiede esecuzione di codice, impossibile in Billy.

| # | `name` | Titolo nel catalogo (H1) | Description (integrale) | Cosa fa | Aut. |
|---|---|---|---|---|---|
| 1 | `leva1-devils-advocate` | Leva #1 — Devil's Advocate sulle stime | Fa il red-team di una stima di effort/prezzo PRIMA di presentarla al cliente. Individua assunzioni fragili e ottimismi sistematici (planning fallacy, scope creep, dipendenze e ambienti/dati non pronti, QA/UAT/cutover sottostimati), simula le obiezioni di procurement, CFO e IT, e propone range + contingency. Si aggancia esplicitamente al framework di stima del team (AM Effort Estimator: unit build in gg/oggetto/mese, famiglie di oggetti SAC Planning + Datasphere, driver di complessita' LOW/MEDIUM/HIGH, coefficienti di pricing). Usare quando hai in mano una stima gg/uomo o un canone/prezzo e devi stressarla prima di esporla. Programma LEVA - Practice SAP Data & Analytics. | Attacca una stima esistente e produce range P50/P80 + contingency + risposte alle obiezioni | **A** |
| 2 | `leva2-traduttore-valore` | Leva #2 — Traduttore SAP → valore | Trasforma un oggetto tecnico SAP (ADSO, Data Action SAC, CDS embedded analytics, ADSO/flow Datasphere, allocation step, ecc.) in una value story su tre registri distinti: CFO (impatto economico, margine, rischio, cassa), IT manager (TCO, manutenibilita', integrazione, governance, sicurezza) e key user (tempo risparmiato, qualita' del dato, autonomia). Usare quando bisogna spiegare a stakeholder non tecnici PERCHE' un oggetto tecnico conta, in una proposta, un business case, uno steering o una demo. Programma LEVA - Practice SAP Data & Analytics. | Oggetto tecnico → 3 narrazioni di valore per 3 interlocutori | **A** |
| 3 | `leva6-scenari-planning` | Leva #6 — Scenari di Planning (selettore di logica + requisiti) | Aiuta a scegliere la logica di planning giusta (allocazione costi \| driver-based \| rolling forecast) PRIMA di disegnare il modello SAC/BPC, e ne deriva i requisiti tecnici (dimensioni, versioni, data action/allocation step, livello di aggregazione). Usare quando parte una progettazione di planning e serve decidere l'approccio, confrontare le alternative, o combinarle in un impianto coerente. Programma LEVA - Practice SAP Data & Analytics. | Sceglie fra allocazione / driver-based / rolling e ne deriva i requisiti | **A**, ma corpo incompleto (§3.4) |
| 4 | `leva7-anticipatore-gare` | Leva #7 — Anticipatore di gare | Analizza un capitolato di gara (PDF/testo fornito manualmente) ed estrae in forma strutturata: lotti, requisiti obbligatori vs premianti, criteri di aggiudicazione e pesi, rischi/penali, scadenze e un posizionamento (fit con le competenze della Practice SAP D&A, gap, raccomandazione go/no-go). Usare quando arriva un capitolato/disciplinare e serve una lettura rapida e decisionale prima di impegnare risorse sulla risposta. CAVEAT: nessun accesso automatico a banche dati gare, portali o fonti online - lavora solo sul documento che l'utente incolla o carica. Programma LEVA - Practice SAP Data & Analytics. | Capitolato → scheda strutturata + go/no-go | **A** |
| 5 | `sac-spec-json-ir` | Micro-skill 01 — spec.json (IR, contratto dati canonico) | Possiede il contratto dati canonico della SAC Design Factory: lo schema dell'IR (spec.json). Definisce struttura, campi obbligatori, ordine dei 15 fogli e contratto colonne dei design_sheets. Usare per creare/validare uno spec.json, capire quali campi ogni altra micro-skill legge/scrive, o evolvere il contratto in modo retro-compatibile. E' la fondamenta: ogni altra skill dipende da questo. | Schema JSON interno alla Factory | **I** |
| 6 | `sac-orchestratore` | Micro-skill 02 — Orchestratore + REGOLA 0 | Coordina la pipeline della SAC Design Factory (extract → design → plan → render → qa) applicando la REGOLA 0 (ripartire sempre dall'artefatto piu' recente, mai sovrascrivere lavoro altrui). Decide l'ordine di esecuzione, gestisce multi-BBP/risorse condivise, ferma la pipeline se la validazione dell'IR trova errori. Usare per progettare/aggiornare una soluzione SAC end-to-end o rigenerare dopo modifiche. | Ordine di esecuzione della pipeline + `run_factory.py` | **P/C** |
| 7 | `sac-bbp-extract` | Micro-skill 03 — bbp-extract (BBP → IR) | EXTRACT: estrae testo strutturato (heading, paragrafi, tabelle in ordine di documento) da una Business Blueprint SAC .pptx/.docx e produce lo skeleton dello spec.json (meta + design_sheets scaffold conformi al contratto + euristiche su dimensioni/sorgenti/fasi). Primo step della pipeline. Usare per ingerire una BBP e derivarne la struttura su cui lavorano le skill di design. | Parsing .pptx/.docx via python-pptx/python-docx | **P/C** |
| 8 | `sac-design-00-readme` | SAC Design - Foglio 00 README | Redige il foglio 00_README della progettazione SAC come voce design_sheets dello spec.json. Produce la scheda di sintesi del progetto (scopo, perimetro, modello, sorgenti, convenzioni) con le colonne Sezione e Contenuto. Usare come primo foglio dell'analisi tecnica, per orientare chi legge il workbook. | Scheda di sintesi del progetto | **P** |
| 9 | `sac-design-01-architettura` | SAC Design - Foglio 01 Architettura | Redige il foglio 01_Architettura della progettazione SAC come voce design_sheets dello spec.json. Descrive i componenti dell'architettura (sorgenti, layer semantico, motore planning, front-end) con colonne Componente, Ruolo, Tecnologia, Note. Usare per fissare la topologia della soluzione end-to-end e le connessioni tra sistemi. | Topologia dei componenti | **P** |
| 10 | `sac-design-02-sorgenti` | SAC Design - Foglio 02 Sorgenti Dati | Redige il foglio 02_Sorgenti_Dati della progettazione SAC come voce design_sheets dello spec.json. Cataloga i sistemi alimentanti con colonne ID Sorgente, Sistema, Tipo, Oggetto, Frequenza, Note. Usare per censire ogni fonte dati (BW/4HANA, Datasphere, flat file) e la sua cadenza di aggiornamento. | Censimento fonti dati | **P** |
| 11 | `sac-design-03-dimensioni` | SAC Design - Foglio 03 Dimensioni | Redige il foglio 03_Dimensioni della progettazione SAC come voce design_sheets dello spec.json. Descrive le dimensioni del modello (account, entity, time, version, generic) con colonne ID Dimensione, Nome, Tipo, Gerarchie, Membri chiave, Note. Usare per definire l'ossatura dimensionale del Planning Model. | Dimensioni del modello | **P** |
| 12 | `sac-design-04-mapping` | SAC Design - Foglio 04 Mapping Tables | Redige il foglio 04_Mapping_Tables della progettazione SAC come voce design_sheets dello spec.json. Descrive il mapping campo-sorgente verso dimensione-target con colonne Sorgente, Campo Sorgente, Target, Campo Target, Trasformazione, Note. Usare per definire come i dati sorgente popolano il modello. | Mapping sorgente → target | **P** |
| 13 | `sac-design-05-fasi-processo` | SAC Design - Foglio 05 Fasi Processo | Redige il foglio 05_Fasi_Processo della progettazione SAC come voce design_sheets dello spec.json. Descrive le fasi del processo di planning (setup, budget, allocazione, forecast) con colonne Fase, Attivita', Input, Output, Owner ruolo, Milestone. Usare per definire il flusso funzionale end-to-end. | Fasi del ciclo di planning | **P** |
| 14 | `sac-design-06-allocazioni` | SAC Design - Foglio 06 Allocazioni | Redige il foglio 06_Allocazioni della progettazione SAC come voce design_sheets dello spec.json. Descrive le allocazioni/ribalti (OPEX, logistica) con colonne ID Allocazione, Driver, Sender, Receiver, Base, Formula/Regola, Note. Usare per definire sender/receiver e i driver di ripartizione dei costi. | Regole di allocazione costi | **P** |
| 15 | `sac-design-07-modello-pl` | SAC Design - Foglio 07 Modello P&L | Redige il foglio 07_Modello_PL della progettazione SAC come voce design_sheets dello spec.json. Descrive la struttura del conto economico con colonne Voce P&L, Tipo account, Segno, Formula, Livello, Note. Usare per definire voci di P&L, account type, segni e formule di aggregazione (margine, EBITDA). | Struttura del conto economico | **P** |
| 16 | `sac-design-08-maschere` | SAC Design - Foglio 08 Maschere Input | Redige il foglio 08_Maschere_Input della progettazione SAC come voce design_sheets dello spec.json. Descrive le maschere di data entry con colonne Maschera, Scopo, Dim. righe, Dim. colonne, Misure, Data entry, Note. Usare per definire i form di planning (layout righe/colonne, modalita' di immissione). | Form di data entry | **P** |
| 17 | `sac-design-09-data-quality` | SAC Design - Foglio 09 Data Quality | Redige il foglio 09_Data_Quality della progettazione SAC come voce design_sheets dello spec.json. Descrive le regole di controllo qualita' dati con colonne Regola, Oggetto, Controllo, Soglia/Atteso, Severita', Azione. Usare per definire quadrature, validazioni di allocazione e controlli su anagrafiche. | Regole DQ e quadrature | **P** |
| 18 | `sac-design-10-flusso-gov` | SAC Design - Foglio 10 Flusso Governance | Redige il foglio 10_Flusso_Gov della progettazione SAC come voce design_sheets dello spec.json. Descrive il flusso di governance/security con colonne Passo, Attivita', Ruolo, Autorizzazione, Sistema, Note. Usare per definire workflow di approvazione, ruoli, autorizzazioni e data locking del processo di planning. | Workflow di approvazione e sicurezza | **P** |
| 19 | `sac-design-logiche-calcolo` | SAC Design - Foglio Logiche_Calcolo | Redige il foglio Logiche_Calcolo della progettazione SAC come voce design_sheets dello spec.json. E' il foglio piu' tecnico: raccoglie data action, allocation step, currency conversion, derivazioni, carry-forward e validazioni con formule/script SAC reali, con colonne ID, Nome, Tipo, Descrizione, Formula/Script, Oggetti coinvolti. | Data action e Advanced Formula reali | **P** |
| 20 | `sac-scheduler` | Micro-skill 16 — scheduler (PLAN) | PLAN: scheduler a vincoli. Dato lo spec (tasks, team con disponibilita'/allocazione, calendario) calcola la matrice dei carichi, assegna l'owner ai task non assegnati (least-loaded fra gli eleggibili disponibili) e segnala picchi oltre capacita', buchi a zero, violazioni di finestra e infeasibility. Usare per pianificare/ribilanciare i carichi prima del rendering. | Assegnazione task + diagnosi carichi | **P**, logica riproducibile a testo |
| 21 | `sac-render-excel` | Micro-skill 17 — render-Excel (RENDER) | RENDER: renderer generico e data-driven che dallo spec.json produce il workbook Excel completo di progettazione SAC (analisi tecnica 00-10 + Logiche_Calcolo dai design_sheets, piano 11/12/13 da team/tasks/plan/calendario). Nessun contenuto hardcoded; supporto multi-progetto (colonna BBP) e salvataggio lock-safe. Usare per generare/rigenerare il file Excel dopo aver composto lo spec. | Genera il .xlsx via openpyxl | **C** — impossibile |
| 22 | `sac-qa-validatore` | Micro-skill 18 — qa-validatore (QA) | QA: validatore del workbook di progettazione SAC e della sua coerenza con lo spec.json. Verifica presenza/ordine dei 15 fogli, colonne dei design_sheets vs contratto, owner risolti per tutti i task, milestone risolvibili, carico vs capacita'. Ultimo step della pipeline (o validazione di un workbook esistente). Esito PASS/FAIL con report degli Issue. | Validazione strutturale PASS/FAIL | **P/C**, checklist riproducibile |

**Sintesi**: 4 autonome (A), 12 pezzi di pipeline (P), 1 infrastruttura (I), 5 dipendenti da codice (C / P-C). Solo 4 su 22 sono state progettate per essere scelte da una domanda in linguaggio naturale.

---

## 3. Problemi trovati, per gravità

### 3.1 [BLOCCANTE] Cinque skill promettono cose che Billy non può fare

Billy espone al modello **esattamente due tool** (`agent.js`, costante `TOOLS`): `searchKnowledge(query)` e `loadSkill(skillId)`. Non c'è esecuzione di codice, né filesystem, né generazione di file, né lettura di allegati dentro il loop. Cinque skill sono wrapper attorno a Python in `micro-skill/_contract/sacfactory/`:

| Skill | Cosa richiede | Esito in Billy |
|---|---|---|
| 02-orchestratore | `python run_factory.py` | Il corpo è un ordine di esecuzione + comandi CLI. Nessun contenuto di design. |
| 03-bbp-extract | `python run_extract.py BBP.pptx`, python-pptx/python-docx | Nessun modo di leggere il .pptx. |
| 16-scheduler | `python run_scheduler.py` | L'algoritmo greedy è però descritto per esteso e **un modello lo può eseguire a mente** su input piccoli. Recuperabile. |
| 17-render-excel | `python run_render.py`, openpyxl | **Impossibile.** Billy non produce file. |
| 18-qa-validatore | `python run_qa.py` | I controlli sono una checklist. **Parzialmente recuperabile.** |

Il caso peggiore è **17-render-excel**, perché è al tempo stesso *molto attrattiva* e *totalmente impossibile*: un utente che chiede "mi generi il workbook Excel di progettazione?" fa scattare quella description in modo quasi certo, e riceve o un `python run_render.py --spec ...` da eseguire su un repo che non ha, o — peggio — un'allucinazione di file prodotto.

### 3.2 [GRAVE] Il collo di bottiglia è invertito: la domanda larga instrada verso i corpi vuoti

Questa è la conclusione più importante dell'audit, ed è più specifica della semplice "collisione".

La domanda realistica dell'utente è larga: *"aiutami col design SAC per un cliente retail"*. Nel manifesto attuale:

- le 12 skill che contengono **il contenuto** utile (fogli 00-10 + Logiche_Calcolo) descrivono ciascuna **1/12** della risposta. Nessuna, letta da sola, dice "ti aiuto a progettare un modello SAC";
- le **uniche due** description che promettono l'end-to-end sono 02-orchestratore ("Usare per progettare/aggiornare una soluzione SAC **end-to-end**") e 17-render-excel ("il workbook Excel **completo**") — cioè le due il cui corpo in Billy non produce niente (§3.1).

Il routing quindi non fallisce a caso: **fallisce sistematicamente verso le skill sbagliate**, perché le description sono state scritte per un orchestratore che conosceva già la pipeline, non per un modello che legge un manifesto.

E non c'è via d'uscita nemmeno se il modello facesse la cosa giusta: `MAX_ITERATIONS = 5` (agent.js) limita a 5 giri modello→tool→modello. Anche assumendo chiamate parallele, caricare 12 skill e poi comporre un design coerente dentro `max_tokens: 4096` non è realistico.

### 3.3 [GRAVE] 12 description con lo stesso incipit, e l'incipit risponde alla domanda sbagliata

Tutte e 12 le skill di design aprono con:

> `Redige il foglio NN_XXX della progettazione SAC come voce design_sheets dello spec.json.`

Nel system prompt il manifesto è reso così (`buildSystemPrompt`):

```
- ID: <uuid>
  Titolo: SAC Design - Foglio 04 Mapping Tables
  Quando usarla: Redige il foglio 04_Mapping_Tables della progettazione SAC come voce design_sheets dello spec.json. ...
```

Sotto l'etichetta **"Quando usarla:"** quella frase è un errore di categoria: descrive *cosa produce* e *in che formato interno*, non *quando serve*. Le prime ~15 parole di 12 voci su 22 sono identiche e portano **zero** segnale di routing, mentre occupano token in ogni richiesta.

**Onestà intellettuale**: la collisione **non è totale**. Ogni description chiude con un "Usare per …" che *è* discriminante, e per domande strette il routing probabilmente funziona (es. "come alloco gli OPEX?" → `06_Allocazioni`, che chiude con "definire sender/receiver e i driver di ripartizione dei costi"). Il difetto è che quel segnale è **in coda, dopo il rumore condiviso, e in gergo da modellatore** ("definire l'ossatura dimensionale del Planning Model") invece che nelle parole dell'utente.

Restano però **collisioni a coppie reali**, dove nemmeno la coda discrimina:

| Collisione | Domanda che le fa scontrare | Perché il modello non può scegliere |
|---|---|---|
| `06_Allocazioni` vs `Logiche_Calcolo` vs **leva6** | "Come imposto l'allocazione degli OPEX centrali?" | leva6 *sceglie* la logica, 06 *specifica* la regola, Logiche_Calcolo *scrive* l'allocation step. Tutte e tre dicono "allocazione" e "driver". Collisione a 3, attraverso due famiglie diverse. |
| `02_Sorgenti_Dati` vs `04_Mapping_Tables` | "Da dove arrivano i dati e come li porto nel modello?" | Una censisce le fonti, l'altra le mappa. La domanda le contiene entrambe. |
| `05_Fasi_Processo` vs `10_Flusso_Gov` | "Come modello il processo di approvazione del budget?" | 05 dice "flusso funzionale end-to-end", 10 dice "workflow di approvazione". Entrambe parlano di flusso, fasi, owner/ruolo. |
| `09_Data_Quality` vs `18-qa-validatore` | "Che controlli metto sul design?" | Entrambe usano "validazioni", "controlli", "regole". Una è DQ sui dati di planning, l'altra QA strutturale sul workbook. |
| `03_Dimensioni` vs `07_Modello_PL` | "Come struttura gli account?" | In SAC `account` è un tipo di dimensione (foglio 03), ma le voci di P&L stanno nel foglio 07. |

### 3.4 [GRAVE] leva6 in Billy è un guscio vuoto

`leva6-scenari-planning/SKILL.md` è l'unica skill LEVA piccola (2.334 byte) e il suo corpo lo dice esplicitamente:

> Il corpo di conoscenza completo — descrizione delle 3 logiche, quando conviene ciascuna, pro/contro, esempi SAC concreti (data action con pseudo-formula), tabella comparativa, anti-pattern e albero di scelta — e' nel documento [`Scenari_Planning.md`](./Scenari_Planning.md) nella stessa cartella.

`seed-skills.js` carica **solo** il `SKILL.md` (`content: body.trim()`). Il file `Scenari_Planning.md` non viene mai caricato. Risultato: leva6 ha una **ottima** description (routa bene) e un corpo che dice "applica una tabella comparativa che non hai". È il caso peggiore in assoluto: routing corretto → risposta inventata.

Verificato che gli altri riferimenti esterni sono **soft**: `leva1` cita `AM_Stima_Effort.html` ma ne descrive il framework inline; `leva7` cita `scheda_gara_template.html` ma ha il layout della scheda inline. Quelli non sono un problema.

### 3.5 [MEDIO] I corpi delle 12 skill di design hanno riferimenti incrociati penzolanti

Ogni foglio di design ha una sezione `## Riferimenti incrociati` che punta ad altri 3-4 fogli. Esempio reale da `06_Allocazioni`:

> - **Logiche_Calcolo**: ogni ID Allocazione qui diventa un allocation step / advanced formula.
> - **03_Dimensioni**: sender/receiver/driver sono membri di dimensioni del foglio 03.
> - **07_Modello_PL**: le voci allocate (es. OPEX) sono dichiarate "da allocazione" nel foglio 07.
> - **09_Data_Quality**: la conservazione sender=receiver diventa una regola DQ.

In Claude Code l'orchestratore garantisce che quei fogli esistano. In Billy, caricata da sola, la skill istruisce il modello a coordinarsi con contenuto che non ha. **Questa è la prova tecnica che le 12 non sono autonome**: non è un'opinione sullo stile della description, è una dipendenza dichiarata nel corpo.

Ogni corpo inoltre rimanda a `sap-sac-planning` / `sap-sac-scripting` ("Skill SAP di supporto") che **non esistono nel Toolkit** e non finiranno mai nel catalogo di Billy: altri puntatori morti.

### 3.6 [MEDIO] 01-spec-json non ha nessuna domanda utente che la attivi

"Possiede il contratto dati canonico… È la fondamenta: ogni altra skill dipende da questo." È una dipendenza fra skill, non una capability. Nessun utente di Billy chiederà mai qualcosa che debba instradare qui. Non fa danno attivo (la description è distintiva, non ruba traffico), ma occupa manifesto a beneficio zero.

### 3.7 [BASSO] Costo del manifesto

Oggi: 8.390 caratteri di sole description, più titoli e ID ≈ **~2.700 token nel system prompt di ogni richiesta**. Come dice il brief, è tollerabile. Ma va notato che ~1.000 di quei token sono l'incipit ripetuto 12 volte più le liste di colonne (`ID Allocazione, Driver, Sender, Receiver, Base, Formula/Regola, Note`), che sono **contratto tecnico interno**, non segnale di routing. Si paga rumore a ogni turno.

---

## 4. Proposte

### 4.1 Decisione di fondo

**Pubblicare 8 skill invece di 22.** Motivazione in una riga: 12 delle 22 sono capitoli di un unico documento, e un capitolo non è una risposta.

Vincoli di Billy che guidano la scelta (tutti verificati in `agent.js` / `seed-skills.js`):
- `truncate(asset.content, 60000)` → il corpo di una skill è tagliato a **60.000 caratteri**;
- `MAX_ITERATIONS = 5` → al massimo 5 giri modello↔tool;
- `max_tokens: 4096` → la risposta finale non può essere un workbook a 15 fogli;
- `MAX_DESCRIPTION = 2000` → tutte le description proposte sotto stanno abbondantemente dentro.

### 4.2 Perché accorpare, e perché in DUE composite e non in una

Ho scartato l'opzione "tengo le 12 separate e riscrivo solo le description" per tre motivi concreti:

1. La domanda larga resta irrisolvibile: 12 risposte parziali e il tetto di 5 iterazioni (§3.2).
2. I corpi hanno dipendenze incrociate dichiarate: caricati singolarmente restano monchi (§3.5).
3. 12 voci ≈ 900 token di manifesto a ogni turno per **una sola** capability.

Ho scartato anche la **singola** composite: i corpi dei 12 fogli sommano **65.438 caratteri**, sopra il tetto di 60.000 di `truncate()`. Verrebbe tagliato in coda proprio `Logiche_Calcolo` (9.396 caratteri, il foglio più tecnico e più prezioso) — e in silenzio.

Ho scartato "**esporre solo l'orchestratore**": in Billy la skill caricata è **testo che il modello segue**, non codice che invoca altre skill. Una skill-orchestratore potrebbe al massimo dire al modello "adesso chiama `loadSkill` sui fogli 03, 04, 06" — ma gli ID non li conosce se non dal manifesto (quindi le micro-skill dovrebbero restare pubblicate, annullando il beneficio), e ogni anello della catena consuma una delle 5 iterazioni. È un'indirezione che paga solo costi.

**Split scelto** (per intento utente, non per numerazione dei fogli):

| Composite | Fogli inclusi | Caratteri corpo | Intento utente coperto |
|---|---|---|---|
| **SAC Design — Modello dati** | 00_README, 01_Architettura, 02_Sorgenti, 03_Dimensioni, 04_Mapping | 25.992 | "com'è fatto il modello e da dove arrivano i dati" |
| **SAC Design — Processo e logiche** | 05_Fasi, 06_Allocazioni, 07_Modello_PL, 08_Maschere, 09_Data_Quality, 10_Flusso_Gov, Logiche_Calcolo | 39.446 | "cosa calcola, chi inserisce, chi approva, con quali formule" |

Entrambi sotto i 60.000 caratteri con ampio margine (~6,5k e ~10k token caricati **una volta** quando servono, contro ~900 token di manifesto pagati **a ogni turno**).

**Interventi sui corpi delle composite** (da fare al momento del seeding, non nel repo Billy):
- premettere al composite 1 un blocco "Metodo" derivato da 02-orchestratore (REGOLA 0: ripartire sempre dall'artefatto più recente, mai sovrascrivere lavoro altrui) e dalla sezione "Ruolo della GenAI" di 03-bbp-extract (dalla BBP incollata deriva dimensioni/sorgenti/fasi candidate, marca come "da confermare", non inventare nulla che non sia nella BBP), **senza** i comandi CLI;
- premettere il contratto colonne dei 12 fogli, preso da 01-spec-json (sostituisce la skill 01);
- **eliminare da ogni foglio la sezione `## Skill SAP di supporto`** (`sap-sac-planning`, `sap-sac-scripting`: puntatori morti, §3.5);
- nella sezione `## Riferimenti incrociati`, i rimandi a fogli **dentro lo stesso composite** restano validi; quelli **verso l'altro composite** vanno riformulati come "annota il requisito e segnala che va completato nell'altra parte del design".

### 4.3 Catalogo proposto: 8 skill, con le description pronte da copiare

---

#### 1. Leva #1 — Devil's Advocate sulle stime — **INVARIATA**

Description attuale corretta: nomina il trigger ("Usare quando hai in mano una stima gg/uomo o un canone/prezzo e devi stressarla prima di esporla"), è unica nel manifesto, il corpo (20 KB) è autosufficiente. Non toccare.

---

#### 2. Leva #2 — Traduttore SAP → valore — **INVARIATA**

Stessa valutazione. Trigger esplicito, nessuna collisione, corpo autosufficiente (15 KB). Non toccare.

---

#### 3. Leva #6 — Scenari di Planning — **description riscritta + FIX DEL CORPO (obbligatorio)**

> **Corpo**: prima di pubblicarla, concatenare `LEVA/leva6-scenari-planning/Scenari_Planning.md` in coda al `SKILL.md`. Senza questo intervento la skill va **non pubblicata**: un routing corretto verso un corpo vuoto è peggio di nessun routing (§3.4).

Description nuova (disambigua da "SAC Design — Processo e logiche", §3.3):

```
Aiuta a scegliere la logica di planning giusta — allocazione costi, driver-based
o rolling forecast — PRIMA di disegnare il modello SAC/BPC: confronta le tre
alternative sul caso concreto (obiettivo budget/forecast/margine, granularità,
driver disponibili, frequenza di aggiornamento), raccomanda quella primaria o una
combinazione, e ne deriva le implicazioni di impostazione: quali dimensioni e
versioni servono, che tipo di data action o allocation step, a che livello di
aggregazione, SAC o BPC, e gli anti-pattern della logica scelta. Usare al
kick-off o in blueprint di un progetto di planning, per confrontare approcci in
una proposta o in gara, o quando un modello esistente "non torna" e il sospetto
è che la logica di fondo sia sbagliata. È una decisione di impostazione, non la
specifica di dettaglio: per scrivere dimensioni, sorgenti e mapping usa "SAC
Design — Modello dati"; per allocazioni, maschere e formule usa "SAC Design —
Processo e logiche di calcolo".
```

---

#### 4. Leva #7 — Anticipatore di gare — **description ritoccata**

Un solo problema: gli utenti chiederanno "scrivimi la risposta alla gara" e la description, che parla di gare e di posizionamento, scatterà a torto. Serve un confine esplicito. Description nuova (identica all'attuale, più il confine in coda):

```
Analizza un capitolato di gara (PDF/testo fornito manualmente) ed estrae in forma
strutturata: lotti, requisiti obbligatori vs premianti, criteri di aggiudicazione
e pesi, rischi/penali, scadenze e un posizionamento (fit con le competenze della
Practice SAP D&A, gap, raccomandazione go/no-go). Usare quando arriva un
capitolato/disciplinare e serve una lettura rapida e decisionale prima di
impegnare risorse sulla risposta. CAVEAT: nessun accesso automatico a banche dati
gare, portali o fonti online - lavora solo sul documento che l'utente incolla o
carica, e si ferma all'analisi e alla raccomandazione go/no-go: NON redige la
risposta né l'offerta tecnica. Programma LEVA - Practice SAP Data & Analytics.
```

---

#### 5. **SAC Design — Modello dati (architettura, sorgenti, dimensioni, mapping)** — **NUOVA (accorpa 01, 02, 03, 04, 05, 06, 07, 08)**

```
Imposta la progettazione di un modello SAP Analytics Cloud partendo da una
Business Blueprint incollata o da requisiti raccolti a voce, e produce le tabelle
di analisi tecnica su come è fatto il modello: la scheda di sintesi del progetto
(scopo, perimetro, convenzioni di naming), l'architettura end-to-end (sistemi
sorgente, layer semantico Datasphere/BW, motore di planning, front-end), il
censimento delle fonti dati con tipo, oggetto e frequenza di aggiornamento
(BW/4HANA, Datasphere, flat file, driver CSV), le dimensioni del modello
(account, entity, time, version, generic) con gerarchie e membri chiave, e il
mapping campo-sorgente verso dimensione-target con le trasformazioni. Usare
quando parte una progettazione o un'analisi tecnica SAC e la domanda è "com'è
fatto il modello e da dove arrivano i dati": dimensioni, gerarchie, versioni,
sistemi alimentanti, mapping dei campi. Per decidere prima quale logica di
planning adottare usa "Scenari di Planning"; per allocazioni, maschere, data
action, data quality e approvazioni usa "SAC Design — Processo e logiche di
calcolo". Non produce file Excel: restituisce le tabelle in chat.
```

---

#### 6. **SAC Design — Processo e logiche di calcolo** — **NUOVA (accorpa 09, 10, 11, 12, 13, 14, 15)**

```
Progetta come funziona il processo di planning in SAP Analytics Cloud, una volta
noto il modello dati, e produce le tabelle di analisi tecnica corrispondenti: le
fasi del ciclo (setup, budget, allocazione, forecast) con input, output, owner e
milestone; le regole di allocazione e ribalto costi con sender, receiver, driver,
base e formula di ripartizione (OPEX centrali sulle entity, costi logistici sui
product group, costi HR per teste); la struttura del conto economico con voci
P&L, account type, segni e formule di aggregazione fino a margine ed EBITDA; le
maschere di data entry (layout righe/colonne, misure, modalità di immissione); le
regole di data quality, quadrature e validazioni; il flusso di approvazione con
ruoli, autorizzazioni e data locking; e le logiche di calcolo scritte con la
sintassi reale delle Advanced Formula SAC — data action, allocation step,
currency conversion, derivazioni, carry-forward. Usare quando il modello è
definito e la domanda è "cosa calcola, chi inserisce i dati, chi approva e con
quali formule". Per scegliere fra allocazione, driver-based e rolling forecast
usa prima "Scenari di Planning"; per dimensioni, sorgenti e mapping usa "SAC
Design — Modello dati". Non produce file Excel: restituisce le tabelle in chat.
```

---

#### 7. **Pianificazione dei carichi di team su un progetto** — **da 16-scheduler, description riscritta**

È l'unica delle 5 skill code-backed la cui logica un modello può davvero eseguire a testo: l'algoritmo greedy è descritto per esteso nel corpo (capacità = giorni lavorativi × fattore bucket × availability × allocation_pct; ordinamento topologico sulle dipendenze; assegnazione al least-loaded fra gli eleggibili; spalmatura proporzionale alla capacità residua). Su un team di 5-10 persone e qualche decina di task è riproducibile a mano.

> **Corpo**: rimuovere la sezione `## Come si usa (CLI di riferimento)` e il riferimento a `_contract/sacfactory/scheduler.py`; sostituire i riferimenti allo "spec" con "la lista che ti fornisce l'utente".

```
Assegna le attività di un progetto alle persone del team e verifica che il piano
stia in piedi. Calcola la capacità di ciascuno periodo per periodo (giorni
lavorativi × disponibilità × percentuale di allocazione, anche a mezzi-mesi),
ordina i task rispettando le dipendenze, assegna quelli senza owner alla risorsa
meno carica fra quelle competenti, distribuisce l'effort sulla finestra temporale
del task e restituisce la matrice dei carichi con la diagnosi: sovraccarichi
oltre capacità, risorse ferme a zero, finestre non compatibili col calendario e
piani complessivamente non fattibili perché la domanda totale supera la capacità.
Usare quando hai una lista di attività con effort in giorni e un team con
disponibilità, e devi decidere chi fa cosa, ribilanciare un mese in sovraccarico,
o capire se un piano regge prima di prendere l'impegno col cliente. Richiede che
l'utente fornisca attività, effort e disponibilità del team: non li recupera da
sistemi esterni.
```

---

#### 8. **Revisione di una progettazione SAC (completezza e coerenza)** — **da 18-qa-validatore, description riscritta**

L'intento "rivedi quello che ho scritto" è distinto da "scrivilo" e merita una voce sua: senza, ricadrebbe a caso su una delle due composite.

> **Corpo**: rimuovere la sezione `## Come si usa (CLI di riferimento)`, i riferimenti a `qa.py` e i codici che puntano a strutture interne dello spec (`DS_ROW_ARITY`, `CAL_FMT`, …); tenere i controlli espressi a parole. Aggiungere in coda i "Criteri di completezza (done when)" dei 12 fogli, che già esistono nei corpi di design ed espressi qui diventano la checklist della revisione.

```
Rivede una progettazione SAC già scritta e dice se è completa e coerente, con
esito PASS/FAIL e la lista dei rilievi ordinati per gravità. Verifica che ci
siano tutti i fogli previsti dall'analisi tecnica e nell'ordine canonico, che
ogni foglio abbia le colonne attese e non sia vuoto, che non ci siano righe con
campi mancanti, che sender e receiver delle allocazioni esistano fra le
dimensioni dichiarate e che le formule siano conservative, che le regole di data
quality coprano le quadrature critiche, che ogni attività del piano abbia un
owner e milestone raggiungibili nel calendario, e che i carichi stiano dentro la
capacità del team. Usare quando ricevi da un collega, o hai appena finito, un
design SAC e devi controllarlo prima di consegnarlo al cliente: è la revisione di
qualcosa che esiste già, non serve a scrivere il design da zero.
```

---

### 4.4 Skill da NON pubblicare, e perché

| Skill | Decisione | Motivo |
|---|---|---|
| `01-spec-json` | **non pubblicare**, fondere | Contratto interno, nessuna domanda utente la attiva (§3.6). Il contratto colonne va in testa al composite "Modello dati". |
| `02-orchestratore` | **non pubblicare**, fondere | Il corpo è ordine di pipeline + `run_factory.py`, inutile in Billy. Ma la sua description è l'unica che attrae la domanda larga: se resta pubblicata **ruba traffico** alle composite e restituisce nulla. La REGOLA 0 va nel preambolo del composite "Modello dati". |
| `03-bbp-extract` | **non pubblicare**, fondere | Il valore è nel parsing .pptx/.docx, impossibile in Billy. La parte semantica ("Ruolo della GenAI": conferma i candidati, non inventare dimensioni, segnala i gap) va nel preambolo del composite "Modello dati", riformulata su "BBP incollata come testo". |
| `04` → `15` (12 fogli) | **non pubblicare singolarmente**, accorpare | §3.3, §3.5, §4.2. |
| `17-render-excel` | **NON PUBBLICARE** | Attrattiva e impossibile insieme: il caso peggiore del catalogo (§3.1). Billy non genera file. Va tenuta fuori, punto. |

Da 22 voci a 8. Manifesto: da ~2.700 a **~1.500 token** per richiesta, con description più lunghe ma **tutte discriminanti** — si paga meno e si routa meglio.

### 4.5 Buchi: domande plausibili che nessuna description copre

| Domanda dell'utente | Skill che sembra adatta | Perché non lo è | Azione |
|---|---|---|---|
| "Quanto costa / quanto dura un progetto SAC Planning?" | leva1 | leva1 **attacca** una stima esistente, non la produce. L'`AM_Stima_Effort.html` è un'app HTML, non una skill. | Buco reale. Serve una skill "stimatore", oppure Billy risponde da `searchKnowledge`. Non forzare un routing. |
| "Fammi un business case con ROI e payback" | nessuna | `business-case/` è un'app HTML senza `SKILL.md`. leva2 fa la *narrazione* di valore, non i numeri. | Buco. Candidata a diventare skill. |
| "Fammi lo status report settimanale del progetto" | nessuna | `pm-status-report/` è app HTML + adapter Python, senza `SKILL.md`. | Buco. Rischio che scatti leva2 a torto. |
| "Scrivimi la risposta tecnica alla gara" | leva7 | leva7 si ferma al go/no-go. | Coperto dal confine aggiunto in §4.3 punto 4. |
| "Ti mando la BBP in PowerPoint, analizzala" | 03-bbp-extract | Billy non legge allegati nel loop dell'agente. | Mitigato: la composite "Modello dati" dice "BBP incollata". Billy deve chiedere il testo. |
| "Mi generi il file Excel dei 15 fogli?" | 17-render-excel | Impossibile. | Risolto non pubblicando 17: Billy dirà che restituisce tabelle in chat. |

---

## 5. Set di prova (35 casi)

Da rigiocare contro il sistema deployato. La colonna **Oggi (22)** stima il comportamento con il catalogo attuale e serve come baseline misurabile.

Legenda esito atteso oggi: **OK** = probabile routing corretto · **AMB** = ambiguo, collisione fra ≥2 skill · **ROTTO** = routing sbagliato o skill ineseguibile.

| # | Domanda utente | Skill attesa (catalogo proposto) | Tipo | Oggi (22) |
|---|---|---|---|---|
| 1 | "Ho stimato 120 giorni per questo progetto SAC Planning, me la sfidi prima che la mandi al cliente?" | Leva #1 | facile | OK |
| 2 | "Quali sono i rischi nascosti in un canone di Application Management su SAC?" | Leva #1 | facile | OK |
| 3 | "Devo spiegare al CFO perché ci serve una Data Action per le allocazioni" | Leva #2 | facile | OK |
| 4 | "Come presento il valore di Datasphere all'IT manager, non al CFO?" | Leva #2 | facile | OK |
| 5 | "Il cliente vuole un rolling forecast, il team propone budget annuale con allocazioni. Cosa consiglio?" | Leva #6 | facile | OK |
| 6 | "Che differenza c'è fra allocazione costi e driver-based, e quando conviene una o l'altra?" | Leva #6 | ambiguo | AMB (leva6 vs 06_Allocazioni) |
| 7 | "Il modello di planning del cliente non torna, da cosa parto a guardare?" | Leva #6 | ambiguo | AMB |
| 8 | "È arrivato questo capitolato, conviene partecipare?" | Leva #7 | facile | OK |
| 9 | "Estraimi requisiti obbligatori e criteri di aggiudicazione da questo disciplinare" | Leva #7 | facile | OK |
| 10 | "Scrivimi la risposta tecnica per il lotto 2 di questa gara" | **nessuna** (Billy deve dire che si ferma al go/no-go) | confine | ROTTO (leva7 scatta e va oltre il suo scopo) |
| 11 | "Aiutami a preparare il design SAC per un cliente retail" | SAC Design — Modello dati (poi eventualmente Processo e logiche) | **ambiguo chiave** | **ROTTO** (12 candidati; probabile 02 o 17) |
| 12 | "Devo fare l'analisi tecnica di un progetto SAC Planning, da dove parto?" | SAC Design — Modello dati | ambiguo | **ROTTO** |
| 13 | "Ti incollo la Business Blueprint del cliente, ricavane la struttura del modello" | SAC Design — Modello dati | ambiguo | ROTTO (03 pretende un .pptx) |
| 14 | "Quali dimensioni servono per un modello SAC Planning di un retailer?" | SAC Design — Modello dati | facile | OK (parziale) |
| 15 | "Da dove prendo i dati per il modello e con che frequenza li aggiorno?" | SAC Design — Modello dati | ambiguo | AMB (02_Sorgenti vs 04_Mapping) |
| 16 | "Come mappo il campo KOSTL di SAP sulla dimensione Cost Center?" | SAC Design — Modello dati | facile | OK |
| 17 | "Che gerarchie metto sulla dimensione Entity per un gruppo con 200 negozi?" | SAC Design — Modello dati | facile | OK |
| 18 | "Quali versioni mi servono fra Actual, Budget e Forecast e come le uso?" | SAC Design — Modello dati **o** Leva #6 (entrambe accettabili) | ambiguo per costruzione | AMB |
| 19 | "Come alloco gli OPEX centrali sulle entity?" | SAC Design — Processo e logiche | **ambiguo chiave** | AMB a 3 (06 vs Logiche_Calcolo vs leva6) |
| 20 | "Scrivimi l'Advanced Formula per il carry-forward del saldo iniziale" | SAC Design — Processo e logiche | facile | OK |
| 21 | "Come struttura le voci di conto economico fino all'EBITDA?" | SAC Design — Processo e logiche | facile | OK |
| 22 | "Devo convertire in EUR i dati delle controllate: come lo imposto in SAC?" | SAC Design — Processo e logiche | facile | OK |
| 23 | "Come faccio le maschere di inserimento budget per i responsabili di negozio?" | SAC Design — Processo e logiche | facile | OK |
| 24 | "Chi approva il budget e come blocco i dati dopo l'approvazione?" | SAC Design — Processo e logiche | ambiguo | AMB (05_Fasi vs 10_Flusso_Gov) |
| 25 | "Che controlli di qualità metto sui dati di planning?" | SAC Design — Processo e logiche | ambiguo | AMB (09_DQ vs 18_QA) |
| 26 | "Ho già dimensioni e sorgenti, ora devo definire le fasi del processo di budget" | SAC Design — Processo e logiche | confine fra le due composite | OK |
| 27 | "Ho 8 persone e 40 attività da distribuire sui prossimi 6 mesi, chi fa cosa?" | Pianificazione carichi di team | facile | OK |
| 28 | "Marzo è sovraccarico per due risorse, come ribilancio?" | Pianificazione carichi di team | facile | OK |
| 29 | "Questo design SAC che mi ha passato il collega è completo?" | Revisione di una progettazione SAC | ambiguo | AMB (18 vs 09_DQ) |
| 30 | "Mi generi il file Excel con i 15 fogli di progettazione?" | **nessuna** (Billy deve dire che restituisce tabelle in chat, non file) | negativo chiave | **ROTTO** (17 promette l'xlsx) |
| 31 | "Il progetto è in ritardo, come lo racconto allo steering?" | **nessuna** (searchKnowledge; rischio che scatti leva2 a torto) | negativo | ROTTO (leva2 plausibile ma fuori scopo) |
| 32 | "Fammi un business case con ROI e payback per questo progetto" | **nessuna** (searchKnowledge o "non lo so") | negativo | ROTTO (leva2 plausibile) |
| 33 | "Quanto costa in media un progetto SAC Planning?" | **nessuna** (searchKnowledge; leva1 sfida una stima, non la produce) | negativo | ROTTO (leva1 plausibile) |
| 34 | "Qual è la policy trasferte della practice?" | **nessuna** (searchKnowledge) | negativo facile | OK |
| 35 | "Cos'è la REGOLA 0 della SAC Factory?" | **nessuna** (searchKnowledge sui documenti) | negativo | OK oggi via 02, ma è meta-conoscenza, non una procedura da eseguire |

**Come misurare**: per ogni caso si registra (a) quale/i `loadSkill` sono stati chiamati, (b) se coincidono con l'attesa, (c) per i casi "nessuna", se Billy ha evitato di caricare skill. Gli eventi sono già emessi dal loop (`emit({ type: 'tool', name, args })` in `agent.js`), quindi la misura è estraibile senza modifiche al codice. Baseline attesa oggi: ~**20/35**; target dopo la riscrittura: **≥ 31/35**.

---

## 6. Cosa resta incerto

1. **La soglia esatta di collisione fra le due composite.** I casi 18, 24 e 26 sono di confine per costruzione: "versioni" appartiene sia alle dimensioni sia alla scelta di logica; "fasi del processo" e "flusso di approvazione" sono vicine. Ho inserito clausole di rinvio reciproco nelle description, ma se il set di prova mostra oscillazione su questi casi la soluzione naturale è un'unica composite da ~65k caratteri — che però **non entra** nel `truncate()` a 60.000. Andrebbe allora alzata quella costante in `agent.js`: decisione fuori dal mio perimetro (non ho toccato il repo).

2. **Se 18-qa-validatore meriti davvero una voce propria.** L'intento "rivedi" è distinto da "scrivi", ma i criteri di completezza sono già dentro i corpi delle composite: c'è ridondanza. Ho scelto di pubblicarla perché "rivedi il mio design" non avrebbe altrimenti una destinazione univoca, ma è la decisione su cui ho meno convinzione. Da verificare con i casi 25 e 29.

3. **Se 16-scheduler produca risultati affidabili senza il codice.** Ho concluso di sì per team piccoli, sulla base della descrizione completa dell'algoritmo nel corpo. Non l'ho verificato empiricamente: un modello che calcola a mano capacità e spalmatura su 40 task e 8 risorse può sbagliare l'aritmetica. Da testare sui casi 27-28 prima di dichiararla `certified`.

4. **La qualità reale del corpo di leva6 dopo la concatenazione.** Ho letto `SKILL.md` e la sua dichiarazione di dipendenza, ma non il contenuto di `Scenari_Planning.md`: non so se, una volta concatenato, il totale resti sotto i 60.000 caratteri né se il testo risultante sia autoconsistente. **Da verificare prima del seeding.**

5. **Il peso del campo `title` come segnale di routing.** Il seeder usa l'H1 del corpo (`SAC Design - Foglio 04 Mapping Tables`) e il manifesto lo espone come "Titolo:". Ho ragionato assumendo che il modello pesi soprattutto la description, ma il titolo contribuisce — e i titoli attuali delle 12 skill di design sono anch'essi quasi-identici, il che aggrava §3.3. Le due composite vanno create con titoli espliciti, non con un H1 numerato.

6. **Nessuna verifica end-to-end.** Non ho eseguito niente: il backend è su CF e questo audit è documentale. Tutte le stime di comportamento del modello sono inferenze dalle description, non misure. È esattamente il motivo per cui esiste il §5.
