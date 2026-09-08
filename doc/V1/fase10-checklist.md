# Checklist — Fase 10: Logging persistente (Application Logs)

> Riferimento: [architecture.md](architecture.md) §11, [roadmap.md](roadmap.md) Fase 10. Stesso workflow delle fasi precedenti: analisi approfondita → checklist → verifica coerenza → implementazione → test → verifiche → push `dev` → merge `master` → ritorno a `dev`.
>
> **Decisione esplicita dell'utente (08/09/2026)**: `cloud-logging` non è entitled in questo subaccount — usare `application-logs` (piano `lite`) ora, disponibile subito, documentando chiaramente che è il servizio in via di deprecazione. **Conferma esplicita richiesta all'utente prima di ogni deploy reale su Cloud Foundry.**

---

## 0. Prerequisiti

- [x] **0.1** Branch `dev` sincronizzato con origin, Fase 7 mergiata in `master`
- [x] **0.2** `billy-srv` attivo su CF

---

## 1. Analisi approfondita — risultati della ricerca (da fare PRIMA di scrivere codice)

- [x] **1.1** Verificato con `cf marketplace -e cloud-logging`: **nessuna offerta trovata** — il servizio raccomandato in architecture.md §11 non è entitled in questo subaccount.
- [x] **1.2** Verificato con `cf marketplace -e application-logs`: disponibile, un solo piano **`lite`** (gratuito, per sviluppo).
- [x] **1.3** Letto il codice sorgente di `@sap/cds` (non solo la doc): `node_modules/@sap/cds/lib/log/format/aspects/als.js` rileva **da solo** un binding con `"label": "application-logs"` in `VCAP_SERVICES` e attiva l'aspetto di formattazione ALS (campi custom indicizzabili, opzionali via `cds.env.log.als_custom_fields` — non necessari per il logging di base). Esiste un aspetto analogo `cls.js` per `cloud-logging`, stesso meccanismo, pronto per quando l'entitlement corretto sarà disponibile.
- [x] **1.4** **Conclusione: zero modifiche al codice applicativo necessarie.** L'app produce già log JSON in produzione (formatter di default, osservato per tutta la sessione via `cf logs`) — serve solo il binding infrastrutturale in `mta.yaml`.
- [x] **1.5** Verificato il pattern esistente in `mta.yaml` per risorse gestite (`billy-hdi-container`, tipo `org.cloudfoundry.managed-service` per XSUAA commentato) — stesso pattern da replicare: `type: org.cloudfoundry.managed-service`, `parameters.service`, `parameters.service-plan`.
- [x] **1.6** Nessuna dipendenza da altre fasi; nessun modulo MTA nuovo necessario (si aggiunge solo una `resource` e un `requires` sul modulo `billy-srv` già esistente).

---

## 2. `mta.yaml` — nuova risorsa e binding

- [x] **2.1** Aggiunta risorsa `billy-application-logs` (`org.cloudfoundry.managed-service`, `application-logs`/`lite`)
- [x] **2.2** Aggiunto `- name: billy-application-logs` a `requires:` del modulo `billy-srv`
- [x] **2.3** Commento nel file che spiega la scelta `application-logs` invece di `cloud-logging`

---

## 3. Verifica pre-implementazione

- [x] **3.1** Diff di `mta.yaml` verificato: solo la nuova risorsa + il `requires` su `billy-srv`, nient'altro toccato
- [x] **3.2** Confermato: nessun file `.js`/`.cds` necessita modifiche (§1.4)

---

## 4. Build e deploy di verifica

- [x] **4.1** `mbt build`
- [x] **4.2** Ispezionato l'mtar (`mtad.yaml` bundlato): `billy-application-logs` presente nel `requires` di `billy-srv` e nella sezione `resources`, nessun segreto
- [x] **4.3** ⚠️ Confermato dall'utente (via decisione esplicita sul servizio da usare + "creami ora"), eseguito `cf deploy`
- [x] **4.4** `cf services` → `billy-application-logs` (`application-logs`/`lite`) **create succeeded**, bindato a `billy-srv`; nessun errore nel log di deploy

---

## 5. Test end-to-end reale

- [x] **5.1** `cf env billy-srv` → confermato `"label": "application-logs"` presente in `VCAP_SERVICES`
- [x] **5.2** Log di avvio (`cf logs --recent`) controllati: nessun errore legato al nuovo binding
- [x] **5.3** Generato traffico reale (`GET /rest/catalog/searchAssets`, 200 OK) dopo il bind. **Limite verificato onestamente**: non ho potuto controllare visivamente il dashboard del servizio (`https://logs.cf.eu10-004.hana.ondemand.com`) perché richiede login SSO interattivo che non posso eseguire — la verifica si ferma al meccanismo di rilevamento/binding (§1.3, `VCAP_SERVICES`), non a una conferma visiva dei log nel dashboard. Da controllare manualmente se serve certezza al 100%.
- [x] **5.4** App stabile: 1/1 istanze, nessun riavvio durante/dopo il bind (`cf app billy-srv`)

---

## 6. Versionamento

- [x] **6.1** Commit su `dev`
- [x] **6.2** Push `origin/dev`
- [x] **6.3** Merge `dev` → `master`
- [x] **6.4** Push `master`
- [x] **6.5** Ritorno su `dev`

---

## 7. Chiusura fase

- [x] **7.1** Checklist aggiornata con gli esiti reali (questa modifica)
- [x] **7.2** `roadmap.md` marcata: Fase 10 — ✅ COMPLETATA (08/09/2026)
- [x] **7.3** Riepilogo dato all'utente in chat. Limiti noti: (1) servizio `application-logs` è quello in via di deprecazione, non `cloud-logging` — migrazione futura quando l'entitlement corretto sarà richiesto; (2) piano `lite` è gratuito/per sviluppo, possibili limiti di volume/retention non verificati; (3) non ho potuto controllare visivamente il dashboard dei log (richiede login SSO).

---

## Registro delle deviazioni

*(da compilare durante l'esecuzione)*
