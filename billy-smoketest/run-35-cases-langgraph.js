// Rigioca i 35 casi di doc/V1/skill-routing-audit.md §5 VERBATIM, uno per
// conversazione senza history, contro la replica LangGraph JS + gpt-5.5.
// Stessa misura del 27/35: quali `loadSkill` vengono chiamate.
// Classificazione: OK / KO / NO-SKILL / SPURIA.
import { writeFileSync } from 'fs';
import { ask } from './billy-langgraph-agent.js';

const S = {
  leva1: '84c09044-3ebb-45b2-b331-27a411d98a95',
  leva2: '372833d5-bfe8-4f29-9031-618cd5871097',
  leva6: '2f6deb89-5390-43f2-9c36-9de49d542fa1',
  leva7: '0a3f8114-4ccb-4193-890c-47de6c1f626d',
  m01_spec: '2c155bd7-a830-4aad-b355-2add73a14a35',
  m02_orch: '802a3da2-2f39-4784-bcce-386c14a7f55d',
  m03_bbp: '6a1128ea-9846-4786-aa2e-1dbd5cd96ffa',
  m16_sched: '92d17af6-a2d9-4e24-99c5-3eb4af875425',
  m17_excel: '4d51985b-7788-4b55-b7bc-973542569581',
  m18_qa: '1b1c81de-1c92-4aed-b35c-3a9be3b59c5c',
  f00: '0d7583bd-198e-494f-a486-27c171ce2ad9',
  f01_arch: '5b4927f9-ca2a-4d85-b1a9-dd4afd6e2607',
  f02_src: '3d7d8322-9dbf-4568-a6c0-b9d30f18b64b',
  f03_dim: 'f67f5972-cf63-4e7d-837e-fd1fae425f65',
  f04_map: '136a3e2a-04e8-41d3-8aea-9ad209a85d8e',
  f05_fasi: '6deea8b5-13a5-4c58-94c6-78dce68e872b',
  f06_alloc: '02ea2df9-7c87-4ff9-9eb7-44f7cc791cb1',
  f07_pl: 'cc542efe-6105-41df-a3a8-9c6793e11a50',
  f08_masch: '92e5642c-56e7-4c5b-9eb0-e382a19d3952',
  f09_dq: 'ce8c028b-a1d4-46b3-8726-36820120623f',
  f10_gov: 'c391259f-dc2f-401a-a70f-43f7a80322a7',
  f_logiche: 'bbf84b13-8699-4d0d-a9d2-50200c4fa807'
};
const NAME = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k]));

// Le due skill "composite" dell'audit, come le ha accettate la misura 27/35.
const MODELLO_DATI = [S.f01_arch, S.f02_src, S.f03_dim, S.f04_map];
const PROCESSO_LOGICHE = [S.f05_fasi, S.f06_alloc, S.f07_pl, S.f08_masch, S.f09_dq, S.f10_gov, S.f_logiche];

// [n, domanda VERBATIM, skill accettate ([] = nessuna attesa), baseline 27/35]
const CASES = [
  [1, "Ho stimato 120 giorni per questo progetto SAC Planning, me la sfidi prima che la mandi al cliente?", [S.leva1], 'OK'],
  [2, "Quali sono i rischi nascosti in un canone di Application Management su SAC?", [S.leva1], 'OK'],
  [3, "Devo spiegare al CFO perché ci serve una Data Action per le allocazioni", [S.leva2], 'OK'],
  [4, "Come presento il valore di Datasphere all'IT manager, non al CFO?", [S.leva2], 'OK'],
  [5, "Il cliente vuole un rolling forecast, il team propone budget annuale con allocazioni. Cosa consiglio?", [S.leva6], 'OK'],
  [6, "Che differenza c'è fra allocazione costi e driver-based, e quando conviene una o l'altra?", [S.leva6], 'OK'],
  [7, "Il modello di planning del cliente non torna, da cosa parto a guardare?", [S.leva6], 'KO'],
  [8, "È arrivato questo capitolato, conviene partecipare?", [S.leva7], 'OK'],
  [9, "Estraimi requisiti obbligatori e criteri di aggiudicazione da questo disciplinare", [S.leva7], 'OK'],
  [10, "Scrivimi la risposta tecnica per il lotto 2 di questa gara", [], 'KO'],
  [11, "Aiutami a preparare il design SAC per un cliente retail", MODELLO_DATI, 'KO'],
  [12, "Devo fare l'analisi tecnica di un progetto SAC Planning, da dove parto?", MODELLO_DATI, 'KO'],
  [13, "Ti incollo la Business Blueprint del cliente, ricavane la struttura del modello", MODELLO_DATI, 'NO-SKILL'],
  [14, "Quali dimensioni servono per un modello SAC Planning di un retailer?", MODELLO_DATI, 'OK'],
  [15, "Da dove prendo i dati per il modello e con che frequenza li aggiorno?", MODELLO_DATI, 'NO-SKILL'],
  [16, "Come mappo il campo KOSTL di SAP sulla dimensione Cost Center?", MODELLO_DATI, 'OK'],
  [17, "Che gerarchie metto sulla dimensione Entity per un gruppo con 200 negozi?", MODELLO_DATI, 'OK'],
  [18, "Quali versioni mi servono fra Actual, Budget e Forecast e come le uso?", [...MODELLO_DATI, S.leva6], 'OK'],
  [19, "Come alloco gli OPEX centrali sulle entity?", PROCESSO_LOGICHE, 'OK'],
  [20, "Scrivimi l'Advanced Formula per il carry-forward del saldo iniziale", PROCESSO_LOGICHE, 'OK'],
  [21, "Come struttura le voci di conto economico fino all'EBITDA?", PROCESSO_LOGICHE, 'OK'],
  [22, "Devo convertire in EUR i dati delle controllate: come lo imposto in SAC?", PROCESSO_LOGICHE, 'OK'],
  [23, "Come faccio le maschere di inserimento budget per i responsabili di negozio?", PROCESSO_LOGICHE, 'OK'],
  [24, "Chi approva il budget e come blocco i dati dopo l'approvazione?", PROCESSO_LOGICHE, 'OK'],
  [25, "Che controlli di qualità metto sui dati di planning?", PROCESSO_LOGICHE, 'OK'],
  [26, "Ho già dimensioni e sorgenti, ora devo definire le fasi del processo di budget", PROCESSO_LOGICHE, 'OK'],
  [27, "Ho 8 persone e 40 attività da distribuire sui prossimi 6 mesi, chi fa cosa?", [S.m16_sched], 'OK'],
  [28, "Marzo è sovraccarico per due risorse, come ribilancio?", [S.m16_sched], 'OK'],
  [29, "Questo design SAC che mi ha passato il collega è completo?", [S.m18_qa], 'OK'],
  [30, "Mi generi il file Excel con i 15 fogli di progettazione?", [], 'SPURIA'],
  [31, "Il progetto è in ritardo, come lo racconto allo steering?", [], 'OK'],
  [32, "Fammi un business case con ROI e payback per questo progetto", [], 'KO'],
  [33, "Quanto costa in media un progetto SAC Planning?", [], 'OK'],
  [34, "Qual è la policy trasferte della practice?", [], 'OK'],
  // Caso 35: la misura 27/35 ha contato `02-orchestratore` come OK.
  [35, "Cos'è la REGOLA 0 della SAC Factory?", [S.m02_orch], 'OK']
];

function classify(expected, loaded) {
  const uniq = [...new Set(loaded)];
  if (expected.length === 0) return uniq.length === 0 ? 'OK' : 'SPURIA';
  if (uniq.length === 0) return 'NO-SKILL';
  return uniq.some((id) => expected.includes(id)) ? 'OK' : 'KO';
}

const CONCURRENCY = 4;
const results = [];

async function runCase(c) {
  const [n, question, expected, baseline] = c;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await ask(question);
      const esito = classify(expected, r.loadedSkills);
      const row = {
        n, question, expected: expected.map((e) => NAME[e]), baseline,
        loaded: [...new Set(r.loadedSkills)].map((id) => NAME[id] ?? id),
        searches: r.searches, esito, answer: r.answer
      };
      results.push(row);
      console.log(`#${String(n).padStart(2)} ${esito.padEnd(8)} (base ${baseline.padEnd(8)}) load=[${row.loaded.join(',')}] search=${r.searches}`);
      return;
    } catch (e) {
      if (attempt === 1) {
        results.push({ n, question, expected: expected.map((x) => NAME[x]), baseline, loaded: [], searches: 0, esito: 'ERRORE', answer: String(e.message) });
        console.log(`#${String(n).padStart(2)} ERRORE   ${e.message}`);
      }
    }
  }
}

const queue = [...CASES];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await runCase(queue.shift());
}));

results.sort((a, b) => a.n - b.n);
writeFileSync('./results-35-langgraph.json', JSON.stringify(results, null, 2));

const tally = results.reduce((acc, r) => ((acc[r.esito] = (acc[r.esito] || 0) + 1), acc), {});
const ok = tally.OK || 0;
console.log('\n=============================');
console.log(`PUNTEGGIO LANGGRAPH + gpt-5.5 : ${ok}/35   (baseline loop a mano + Claude: 27/35)`);
console.log('Ripartizione:', JSON.stringify(tally));
console.log('\nDIFFERENZE RISPETTO ALLA BASELINE:');
for (const r of results) {
  if (r.esito !== r.baseline) console.log(`  #${r.n}: ${r.baseline} -> ${r.esito}  [load: ${r.loaded.join(',') || 'nessuna'}]  ${r.question.slice(0, 55)}`);
}
