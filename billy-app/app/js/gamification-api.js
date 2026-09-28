// Unico punto di accesso ai dati di gamification, sul modello di api.js:
// la vista (views/game-view.js) non importa mai gamification-mock.js e non
// sa da dove arrivino i dati.
//
// Oggi i dati sono INVENTATI (vedi l'intestazione di gamification-mock.js).
// Le firme qui sotto sono pero' quelle che avrebbe un servizio CAP vero —
// asincrone, stessa forma di risposta, stessi nomi di campo dello schema —
// quindi accenderlo davvero significa sostituire il corpo di queste
// funzioni con una `request(...)` e cancellare l'import del mock. Niente
// altro nel frontend cambia.
//
// Esempio di come diventerebbe la prima, con un GameService REST:
//   getCurrentSeason: () => request('/rest/game/getCurrentSeason'),
//
// L'unica cosa che non e' mock e' l'aggancio agli asset: quando il catalogo
// vero risponde, gli eventi puntano ad asset veri (vedi bindRealAssets).

import { api } from './api.js';
import {
  MOCK_SEASON,
  MOCK_PLAYERS,
  MOCK_POINT_EVENTS,
  MOCK_SCORING,
  MOCK_CURRENT_USER_ID,
  MOCK_DEMO_ASSETS
} from './gamification-mock.js';

// Un servizio vero non risponde nello stesso tick: senza un minimo di
// attesa gli scheletri di caricamento della vista non si vedrebbero mai e
// non ci accorgeremmo, il giorno del passaggio al backend, che quel
// percorso non era mai stato provato.
const FAKE_LATENCY_MS = 160;

function resolved(value) {
  return new Promise((r) => setTimeout(() => r(value), FAKE_LATENCY_MS));
}

// ── Aggancio al catalogo reale ─────────────────────────────────────────
// Gli asset citati negli eventi sono finti, ma il catalogo e' vero: se
// listAssets() risponde, ogni asset di esempio viene sostituito da un asset
// pubblicato davvero (stesso indice, quindi in modo stabile fra le
// chiamate). Cosi' l'attivita' recente parla di documenti che esistono e la
// riga si puo' aprire nel dettaglio. Backend giu' o catalogo vuoto: si
// resta sui titoli di esempio, senza errori.
// Questa funzione sparisce con il mock: il servizio vero restituisce gia'
// l'asset giusto nell'expand.
let realAssetsPromise = null;

function realAssets() {
  if (!realAssetsPromise) realAssetsPromise = api.listAssets().catch(() => []);
  return realAssetsPromise;
}

async function bindRealAssets(events) {
  const assets = await realAssets();
  if (!assets.length) return events;
  return events.map((e) => {
    const real = assets[e._assetIdx % assets.length];
    return { ...e, asset: { ID: real.ID, title: real.title } };
  });
}

// ── Aggregazioni ───────────────────────────────────────────────────────
// Nel servizio vero questo e' un GROUP BY su PointEvent; qui si fa la
// stessa somma in memoria, restituendo la stessa riga.
function aggregate(events) {
  const rows = new Map();
  events.forEach((e) => {
    const key = e.player.ID;
    if (!rows.has(key)) {
      rows.set(key, { rank: 0, player: e.player, points: 0, uploads: 0, certifications: 0, uses: 0 });
    }
    const row = rows.get(key);
    row.points += e.points;
    if (e.reason === 'upload') row.uploads += 1;
    if (e.reason === 'certify') row.certifications += 1;
    if (e.reason === 'use') row.uses += 1;
  });
  return [...rows.values()];
}

export const gameApi = {
  // -> Season { ID, name, startDate, endDate, status, winner }
  getCurrentSeason: () => resolved(MOCK_SEASON),

  // -> Player dell'utente corrente. Nel servizio vero e' il player di
  // cds.context.user; oggi il backend lavora tutto sul player 'anonymous'
  // di srv/lib/default-player.js, ed e' quello che il mock rispecchia.
  getMyPlayer: () => resolved(MOCK_PLAYERS.find((p) => p.userId === MOCK_CURRENT_USER_ID) || MOCK_PLAYERS[0]),

  // -> [{ rank, player, points, uploads, certifications, uses }]
  // Ordinata per punti decrescenti, rank gia' assegnato dal server: la
  // posizione e' un dato, non qualcosa che la UI si ricalcola.
  // Chi non ha ancora nessun evento nella stagione compare comunque, a
  // zero punti: una classifica che nasconde chi non ha ancora contribuito
  // non fa venire voglia di contribuire.
  getLeaderboard: async ({ seasonId = MOCK_SEASON.ID, top = 0 } = {}) => {
    const events = MOCK_POINT_EVENTS.filter((e) => e.season.ID === seasonId);
    const rows = aggregate(events);
    const seen = new Set(rows.map((r) => r.player.ID));
    MOCK_PLAYERS.forEach((p) => {
      if (!seen.has(p.ID)) rows.push({ rank: 0, player: p, points: 0, uploads: 0, certifications: 0, uses: 0 });
    });
    rows.sort((a, b) => b.points - a.points || a.player.displayName.localeCompare(b.player.displayName));
    // Pari merito: stessi punti, stessa posizione (classifica sportiva).
    rows.forEach((r, i) => {
      r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1;
    });
    return resolved(top ? rows.slice(0, top) : rows);
  },

  // -> [PointEvent] con expand su player, season e asset, dal piu' recente.
  listPointEvents: async ({ seasonId = MOCK_SEASON.ID, playerId = null, top = 12 } = {}) => {
    let events = MOCK_POINT_EVENTS.filter((e) => e.season.ID === seasonId);
    if (playerId) events = events.filter((e) => e.player.ID === playerId);
    events = await bindRealAssets(events.slice(0, top));
    return resolved(events);
  },

  // -> { upload, certify, use }: i punti assegnati per ciascuna delle tre
  // reason dello schema. Lato server sono le costanti usate quando si
  // scrive il PointEvent, quindi la UI non deve duplicarle.
  getScoringRules: () => resolved({ ...MOCK_SCORING }),

  // Quanti asset di esempio esistono: la vista non ne ha bisogno, serve
  // solo a chi debugga l'aggancio al catalogo reale.
  _demoAssetCount: MOCK_DEMO_ASSETS.length
};
