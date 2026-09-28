# Causa A — "Billy nomina la skill ma non la carica": fix del system prompt e rimisura

Data: 2026-09-28 · Sistema: Billy su CF (`billy-srv`, `/rest/billy/askBillyStream`)
File toccato: `billy-app/srv/lib/agent.js` — **solo** `buildSystemPrompt()`. Nessuna skill spubblicata o modificata, nessuna description riscritta, nessuna dipendenza nuova.
Catalogo al momento della misura: **22 skill + 8 documenti pubblicati**, identico alla misura di riferimento (verificato via `GET /rest/catalog/Asset`).

---

## 1. Ipotesi sulla causa

Il difetto misurato in `skill-routing-results.md` §4 F1 (9 casi su 35) non è di routing: Billy sceglie la skill giusta e spesso la nomina, ma non chiama `loadSkill`. Tre concause nel prompt, tutte nel modo in cui il manifesto veniva presentato:

1. **La regola era condizionale-descrittiva, senza vincolo di ordine.** "Se una delle skill elencate sotto è pertinente, caricala ed eseguila" non dice *quando* caricarla. Il modello leggeva `loadSkill` come "avvia la procedura", quindi la rimandava a quando avrebbe avuto gli input: nei casi 8, 9, 13, 29 l'utente fa riferimento a un documento che non ha allegato, e Billy chiedeva il documento **invece di** caricare la skill. Caricare è leggere le istruzioni, non eseguirle: l'ordine giusto è *carica prima, chiedi dopo*.
2. **Mancava la regola che la description non è la skill.** Niente nel prompt impediva di rispondere dalla `description`. Nel caso 24 Billy riparafrasava la voce di manifesto come se fosse il corpo.
3. **L'etichetta `Quando usarla:` legittimava la lettura sbagliata.** Introduce la description come istruzione d'uso già valida, non come criterio di scelta di un indice. È anche il canale per cui `spec.json` finiva in 14 risposte su 35 (F2): stava nel prompt di ogni richiesta, senza che nulla lo marcasse come gergo interno.

## 2. La modifica

Diff su `buildSystemPrompt()` (le regole 1 e 2 su `searchKnowledge` e certificazione sono invariate):

- `Quando usarla:` → **`Quando sceglierla:`** nella riga di manifesto, e riga di intestazione sotto `## Skill disponibili`: *"Indice per la scelta, non contenuto: per usare una di queste skill devi caricarla con `loadSkill`."*
- **Regola 3 (nuova)** — l'elenco è *solo un indice*, la riga "Quando sceglierla" **non è** la skill, non è contenuto da riportare e non basta mai per rispondere.
- **Regola 4 (era la 3, resa prescrittiva)** — *"**devi** chiamare `loadSkill` [...] **prima di scrivere la risposta**"*, con le tre scappatoie chiuse esplicitamente: anche se pensi di sapere già la risposta, anche se ti manca un documento o un dato dell'utente (*carica prima, chiedi dopo*), anche se la userai solo in parte.
- **Regola 5 (nuova)** — non nominare in risposta una skill che non hai caricato in questo turno.
- **Regola 6 (nuova, contrappeso)** — se nessuna skill è pertinente, non caricarne nessuna; caricare a sproposito è un errore tanto quanto non caricare. Serve a proteggere i casi 31-34.
- **Regola 7 (nuova, per il caso 10)** — esegui una skill entro i suoi confini, dichiara cosa resta fuori dal suo scopo invece di accettare l'incarico intero.
- **Regola 9 (era la 5, estesa)** — divieto di usare con l'utente i termini interni che compaiono nell'indice (nomi di file, script, artefatti tipo `spec.json`) se non arrivano dal corpo di una skill caricata.

## 3. Risultato: 22/35 → **27/35**

35 casi rigiocati verbatim, uno per conversazione, senza history, stessa misura (evento SSE `loadSkill` + testo integrale).

| # | Prima | Dopo | Δ |
|---|---|---|---|
| 1 | `leva1` OK | `leva1` | OK |
| 2 | *(nessuna)* NO-SKILL | **`leva1`** | **GUARITO** |
| 3 | `leva2` OK | `leva2` | OK |
| 4 | `leva2` OK | `leva2` | OK |
| 5 | `leva6` OK | `leva6` | OK |
| 6 | `leva6` OK | `leva6` | OK |
| 7 | *(nessuna)* NO-SKILL | `09_Data_Quality` (attesa: Leva #6) | KO (cambia sintomo) |
| 8 | *(nessuna)* NO-SKILL | **`leva7`** | **GUARITO** |
| 9 | *(nessuna)* NO-SKILL | **`leva7`** | **GUARITO** |
| 10 | *(nessuna)*, accetta — KO | *(nessuna)*, accetta ancora | KO |
| 11 | `02-orchestratore` KO | `02-orchestratore` | KO |
| 12 | `02-orchestratore` KO | `02-orchestratore` | KO |
| 13 | *(nessuna)* NO-SKILL | *(nessuna)* | NO-SKILL |
| 14 | `03-dimensioni` OK | `03_Dimensioni` | OK |
| 15 | *(nessuna)* NO-SKILL | *(nessuna)* | NO-SKILL |
| 16 | *(nessuna)* NO-SKILL | **`04_Mapping_Tables`** | **GUARITO** |
| 17 | `03-dimensioni` OK | `03_Dimensioni` | OK |
| 18 | `leva6` OK | `leva6` | OK |
| 19 | `06_Allocazioni`+`leva6` OK | `06_Allocazioni` | OK (più pulito) |
| 20 | `Logiche_Calcolo` OK | `Logiche_Calcolo` | OK |
| 21 | `07_Modello_PL` OK | `07_Modello_PL` | OK |
| 22 | `Logiche_Calcolo` OK | `Logiche_Calcolo` | OK |
| 23 | `16-scheduler`+`08_Maschere` OK con rumore | `08_Maschere_Input` | OK (rumore sparito) |
| 24 | *(nessuna)* NO-SKILL | **`10_Flusso_Governance`** | **GUARITO** |
| 25 | `09_Data_Quality` OK | `09_Data_Quality` | OK |
| 26 | `05_Fasi_Processo` OK | `05_Fasi_Processo` | OK |
| 27 | `16-scheduler` OK | `16-scheduler` | OK |
| 28 | `16-scheduler` OK | `16-scheduler` | OK |
| 29 | *(nessuna)* NO-SKILL | **`18-qa-validatore`** | **GUARITO** |
| 30 | `01-spec-json`+`17-render-excel` SPURIA | `17-render-excel` | SPURIA (meno grave) |
| 31 | *(nessuna)* OK | *(nessuna)* | OK |
| 32 | *(nessuna)* OK | **`leva2`** | **REGRESSIONE** |
| 33 | *(nessuna)* OK | *(nessuna)* | OK |
| 34 | *(nessuna)* OK | *(nessuna)* | OK |
| 35 | `02-orchestratore` OK | `02-orchestratore` | OK |

**Punteggio: 22/35 → 27/35** (63% → 77%). 6 dei 9 casi "causa A" guariti (2, 8, 9, 16, 24, 29), **1 regressione** (32), netto **+5**.

### 3.1 I 3 casi "causa A" non guariti

- **Caso 7** ("il modello di planning non torna, da cosa parto?"): non è più NO-SKILL — Billy ora carica `09_Data_Quality`. È un cambio di sintomo, non una guarigione: l'attesa era Leva #6. La regola 4 ha reso obbligatorio il caricamento, ma su una domanda genuinamente ambigua il modello sceglie il foglio di troubleshooting dati invece del selettore di logica di planning. Non è risolvibile dal prompt: è un problema di description di `leva6`.
- **Casi 13 e 15**: restano senza skill. Il 13 è il caso più ostinato — Billy risponde 225 caratteri ("appena la ricevo, **caricherò la skill appropriata**"), cioè applica la regola 5 (non nomina una skill non caricata) ma non la regola 4 (carica prima, chiedi dopo). Con un messaggio utente che è puramente un preambolo ("ti incollo la BBP") il modello non considera la richiesta ancora iniziata. Il 15 riceve dalla knowledge base una risposta certificata e concreta (architettura MINERVA, task chain a 30 minuti) e si ferma lì: sostanzialmente una buona risposta che la misura conta come fallimento.

### 3.2 La regressione (caso 32)

"Fammi un business case con ROI e payback per questo progetto" ora carica `leva2 — Traduttore SAP → valore`. È l'esatto rischio segnalato: la regola 4 prescrittiva allarga la soglia di pertinenza, e `leva2` (tradurre feature tecniche in valore di business) è *quasi* pertinente a un business case.

Verificata la stabilità con ripetizioni (il routing LLM non è deterministico):

| Caso | Ripetizioni | Esito |
|---|---|---|
| 32 | 4 | `leva2` in 3/4 — **regressione reale, non rumore** |
| 31 | 3 | *(nessuna)* 3/3 — stabile |
| 33 | 3 | *(nessuna)* 3/3 — stabile |
| 34 | 1 | *(nessuna)* — stabile |

La regola 6 ("caricare a sproposito è un errore tanto quanto non caricarla") ha tenuto su 31, 33 e 34, cioè sui tre casi che l'audit temeva di più. Ha ceduto solo sul 32. Il danno pratico è contenuto — la risposta prodotta è un business case ragionevole con `[da quantificare]` sulle voci senza dati — ma per il criterio di misura è un falso positivo.

### 3.3 Effetto collaterale positivo: il gergo interno sparisce (F2)

`spec.json` nel testo della risposta: **da 14/35 a 3/35** (casi 29, 30, 35). E in tutti e tre una skill il cui corpo contiene legittimamente il termine è stata caricata: **zero casi di trapelamento dal manifesto**, che era il difetto vero. Il caso 2 (canone AM con "spec.json" come deliverable contrattuale) non si ripete.

## 4. Il caso 10 non è risolto dalla stessa modifica

La regola 7 sui confini **non è bastata**, e il motivo è strutturale: presuppone che una skill sia stata caricata, mentre nel caso 10 `leva7` non scatta affatto. Billy risponde *"per analizzare il capitolato e redigere una risposta tecnica adeguata, devo prima leggere il documento"* — accetta l'incarico prima ancora di considerare le skill. La regola 7 va quindi considerata inefficace così com'è.

Serve una **regola separata**, di natura diversa: non un vincolo sull'esecuzione di una skill, ma un confine di capacità di Billy dichiarato nel prompt, indipendente dalle skill caricate — del tipo *"non redigi offerte, risposte tecniche di gara o deliverable contrattuali: sull'analisi di gare ti fermi al go/no-go e all'estrazione dei requisiti"*. Non l'ho aggiunta in questo giro per non mescolare due interventi nella stessa misura. Vale lo stesso ragionamento per la promessa di generare un `.xlsx` (caso 30): è un confine di capacità, non un problema di routing, e le due cose si risolverebbero con la stessa regola.

## 5. Cosa resta aperto

- **Caso 32**: unica regressione. Da valutare se vale una restrizione mirata (il confine fra "tradurre in valore" e "produrre un business case" sta nella description di `leva2`, non nel prompt) o se +5 netti la rendono accettabile.
- **Casi 10 e 30**: confini di capacità, richiedono la regola separata di §4.
- **Casi 11, 12, 30, 35**: restano quelli di `02-orchestratore` / `17-render-excel`, cioè esattamente i casi che la §5.1 di `skill-routing-results.md` risolve spubblicando. Non toccati per scelta: il catalogo è stato lasciato a 22 skill perché il confronto prima/dopo fosse valido. Con quelle spubblicate il punteggio salirebbe ulteriormente.
- **Caso 7**: problema di description di `leva6`, non di prompt.
- **Casi 13 e 15**: casi limite in cui la mancata `loadSkill` produce comunque una risposta sensata; da decidere se sono davvero fallimenti.
- **F3 (modalità intervista)** non è stato affrontato: è nei corpi delle skill, non nel prompt. Nei casi 26 e 27 le risposte restano corte e interrogative.
- **Nota operativa**: il `mbt build` ha impacchettato l'albero di lavoro corrente, che conteneva modifiche frontend non committate di altre sessioni. Il backend misurato è quello di questo fix; il frontend deployato non corrisponde all'ultimo commit.

## 6. Dati grezzi

Eventi SSE e risposte integrali dei 35 casi, non versionati: `%TEMP%\rt35b\out\case*.json`, riepilogo in `%TEMP%\rt35b\summary.tsv`.
