# Configurazione Knowledge Sources — Billy Agent

Aggiungere questi 3 knowledge sources all'agente Billy in Copilot Studio, nell'ordine indicato.

**Dove**: Copilot Studio → agente Billy → menu "Knowledge" → "Add knowledge" → "SharePoint"

---

## Knowledge Source 1: Skill Index

| Campo | Valore |
|---|---|
| **URL SharePoint** | `https://accenture.sharepoint.com/sites/BillyCatalog/Skill%20Index` |
| **Name** | `Skill Index` |

**Description** (copiare esattamente nel campo Description):

```
Indice delle procedure operative e skill disponibili nel catalogo Billy della SAP Practice Accenture.
Contiene SOLO titolo e descrizione breve di ogni skill/procedura.
NON contiene il corpo completo delle procedure — per ottenere i passi operativi completi è obbligatorio usare l'action LoadSkill con il SkillId dell'item trovato.
Usare questa source per identificare quale skill è pertinente alla domanda, poi caricare il corpo completo prima di rispondere.
```

---

## Knowledge Source 2: Certified Documents

| Campo | Valore |
|---|---|
| **URL SharePoint** | `https://accenture.sharepoint.com/sites/BillyCatalog/Certified%20Documents` |
| **Name** | `Certified Documents` |

**Description** (copiare esattamente nel campo Description):

```
Documenti tecnici certificati e validati formalmente da senior della SAP Practice Accenture.
Fonte autorevole e affidabile. Usare come prima scelta per rispondere a domande su architetture, configurazioni, best practice e guide tecniche.
Tutti i documenti in questa source sono stati approvati attraverso un processo di revisione formale.
```

---

## Knowledge Source 3: Community Documents

| Campo | Valore |
|---|---|
| **URL SharePoint** | `https://accenture.sharepoint.com/sites/BillyCatalog/Community%20Documents` |
| **Name** | `Community Documents` |

**Description** (copiare esattamente nel campo Description):

```
Documenti e contributi della community della SAP Practice Accenture, non sottoposti a revisione formale da senior.
Usare SOLO come fallback quando Certified Documents non contiene la risposta.
Quando si utilizza questa source, includere SEMPRE nella risposta un avviso esplicito all'utente che la fonte non è stata validata formalmente e che dovrebbe verificare le informazioni con un esperto prima di applicarle in produzione.
```

---

## Note sull'ordine e la configurazione

- Aggiungere i knowledge sources nell'ordine mostrato (Skill Index → Certified → Community)
- Copilot Studio mostra i knowledge sources in una lista: l'ordine aiuta il modello a capire la priorità
- Dopo aver aggiunto tutti e tre, aprire "Settings" → "Generative AI" e verificare che il toggle "Use knowledge" sia attivo
- Se il sito SharePoint non è indicizzato, la prima risposta potrebbe essere vuota — attendere 10-30 minuti per l'indicizzazione iniziale
- Verificare l'indicizzazione aprendo il pannello Test e chiedendo: "Elenca alcune skill disponibili" — se risponde con titoli reali, l'indicizzazione è completata
