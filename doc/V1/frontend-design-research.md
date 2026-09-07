# Ricerca frontend — direzione visiva per Billy

> Documento di **ricerca e proposta**, non implementazione. Nasce dalla richiesta esplicita di esplorare come rendere il frontend di Billy figo/interattivo/moderno, restando adatto a un contesto lavorativo. Nessuna decisione qui è vincolante — la Fase 2 (catalogo) prosegue in parallelo secondo `roadmap.md`, questo documento serve per quando si arriva alla Fase 4 (frontend).

---

## 1. Il problema con la scelta originaria (D4: UI5 Web Components)

HANDOFF.md D4 prevedeva React + UI5 Web Components su HTML5 App Repository. Tecnicamente valido (è lo standard SAP), ma **esteticamente è il "look SAP"**: pulito, accessibile, ma percepito come corporate/generico anche nella sua versione più recente (tema Horizon: più arrotondato, colori più vivaci, ma resta riconoscibilmente "un tool SAP" — [SAP Design System](https://www.sap.com/design-system/fiori-design-android/v25-4/foundations/colors/horizon-theme)).

**Non è una critica alla decisione originaria** (era la scelta "sicura" per l'integrazione BTP), ma se l'obiettivo ora è "il sito più figo possibile in un contesto lavorativo", UI5 Web Components non è lo strumento giusto per arrivarci: è ottimo per coerenza enterprise, pessimo per distintività.

**Proposta**: sganciare il frontend da UI5 Web Components, tenere CAP com'è (il backend non cambia). Il frontend diventa un progetto React (o altro) totalmente separato, servito comunque da HTML5 App Repository + Approuter (D4 resta valida per il *meccanismo di hosting*, cambia solo la libreria di componenti).

---

## 2. Riferimenti estetici concreti (non tool, siti/prodotti reali da guardare)

La ricerca su enterprise/B2B "che riescono a essere belli senza perdere serietà" converge su un pattern preciso, riscontrato in più fonti indipendenti:

> **Dark-mode di default + un solo colore accento neon** (Linear = viola, Raycast = rosso, Mercury = verde lime, Cursor = ciano). Il resto della palette resta neutro (grigi/neri), la densità informativa è alta dove serve (tabelle, liste) e spaziosa dove conta la lettura (chat).

**Prodotti da guardare come riferimento diretto** (non gallerie astratte — prodotti veri, gratuiti da esplorare):
- **[Linear](https://linear.app)** — il riferimento per "tool potente ma bellissimo". Studiare soprattutto: dark mode come tema di prima classe (non un semplice invert), transizioni istantanee, comandi da tastiera
- **[Raycast](https://raycast.com)** — palette scura + accento rosso, micro-animazioni mai invasive
- **[Stripe](https://stripe.com)** (sito e dashboard) — "il colore comunica solo stato", tabelle dense fatte bene
- **[Vercel](https://vercel.com)** — skeleton/loading state curati quanto le view con dati
- **[Claude.ai](https://claude.ai)** e **ChatGPT** — riferimento diretto per la UI di chat: colonna singola, gerarchia tipografica netta, spaziatura generosa tra messaggi, contrasto sobrio utente/assistente (non bolle colorate aggressive)

---

## 3. Gallerie per ispirazione libera (quando si vuole navigare ed esplorare)

- **[Awwwards](https://www.awwwards.com)** — il più ampio, aggiornamento quotidiano, ottimo per animazioni/interazioni/storytelling
- **[Godly](https://godly.website)** — selezione più piccola (3-5 siti/settimana) ma tutti di alto livello, si scorre in 10 minuti
- **[Land-book](https://land-book.com)** — meno "wow" fine a se stesso, più siti concretamente ben fatti e utilizzabili
- **[Mobbin](https://mobbin.com)** — specifico per UI di **app** (non landing page), utilissimo per pattern di dashboard/chat/liste

Strategia consigliata dalle fonti: **usare Awwwards/Godly per rubare idee di interazione, Land-book per verificare che restino utilizzabili** — non prendere ispirazione solo da siti-vetrina, altrimenti si rischia di costruire qualcosa di bello ma scomodo da usare ogni giorno per lavoro.

---

## 4. Stack tecnico consigliato (se si conferma React)

| Livello | Libreria | A cosa serve |
|---|---|---|
| Base componenti | **[shadcn/ui](https://ui.shadcn.com)** | Componenti puliti, accessibili, il codice si copia nel progetto (nessun lock-in di libreria) — diventato uno standard de facto nel 2026 |
| Motion sui componenti | **Motion** (ex Framer Motion) | Micro-interazioni (hover, transizioni tra stati, apparizione messaggi chat) |
| Effetti "wow" mirati | **[Aceternity UI](https://ui.aceternity.com)** | Spotlight, parallax, card 3D — da usare con parsimonia, non su tutta l'interfaccia (loro stessi lo consigliano solo per landing/hero) |
| Micro-interazioni raffinate | **Magic UI** | 150+ componenti animati open source, più "discreti" di Aceternity — buon compromesso per un tool di lavoro |
| Gamification pronta all'uso | **[Trophy UI kit](https://trophy.so/blog/gamification-ui-libraries)** | **Scoperta rilevante**: kit shadcn-based, MIT, con 17 componenti già pronti divisi in Achievement/Leaderboard/Points/Streak — **corrisponde quasi esattamente** al nostro modello `PointEvent`/`Season`/leaderboard (roadmap Fase 3). Codice proprio, nessun lock-in, si installa via CLI shadcn |
| 3D (se lo si vuole davvero) | **[Spline](https://spline.design)** (no-code) → export React/R3F, oppure **React Three Fiber** direttamente | Vedi §5 sotto — da usare con moderazione |
| Scroll fluido (opzionale) | **Lenis** + **GSAP** (solo se si fa una landing con scroll narrativo) | Non necessario per un tool di lavoro quotidiano — più adatto a una eventuale pagina "about/onboarding" di Billy |

---

## 5. Sul "3D": raccomandazione onesta

Il 3D vero (Three.js/React Three Fiber/Spline) è impressionante ma **va usato con grande parsimonia in un tool di lavoro quotidiano**: nessuno dei riferimenti enterprise sopra (Linear, Raycast, Stripe, Vercel) usa 3D pesante nell'app stessa — lo usano al massimo nella landing page pubblica, mai nell'interfaccia che si usa 8 ore al giorno.

**Dove avrebbe senso per Billy, con parsimonia:**
- Una **scena 3D leggera e astratta** (non figurativa) sulla landing/hero di Billy — es. una forma fluida animata che reagisce all'hover, generata in Spline in modo no-code, esportata come componente React
- **Non** metterlo nella chat stessa, nel catalogo, o nella leaderboard — lì serve leggibilità e velocità, non spettacolo

**Dove NON ha senso**: dashboard, tabelle, form di upload — qualunque superficie che si usa ripetutamente per lavorare. Un widget 3D che gira in background su una pagina che si apre 50 volte al giorno diventa fastidioso, non "figo", dopo la seconda settimana.

---

## 6. Proposta di direzione concreta per Billy

Sintesi delle sezioni precedenti in una proposta coerente:

1. **Tema**: dark-mode di default, un solo colore accento (da scegliere — es. un viola/blu distintivo, coerente con eventuale brand Accenture ma non identico al viola Accenture corporate per non creare confusione)
2. **Chat Billy**: layout stile Claude.ai — colonna singola, streaming token-by-token, citazioni come chip cliccabili colorati per stato di certificazione (verde=certified, ambra=certifiedOutdated, grigio=community — coerente con D10)
3. **Catalogo**: densità alta, ispirato a tabelle Stripe/Linear — filtri rapidi, ricerca prominente (coerente con Fase 2: full-text di default + "ricerca approfondita" semantica opt-in)
4. **Leaderboard/gamification**: componenti Trophy UI kit, adattati al nostro modello `Season`/`PointEvent`, invece di costruire tutto da zero
5. **Un solo momento "wow" misurato**: scena 3D astratta leggera in Spline sulla landing/hero della Chat Billy — non altrove
6. **Component base**: shadcn/ui + Magic UI per le micro-interazioni diffuse, Aceternity solo su quell'unico hero

**Cosa NON fare**: parallax ovunque, animazioni di entrata su ogni singolo elemento, 3D pesante su pagine che si aprono spesso, temi chiari-e-scuri entrambi curati a metà (sceglierne uno e farlo bene, il pattern osservato è "dark come prima classe", non light con dark-mode-toggle ripensato dopo).

---

## 7. Prossimi passi (quando si arriva alla Fase 4)

- Decidere il colore accento
- Prototipare la sola Chat UI per prima (è il valore percepito più alto, roadmap Fase 1 già la rende sostanzialmente pronta lato dati)
- Valutare Trophy UI kit concretamente contro il modello `PointEvent`/`Season` già implementato, prima di scrivere leaderboard da zero
- Decidere se investire tempo nella scena Spline (nice-to-have, non bloccante) o rimandarla a dopo il lancio

Nessuna di queste decisioni è urgente ora — la Fase 2 (catalogo) prosegue secondo `roadmap.md`.
