# Banco dei 35 casi — routing delle skill di Billy

È l'unico strumento che dice se una modifica al motore agentico **migliora o
peggiora** il sistema. Prima viveva in `%TEMP%` con uno script non versionato:
i due numeri storici (22/35 e 27/35) non erano riproducibili da nessuno.
Adesso sì.

- `cases-35.json` — i 35 casi: domanda **verbatim**, skill attesa, esito della
  baseline caso per caso.
- `run-35.js` — li rigioca contro un'istanza di Billy, stampa il punteggio e
  lo confronta con la baseline, evidenziando le regressioni.

Origine dei dati: `doc/V1/skill-routing-audit.md` §5 (le domande) e
`doc/V1/causa-a-fix.md` §3 (l'esito misurato, **27/35**, motore legacy,
catalogo a 22 skill, 2026-09-28). **27/35 è il numero da battere.**

## Come si lancia

Nessuna dipendenza: solo Node ≥ 22 (usa `fetch` e `AbortSignal.timeout`).
Si lancia da `billy-app/`.

```bash
# passata completa contro CF (~15-30 minuti: è sequenziale di proposito)
node test/run-35.js --base https://<host-di-billy> --out run-$(date +%Y%m%d-%H%M).json

# contro il locale
node test/run-35.js --base http://localhost:4004

# solo alcuni casi, per verificare un fix mirato
node test/run-35.js --base https://<host> --only 7,10,11-13
```

L'host CF attuale:
`accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com`
(anche senza `https://`, lo aggiunge lui). In alternativa a `--base` si può
usare la variabile d'ambiente `BILLY_BASE_URL`.

Lo script **esce con codice 1 se c'è almeno una regressione** rispetto alla
baseline, 0 altrimenti, 2 se è la riga di comando a essere sbagliata.

### Opzioni

| Opzione | Default | A cosa serve |
|---|---|---|
| `--base`, `-b` | `$BILLY_BASE_URL` | host di Billy. Obbligatorio. |
| `--mode`, `-m` | `sse` | `sse` = `/rest/billy/askBillyStream`, `rest` = `/rest/billy/askBilly` |
| `--only` | tutti | sottoinsieme: `1,4,7-9` |
| `--timeout` | `150000` | timeout per singolo tentativo (ms) |
| `--retries` | `3` | ritentativi su errore o risposta vuota |
| `--delay` | `1500` | pausa fra un caso e il successivo (ms) |
| `--out`, `-o` | — | salva il JSON completo, **risposte integrali incluse** |
| `--quiet`, `-q` | — | solo il riepilogo finale |

## Come viene misurata la skill caricata

- **`--mode sse` (default, più preciso)**: conta gli eventi
  `{"type":"tool","name":"loadSkill","args":{"skillId":"<uuid>"}}` emessi dallo
  stream. Gli UUID vengono risolti in titoli leggibili con
  `GET /rest/catalog/Asset`.
- **`--mode rest`**: guarda le `sources` della risposta — **`similarity: null`
  significa skill**, un valore numerico significa documento. Meno preciso: una
  skill caricata ma non citata fra le fonti non compare.

Se il catalogo non è raggiungibile lo script continua lo stesso, ripiegando
sulle `sources` per dare un nome alle skill.

## Il criterio di giudizio

Per ogni caso `cases-35.json` dichiara `expect`:

- **`skill`** — è corretto se **almeno una** delle skill caricate rientra fra
  quelle accettate (gruppi in `skillGroups`, regex sul titolo). Skill in più
  sono contate come *rumore*, non come fallimento: è lo stesso criterio con cui
  furono contati i casi 19 e 23 nella misura originale.
- **`none`** — è corretto se non viene caricata nessuna skill. `tolerate`
  elenca le eccezioni (caso 35: `02-orchestratore` era accettata).

Un solo caso, il **10**, ha anche un criterio testuale (`answerMustMatch`):
lì non si carica nessuna skill, ma la baseline lo conta KO perché Billy accetta
comunque di redigere la risposta tecnica di gara. Si considera corretto solo se
la risposta dichiara il confine (go/no-go, "non redigo", "mi fermo al…").

Il campo `flags` (oggi solo sul caso 30) segnala pattern sospetti nel testo —
per esempio la promessa di generare un `.xlsx` — **senza incidere sul
punteggio**.

## Perché è lento (e deve restarlo)

- **Sequenziale**: in parallelo il modello va in throttling e la misura non
  vale più niente.
- **Timeout larghi**: una domanda con più giri di tool richiede 20-60 secondi.
- **Retry sulle risposte vuote**: la risoluzione DNS verso CF da queste
  macchine è intermittente. Senza retry si misurerebbe la rete, non Billy.
  Un caso comunque non misurato finisce nel riepilogo come `ERRORE` e non viene
  contato come fallimento: va rilanciato con `--only`.

## Leggere il risultato

Il punteggio da solo non basta: **il routing di un LLM non è deterministico e
la misura ha un margine di ±2 casi**. Un delta di 1-2 punti non è un segnale,
va ripetuta la passata (il piano di migrazione chiede la **mediana di tre
passate**). Quello che conta davvero è la sezione **REGRESSIONI**: i casi che
la baseline dava per corretti e che adesso falliscono, con il dettaglio di
cosa veniva caricato prima e cosa viene caricato adesso.

## Verificare il banco

Il criterio di giudizio si può provare a secco, senza chiamare il sistema:
rigiocando gli esiti della baseline dentro `judge()` deve tornare esattamente
27/35.

```bash
node -e "const {judge}=require('./test/run-35.js'),s=require('./test/cases-35.json');
let ok=0;for(const c of s.cases){const l=(c.baseline.loaded||[]).map(x=>({label:x}));
const a=c.id===10?'redigo la risposta tecnica':'risposta plausibile abbastanza lunga.';
if(judge(c,l,a,s.skillGroups).verdict==='OK')ok++;}console.log(ok+'/35');"
```

## Se cambiano le skill del catalogo

I gruppi in `cases-35.json` (`skillGroups`) sono regex sui **titoli** degli
asset. Se un titolo cambia, o se una skill viene spubblicata/accorpata, vanno
aggiornati lì — non nello script. Attenzione: cambiare il criterio cambia anche
il significato del confronto con la baseline, quindi va detto esplicitamente
nel commit.
