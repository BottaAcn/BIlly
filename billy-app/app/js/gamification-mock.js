/* ═══════════════════════════════════════════════════════════════════════
   DATI INVENTATI. NIENTE DI QUANTO STA IN QUESTO FILE ARRIVA DAL BACKEND.

   Classifica, punti, stagione ed eventi qui dentro sono scritti a mano per
   poter mostrare la gamification prima che esista: in billy-app/srv/ non
   c'e' una riga di logica su Player / Season / PointEvent (gli unici
   riferimenti sono i due TODO(Fase 3) in catalog-service.js, righe ~288 e
   ~312, dove i punti andrebbero assegnati all'approvazione di una
   revisione). Le persone elencate sotto NON esistono.

   La forma dei dati e' pero' quella vera: stessi nomi di campo e stessi
   enum di db/schema.cds (Player, Season, PointEvent; seniorityLevel
   analyst/senior/manager; reason upload/certify/use). Nessun campo in piu',
   nessun campo rinominato — cosi' sostituire il mock con le risposte del
   servizio non tocca la vista.

   PER RENDERLI VERI SERVE, LATO BACKEND:
     1. un GameService (o nuove function su CatalogService) che esponga:
        - getCurrentSeason()  -> Season con status = 'active'
        - getMyPlayer()       -> il Player di cds.context.user
        - getLeaderboard(seasonId) -> righe aggregate per player
          (points = SUM(PointEvent.points), piu' il conteggio per reason)
        - listPointEvents(seasonId, playerId, top) -> eventi + expand su
          player e asset
        - getScoringRules()   -> i punti per reason, oggi costanti di codice
     2. la creazione effettiva dei PointEvent nei due TODO(Fase 3) di
        catalog-service.js (upload all'autore scalato da pointsPct, certify
        al certificatore) e un terzo punto di scrittura per 'use', quando
        billy-service.js cita un asset in una risposta;
     3. almeno una riga in Season (oggi la tabella e' vuota: senza una
        stagione attiva non c'e' nulla a cui agganciare i PointEvent).
   Nessuna colonna nuova: lo schema basta cosi' com'e'.
   ═══════════════════════════════════════════════════════════════════════ */

const DAY_MS = 86400000;

// Generatore pseudo-casuale con seme fisso, non Math.random(): la classifica
// dimostrativa deve restare identica a ogni ricarica, altrimenti durante una
// demo i numeri ballano fra un refresh e l'altro e si vede che sono finti.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// UUID plausibili ma riconoscibili: la prima cifra del terzo gruppo e' 4
// come in un UUID v4 vero, il prefisso dice a colpo d'occhio che sono finti.
const uuid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ── Stagione ───────────────────────────────────────────────────────────
// Calcolata sul trimestre corrente invece di essere una data fissa: una
// stagione scaduta ("mancano -40 giorni") tradirebbe il mock alla prima
// demo fatta qualche mese dopo. Il servizio vero legge questa riga da DB.
function buildSeason(now) {
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(Date.UTC(y, q * 3, 1));
  const end = new Date(Date.UTC(y, q * 3 + 3, 0));
  return {
    ID: uuid('5ea50000', q + 1),
    name: `Stagione ${y} · Q${q + 1}`,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    status: 'active',
    // La stagione in corso non ha ancora un vincitore: il campo esiste
    // nello schema e resta null finche' non si chiude.
    winner: null
  };
}

export const MOCK_SEASON = buildSeason(new Date());

// ── Punti per reason ───────────────────────────────────────────────────
// Le tre reason dello schema sono i tre comportamenti che il sistema vuole
// premiare. I valori relativi dicono la priorita': pubblicare vale piu' che
// certificare (chi scrive fa il lavoro grosso), certificare vale molto piu'
// di un singolo utilizzo, ma un contenuto molto usato accumula nel tempo.
export const MOCK_SCORING = { upload: 40, certify: 25, use: 3 };

// ── Roster ─────────────────────────────────────────────────────────────
// `carry` non e' un campo di Player: sono i punti delle stagioni chiuse,
// che sommati a quelli di questa stagione danno totalPoints. Serve perche'
// nello schema totalPoints e' il totale di sempre, mentre la classifica e'
// per stagione: senza distinguerli i due numeri risulterebbero uguali e la
// differenza fra "livello" e "posizione" non si capirebbe.
// `weight` pesa quanti eventi genera ciascuno, non e' un dato del modello.
const ROSTER = [
  // Il primo e' l'utente corrente. userId 'anonymous' e i due flag a true
  // non sono inventati: sono esattamente il player che
  // srv/lib/default-player.js crea finche' XSUAA non e' attiva, ed e' lo
  // stesso "Ospite" che la sidebar mostra in basso.
  // Quinto o giu' di li' in classifica, non primo: la vista deve mostrare
  // com'e' fatta la riga "sei tu" in mezzo al gruppo, e quanto manca a chi
  // sta davanti. Una demo in cui chi guarda e' gia' primo non dice nulla.
  { ID: uuid('9a1e0001', 1), userId: 'anonymous', displayName: 'Ospite', department: 'SAP Practice', manager: 'Antonio Iuliani', seniorityLevel: 'senior', isCertifier: true, isAdmin: true, carry: 240, weight: 0.605 },
  { ID: uuid('9a1e0002', 2), userId: 'a.iuliani', displayName: 'Antonio Iuliani', department: 'SAP Analytics', manager: 'Luca Prandi', seniorityLevel: 'manager', isCertifier: true, isAdmin: false, carry: 620, weight: 4.000 },
  { ID: uuid('9a1e0003', 3), userId: 'r.fresi', displayName: 'Riccardo Fresi', department: 'SAP Analytics', manager: 'Antonio Iuliani', seniorityLevel: 'senior', isCertifier: true, isAdmin: false, carry: 380, weight: 0.790 },
  { ID: uuid('9a1e0004', 4), userId: 'm.crosta', displayName: 'Matteo Crosta', department: 'Datasphere', manager: 'Antonio Iuliani', seniorityLevel: 'analyst', isCertifier: false, isAdmin: false, carry: 90, weight: 1.708 },
  { ID: uuid('9a1e0005', 5), userId: 'l.prandi', displayName: 'Luca Prandi', department: 'Delivery', manager: null, seniorityLevel: 'manager', isCertifier: true, isAdmin: true, carry: 510, weight: 0.345 },
  { ID: uuid('9a1e0006', 6), userId: 's.colombo', displayName: 'Sara Colombo', department: 'BPC & Planning', manager: 'Luca Prandi', seniorityLevel: 'senior', isCertifier: false, isAdmin: false, carry: 300, weight: 1.000 },
  { ID: uuid('9a1e0007', 7), userId: 'a.bianchi', displayName: 'Andrea Bianchi', department: 'Datasphere', manager: 'Antonio Iuliani', seniorityLevel: 'analyst', isCertifier: false, isAdmin: false, carry: 60, weight: 0.900 },
  { ID: uuid('9a1e0008', 8), userId: 'f.moretti', displayName: 'Francesca Moretti', department: 'BPC & Planning', manager: 'Luca Prandi', seniorityLevel: 'analyst', isCertifier: false, isAdmin: false, carry: 40, weight: 0.700 },
  { ID: uuid('9a1e0009', 9), userId: 'r.gatti', displayName: 'Riccardo Gatti', department: 'Delivery', manager: 'Luca Prandi', seniorityLevel: 'senior', isCertifier: true, isAdmin: false, carry: 270, weight: 0.540 }
];

export const MOCK_CURRENT_USER_ID = 'anonymous';

// ── Asset di appoggio ──────────────────────────────────────────────────
// Titoli di esempio, usati solo quando il catalogo vero e' vuoto o
// irraggiungibile: gamification-api.js, se puo', rimpiazza questi
// riferimenti con asset reali (vedi bindRealAssets li').
// `author` e' l'indice nel ROSTER di chi lo avrebbe pubblicato: serve a
// tenere coerenti gli eventi 'use', che accreditano l'autore dell'asset e
// non chi ha fatto la domanda a Billy.
const DEMO_ASSETS = [
  { ID: uuid('a55e0001', 1), title: 'Metodologia di stima per progetti SAC', author: 1 },
  { ID: uuid('a55e0002', 2), title: 'Policy trasferte e rimborsi 2026', author: 3 },
  { ID: uuid('a55e0003', 3), title: 'Checklist di go-live Datasphere', author: 2 },
  { ID: uuid('a55e0004', 4), title: 'Template offerta — rollout BPC', author: 4 },
  { ID: uuid('a55e0005', 5), title: 'Skill: genera WBS da perimetro funzionale', author: 2 },
  { ID: uuid('a55e0006', 6), title: 'Onboarding nuovo collega in progetto', author: 0 },
  { ID: uuid('a55e0007', 7), title: 'Linee guida naming su Datasphere', author: 6 },
  { ID: uuid('a55e0008', 8), title: 'Retrospettiva progetto Alfa — lezioni apprese', author: 5 }
];

export const MOCK_DEMO_ASSETS = DEMO_ASSETS;

// ── Eventi punti ───────────────────────────────────────────────────────
// Generati sul periodo gia' trascorso della stagione, non su date fisse:
// "3 giorni fa" deve restare "3 giorni fa" anche fra un mese.
function buildEvents() {
  const rnd = lcg(20260928);
  const startMs = new Date(`${MOCK_SEASON.startDate}T00:00:00Z`).getTime();
  const elapsed = Math.max(1, Math.min(120, Math.floor((Date.now() - startMs) / DAY_MS)));

  // Ruota pesata: chi ha weight piu' alto compare piu' spesso, cosi' la
  // classifica ha una forma (un gruppo di testa, dei distacchi) invece di
  // essere nove numeri quasi uguali.
  const wheel = [];
  ROSTER.forEach((p, i) => {
    for (let k = 0; k < Math.round(p.weight * 10); k++) wheel.push(i);
  });
  const certifiers = ROSTER.map((p, i) => (p.isCertifier ? i : -1)).filter((i) => i >= 0);

  const events = [];
  let n = 0;
  for (let day = elapsed; day >= 0; day--) {
    // Densita': poco piu' di un evento al giorno, con giorni vuoti. Sotto
    // questa soglia "attivita' recente" mostrerebbe cose di dieci giorni
    // fa, che e' il contrario di quello che quella sezione promette.
    const count = rnd() < 0.15 ? 0 : (rnd() < 0.6 ? 2 : 1);
    for (let k = 0; k < count; k++) {
      const assetIdx = Math.floor(rnd() * DEMO_ASSETS.length);
      const asset = DEMO_ASSETS[assetIdx];
      const roll = rnd();

      let reason;
      let playerIdx;
      if (roll < 0.52) {
        // Utilizzo: i punti vanno all'autore dell'asset citato, non a chi
        // ha posto la domanda — e' il contenuto che sta lavorando.
        reason = 'use';
        playerIdx = asset.author;
      } else if (roll < 0.78) {
        reason = 'upload';
        playerIdx = wheel[Math.floor(rnd() * wheel.length)];
      } else {
        // Solo chi e' certificatore puo' generare un evento 'certify': un
        // dato incoerente col modello dei ruoli sarebbe il primo dettaglio
        // a tradire il mock davanti a chi conosce lo schema.
        reason = 'certify';
        playerIdx = certifiers[Math.floor(rnd() * certifiers.length)];
        // E nessuno si certifica da solo: sarebbe la prima scorciatoia che
        // qualcuno proverebbe a fare, e il backend vero dovra' vietarla.
        if (playerIdx === asset.author) continue;
      }

      let points = MOCK_SCORING[reason];
      // pointsPct esiste davvero su AssetRevision (0-100, lo decide il
      // certificatore in fase di approvazione): una revisione minore vale
      // meno di una pubblicazione nuova, e qui si vede.
      if (reason === 'upload') points = Math.round(points * [1, 1, 0.75, 0.5][Math.floor(rnd() * 4)]);

      const at = new Date(Date.now() - day * DAY_MS);
      at.setHours(9 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), 0, 0);
      // Orario d'ufficio su "oggi" significa, di prima mattina, un evento
      // nel futuro: verrebbe fuori un "+3 punti" per qualcosa che deve
      // ancora succedere.
      if (at.getTime() > Date.now()) at.setTime(Date.now() - Math.floor(rnd() * 3 + 1) * 3600000);

      events.push({
        ID: uuid('e7e70000', ++n),
        createdAt: at.toISOString(),
        points,
        reason,
        playerIdx,
        assetIdx
      });
    }
  }
  // Piu' recente per primo: e' l'ordine in cui il servizio vero
  // restituirebbe gli eventi ($orderby=createdAt desc).
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const RAW_EVENTS = buildEvents();

// totalPoints = punti delle stagioni chiuse + punti di questa stagione.
// Calcolato, non scritto a mano: due numeri incoerenti fra classifica e
// livello si notano subito.
const seasonTotals = new Map();
RAW_EVENTS.forEach((e) => {
  seasonTotals.set(e.playerIdx, (seasonTotals.get(e.playerIdx) || 0) + e.points);
});

export const MOCK_PLAYERS = ROSTER.map((p, i) => ({
  ID: p.ID,
  userId: p.userId,
  displayName: p.displayName,
  department: p.department,
  manager: p.manager,
  seniorityLevel: p.seniorityLevel,
  isCertifier: p.isCertifier,
  isAdmin: p.isAdmin,
  totalPoints: p.carry + (seasonTotals.get(i) || 0)
}));

// Forma finale di PointEvent: i campi dello schema piu' gli expand che il
// servizio restituirebbe con $expand=player,asset,season.
export const MOCK_POINT_EVENTS = RAW_EVENTS.map((e) => ({
  ID: e.ID,
  createdAt: e.createdAt,
  points: e.points,
  reason: e.reason,
  player: MOCK_PLAYERS[e.playerIdx],
  season: { ID: MOCK_SEASON.ID, name: MOCK_SEASON.name },
  asset: { ID: DEMO_ASSETS[e.assetIdx].ID, title: DEMO_ASSETS[e.assetIdx].title },
  // Indice dell'asset di appoggio: serve solo allo shim per sostituire
  // l'asset finto con uno vero del catalogo, e sparisce insieme al mock.
  _assetIdx: e.assetIdx
}));
