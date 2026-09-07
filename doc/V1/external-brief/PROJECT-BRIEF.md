# Billy — brief di progetto per sviluppo frontend

> Questo documento spiega **cosa è Billy, a chi serve, e come dovrebbe apparire**. Il compagno [API-CONTRACT.md](API-CONTRACT.md) spiega **esattamente come parlare col backend**. Insieme bastano per costruire il frontend senza altro contesto.

## Perimetro di questo incarico

**Costruire SOLO il frontend.** Il backend (SAP CAP, Node.js, HANA Cloud, SAP AI Core/Claude) è **già scritto, deployato, e fisso** — non va toccato, modificato, né ne va proposta una versione alternativa. Ogni endpoint necessario è in API-CONTRACT.md, verificato con chiamate reali contro l'ambiente di sviluppo. Se manca qualcosa che sembra necessario, va segnalato come domanda, non inventato o aggirato lato client.

---

## 1. Cos'è Billy

Uno strumento interno aziendale con due funzioni che condividono gli stessi dati:

1. **Chat RAG**: i colleghi fanno domande in linguaggio naturale sulla documentazione della practice (policy, procedure, guide) e ricevono risposte con **citazioni cliccabili** verso i documenti originali, con indicazione esplicita di quanto la fonte sia affidabile (vedi §3).
2. **Marketplace/catalogo**: gli stessi colleghi caricano documenti (o link a tool/skill/applicazioni), che passano da una **coda di revisione** prima di diventare visibili e citabili da Billy.

Non è un prodotto consumer, non è una landing page di marketing: è uno strumento che colleghi useranno **ogni giorno per lavoro**. Deve essere piacevole ma soprattutto **rapido, leggibile, affidabile**.

## 2. Le due superfici principali

### 2.1 Chat Billy (la funzione più usata, priorità massima)

- Una domanda, una risposta in **Markdown** (grassetto, elenchi, blockquote di avviso — il backend li genera già, il frontend deve solo renderizzarli correttamente, non a testo semplice)
- Sotto ogni risposta: le **fonti citate**, ognuna con titolo cliccabile (porta al dettaglio dell'asset nel catalogo) e un **badge di stato di certificazione** visivamente distinto (vedi palette §3)
- Nessuno streaming per ora (la risposta arriva tutta insieme, dopo qualche secondo) — serve uno stato di caricamento chiaro, non un semplice spinner generico: l'attesa può essere di 5-15 secondi (embedding + ricerca + generazione LLM), va comunicato che sta "pensando", non che l'app è bloccata

### 2.2 Catalogo/Marketplace

- **Lista asset pubblicati**: titolo, tipo (documento/skill/tool/applicazione/interfaccia/altro), badge di certificazione, ricerca (full-text istantanea + un'opzione esplicita di "ricerca approfondita" che usa il motore semantico — sono due endpoint diversi, vedi API-CONTRACT §2.9/§2.10, l'utente deve capire che sono due modalità diverse, non la stessa ricerca con risultati diversi per caso)
- **Dettaglio asset**: metadati, allegato scaricabile se presente (vedi API-CONTRACT §2.7/§2.8)
- **Upload**: form con titolo/descrizione/tipo + **testo incollato OPPURE file** (uno dei due, non entrambi — chiarire bene nella UI che sono alternative, non campi da riempire insieme)
- **Coda di revisione**: vista per chi ha ruolo di certificatore — lista di ciò che aspetta approvazione, azione approva/rifiuta. Due tipi di elementi diversi convivono in questa coda (contenuto nuovo vs. rinnovo di un asset scaduto) e vanno **distinti visivamente**, non trattati come la stessa cosa (vedi API-CONTRACT §2.4)

### 2.3 Leaderboard/Gamification — COSTRUIRE CON DATI FINTI

Il backend per punti/classifica/stagioni **non esiste ancora** (arriverà in una fase successiva del progetto). Se si costruisce questa pagina ora:
- Usare dati mock chiaramente isolati (un file/modulo a parte, facile da rimuovere)
- Progettare comunque i componenti pensando che verranno ricollegati a un vero endpoint in futuro (stessa forma dati ragionevole: punti totali, classifica per "stagione", storico eventi punti)
- **Non è la priorità** — se il tempo stringe, è la pagina più sacrificabile

---

## 3. Direzione visiva

**Riferimento di tono**: strumenti B2B che riescono a essere curati senza risultare "aziendalese generico" — **Linear**, **Raycast**, **Stripe** (dashboard), **Claude.ai** (per la UI di chat specificamente). Non un sito vetrina, non un tema SAP Fiori standard.

**Pattern ricorrente nei riferimenti sopra, da replicare:**
- **Dark mode come tema di prima classe**, non un semplice invert di un tema chiaro
- **Un solo colore accento** per tutto (stati, pulsanti primari, elementi attivi) — il resto della palette resta neutro (grigi/neri). Scelta del colore accento aperta, ma **uno solo**, usato con disciplina
- Densità alta dove serve leggere/scansionare rapidamente (liste, tabelle, coda di revisione), spaziosità dove conta la lettura distesa (i messaggi della chat)

**Palette di stato per la certificazione** (usata sia in chat che nel catalogo — deve essere **coerente ovunque compaia**, stesso colore = stesso significato in ogni punto dell'app):
| Stato | Significato | Indicazione colore |
|---|---|---|
| `certified` | Verificato da un certificatore, valido | verde/positivo |
| `certifiedOutdated` | Era verificato, la validità è scaduta | ambra/attenzione (non rosso — non è "sbagliato", è "da rinnovare") |
| `community` | Mai verificato da nessuno | grigio/neutro, non un colore di allarme |
| `deprecated` | Ritirato (in pratica non comparirà quasi mai lato utente finale, escluso a monte dal retrieval) | grigio scuro/disattivato |

**Componenti pronti da valutare invece di costruire tutto da zero:**
- **shadcn/ui** come base di componenti (accessibili, il codice si copia nel progetto, nessun lock-in)
- **Magic UI** per micro-interazioni discrete (apparizione messaggi, hover), più adatto a un tool di lavoro quotidiano di quanto lo sia Aceternity UI (che è più "landing page")
- Per l'eventuale pagina Leaderboard: vale la pena guardare il kit **Trophy** (componenti Achievement/Leaderboard/Points/Streak, shadcn-based, MIT) prima di costruire da zero — anche solo come riferimento di struttura, dato che qui i dati sono comunque mock

**Un solo momento "di impatto" concesso, non di più:** un elemento visivo distintivo (anche 3D/animato, es. via Spline) è accettabile **solo** sulla schermata iniziale della Chat Billy, mai su superfici che si aprono ripetutamente durante il lavoro quotidiano (catalogo, coda di revisione, form). Se in dubbio, meno è meglio — l'obiettivo è "bello e usabile ogni giorno", non "impressionante la prima volta e stancante dopo una settimana".

**Cosa evitare esplicitamente:**
- Parallax o animazioni d'entrata su ogni elemento della pagina
- 3D pesante fuori dall'unico punto concesso sopra
- Temi chiaro/scuro entrambi curati a metà — sceglierne uno (scuro, per coerenza con i riferimenti) e farlo bene, il toggle chiaro/scuro non è richiesto

---

## 4. Cose che il frontend deve gestire correttamente (non ovvie dal solo contratto API)

- **Le chiavi dei campi non sono uniformi tra endpoint** (`ID` vs `assetId` per lo stesso concetto, a seconda dell'endpoint) — vedi dettaglio in API-CONTRACT.md, è così lato server e non cambierà per questo incarico
- **`answer` di `askBilly` è Markdown**, va renderizzato con un parser Markdown (non `dangerouslySetInnerHTML` su testo grezzo, non testo semplice)
- **Un asset caricato non appare subito nel catalogo** — resta invisibile finché non approvato: la UI di upload deve comunicarlo chiaramente ("in revisione", non un semplice "salvato con successo" che implica visibilità immediata)
- **Nessun login per ora** — non costruire schermate di autenticazione, non nascondere funzionalità in base a un utente che non esiste ancora lato client (il backend blocca comunque con 403 chi non ha i permessi, vedi API-CONTRACT §3)
- Gli errori del backend arrivano già con un messaggio leggibile in italiano — mostrarli diretti, non serve reinterpretarli

## 5. Cosa consegnare

- Il codice del frontend, con istruzioni per l'esecuzione locale (framework a scelta di chi implementa — nessun vincolo tecnico imposto qui, la scelta React/altro è aperta)
- Se emergono domande o ambiguità sul contratto API o sul comportamento atteso, vanno segnalate esplicitamente, non risolte per assunzione
