# Configurazione Action: LoadSkill

**Dove**: Copilot Studio → agente Billy → menu "Actions" → "Add an action" → "Power Automate flow" → selezionare "Billy - LoadSkill"

> Prerequisito: il flow "Billy - LoadSkill" deve essere già stato creato in Power Automate (vedi `flow-LoadSkill.md`).

---

## Configurazione action

| Campo | Valore |
|---|---|
| **Action name** | `LoadSkill` |

**Description** (copiare esattamente — è quella che il modello usa per decidere quando chiamare questa action):

```
Carica il corpo completo di una skill o procedura operativa dal catalogo Billy.
OBBLIGATORIA: deve essere chiamata ogni volta che nello Skill Index viene identificata una skill pertinente alla domanda dell'utente, prima di fornire qualsiasi risposta sulla procedura.
Non rispondere mai su come eseguire una procedura senza aver prima chiamato questa action con il SkillId corretto.
Restituisce: il testo completo della procedura, il livello di certificazione, la versione e la data di ultima modifica.
```

---

## Parametro di input

| Campo | Valore |
|---|---|
| **Name** | `skillId` |
| **Type** | `String` |
| **Required** | `Yes` |

**Description del parametro input:**
```
L'identificatore univoco della skill da caricare. Si trova nel campo "SkillId" dell'item nello Skill Index. Ha il formato "btp-XXXX" (es. "btp-42"). Non usare il titolo — usare il valore esatto del campo SkillId.
```

---

## Parametri di output

| Nome | Tipo | Description |
|---|---|---|
| `found` | Boolean | true se la skill è stata trovata, false se non esiste |
| `title` | String | Titolo della skill |
| `content` | String | Corpo completo della procedura (fino a 60.000 caratteri) |
| `certificationLevel` | String | Livello di certificazione: certified / certifiedOutdated / community |
| `version` | Number | Numero di versione della skill |
| `lastModified` | String | Data di ultima modifica in formato ISO |

> In Copilot Studio è sufficiente mappare almeno `content` come output principale. Gli altri campi sono opzionali ma utili per citare la fonte nella risposta.

---

## Come verificare che funzioni

### Test 1 — SkillId valido
1. Aprire il pannello "Test your agent"
2. Digitare: `Come si configura [argomento di una skill che hai importato]?`
3. Aprire la sezione "Activity" nella conversazione
4. Verificare che appaia un blocco "LoadSkill called" con il SkillId corretto
5. Verificare che la risposta contenga dettagli dal corpo della skill, non solo il sommario

### Test 2 — SkillId inesistente
1. Nel pannello Test digitare: `LoadSkill con skillId "btp-99999"`
2. La risposta deve indicare che la skill non è stata trovata (campo `found: false`)
3. Billy deve rispondere "Non ho trovato questa skill nel catalogo"

### Test 3 — Verifica che Billy non risponda senza caricare
1. Nel pannello Test digitare una domanda tecnica che corrisponde a una skill nota
2. Aprire Activity
3. Verificare che l'action LoadSkill sia stata chiamata PRIMA che Billy abbia risposto
4. Se Billy risponde senza chiamare LoadSkill, il problema è nelle Instructions — rivedere la Regola 2

---

## Troubleshooting

| Problema | Causa probabile | Soluzione |
|---|---|---|
| Action non appare nella lista | Flow non ancora pubblicato | In Power Automate: salva il flow e clicca "Turn on" |
| LoadSkill non viene chiamata | Description action non abbastanza imperativa | Rendere la description più esplicita sull'obbligo |
| Errore 500 dal flow | URL HTTP trigger non corrisponde | Verificare che l'URL nel flow sia quello usato da Copilot Studio |
| `found: false` su skill esistenti | SkillId non corrisponde | Verificare che il campo SkillId in SharePoint e nel flow usino lo stesso formato |
