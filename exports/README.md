# Billy Export — dati da HANA per migrazione Copilot Studio

## Prerequisiti

1. Essere nella root di `billy-marketplace` con il repo clonato
2. Avere `node_modules` installato nella cartella `billy-app/`
3. Avere le credenziali HANA disponibili tramite uno dei metodi seguenti:
   - Variabile `VCAP_SERVICES` impostata (come su CF)
   - File `billy-app/.env` con le credenziali HANA
   - Profilo `production` in `billy-app/.cdsrc.json`

## Come eseguire

```powershell
# Dalla root del repository
cd billy-app
node ../exports/export-hana.js
```

## Output

Lo script crea una cartella `exports/AAAA-MM-GG/` con questi file:

| File | Contenuto |
|---|---|
| `assets.json` | Tutti gli asset **pubblicati** (tutti i tipi), `content` incluso |
| `assets-all.json` | Tutti gli asset incluse bozze e pending |
| `chunks.json` | Chunk RAG (testo, indice, certificationLevel) — senza embedding |
| `players.json` | Utenti registrati (userId, displayName, ruoli) |
| `revisions.json` | Revisioni approvate (storico) |
| `capabilities.json` | AgentCapability (legami agente→skill/application) |
| `summary.json` | Conteggi per tipo e certificazione + warning |

## Struttura asset (campo `type`)

| Valore | Descrizione |
|---|---|
| `skill` | Procedura step-by-step — campo `content` contiene il corpo |
| `document` | Documento indicizzato nel RAG — corpo nei `chunks` |
| `interface` | Mini-app HTML/JS — campo `externalLink` o `content` |
| `application` | App esterna con endpoint MCP — campo `externalLink` |
| `agent` | Sotto-agente — prompt in `content`, tool in `capabilities.json` |
| `tool` | Tool generico |

## Note per la migrazione

- **Gli embedding NON vengono esportati** (vettori 3072-dim, non serializzabili utilmente). Su SharePoint/Copilot Studio i documenti vengono re-indicizzati da Microsoft.
- **Le skill**: importare `assets.json` filtrato su `type = 'skill'` → due liste SharePoint:
  - `Skill Index`: solo `title` + `description` (manifesto per il knowledge source)
  - `Skill Content`: `title` + `content` (corpo completo, per l'action LoadSkill)
- **I documenti**: importare `assets.json` filtrato su `type = 'document'` nelle library SharePoint per livello di certificazione (certified/community).
- **Gli agenti**: importare `assets.json` filtrato su `type = 'agent'` + `capabilities.json`.

## Verifica integrità

```js
// Eseguire nella stessa cartella dopo l'export
const summary = require('./AAAA-MM-GG/summary.json');
console.log(summary);

// Contare skill senza content (da verificare)
const assets = require('./AAAA-MM-GG/assets.json');
const noContent = assets.filter(a => a.type === 'skill' && !a.content);
console.log('Skill senza content:', noContent.map(a => a.title));
```
