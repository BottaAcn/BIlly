# Configurazione Action: PublishAsset

**Dove**: Copilot Studio → agente Billy → menu "Actions" → "Add an action" → "Power Automate flow" → selezionare "Billy - PublishAsset"

> Prerequisito: il flow "Billy - PublishAsset" deve essere già stato creato in Power Automate (vedi la checklist Fase 3.3).

---

## Configurazione action

| Campo | Valore |
|---|---|
| **Action name** | `PublishAsset` |

**Description** (copiare esattamente):

```
Pubblica ufficialmente un asset nel catalogo Billy, rendendolo visibile e ricercabile da tutti gli utenti.
Usare SOLO quando l'utente ha i permessi di pubblicazione (owner dell'asset o ruolo admin) e ha confermato esplicitamente di voler pubblicare.
Non usare mai in automatico — richiedere sempre conferma esplicita prima di chiamare questa action.
L'asset deve essere in stato "approved" per poter essere pubblicato.
```

---

## Parametri di input

| Nome | Tipo | Required | Description |
|---|---|---|---|
| `assetId` | String | Yes | ID numerico dell'item SharePoint da pubblicare. Es: "42". Trovarlo nel campo ID dell'item nella library. |
| `listName` | String | Yes | Nome esatto della library SharePoint che contiene l'asset. Valori possibili: `Skill Index`, `Certified Documents`, `Community Documents`, `Agent Configs` |

---

## Parametri di output

| Nome | Tipo | Description |
|---|---|---|
| `success` | Boolean | true se la pubblicazione è avvenuta correttamente |
| `assetId` | String | ID dell'asset pubblicato (conferma) |
| `error` | String | Messaggio di errore se `success` è false |

---

## Comportamento atteso in conversazione

Billy deve sempre chiedere conferma prima di pubblicare:

```
Utente: "Pubblica la skill 'Guida XSUAA'"
Billy: "Stai per pubblicare la skill 'Guida XSUAA' (ID: btp-42) nella library 'Skill Index'. 
        Questa operazione la renderà visibile a tutti gli utenti del catalogo. Confermi?"
Utente: "Sì"
Billy: [chiama PublishAsset(assetId: "42", listName: "Skill Index")]
Billy: "✅ La skill 'Guida XSUAA' è stata pubblicata nel catalogo."
```

Aggiungere nelle Instructions:
```
### Regola per PublishAsset
Prima di chiamare PublishAsset, riepiloga sempre all'utente:
- Titolo e ID dell'asset
- Library di destinazione
- Conseguenza (sarà visibile a tutti)
Chiedi conferma esplicita. Solo dopo la conferma chiama l'action.
```

---

## Verifica funzionamento

1. Caricare un asset di test in SharePoint con Status = `approved`
2. Nel pannello Test: `Pubblica l'asset con ID 1 nella Skill Index`
3. Verificare che Billy chieda conferma
4. Confermare
5. Aprire SharePoint → Skill Index → verificare che lo Status sia cambiato a `published`
6. Verificare che in Activity appaia la chiamata a PublishAsset con i parametri corretti

---

## Troubleshooting

| Problema | Causa probabile | Soluzione |
|---|---|---|
| Billy pubblica senza chiedere conferma | Instructions mancanti sulla conferma | Aggiungere la Regola per PublishAsset nelle Instructions |
| Errore 403 dal flow | L'account del flow non ha permessi su quella library | Verificare le credenziali del connector SharePoint nel flow |
| Status non cambia in SharePoint | Il campo "Status" non è mappato correttamente nel flow | Verificare che il nome colonna nel flow corrisponda esattamente a "Status" |
