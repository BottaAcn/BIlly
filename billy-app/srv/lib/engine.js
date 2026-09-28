// Selettore del motore agentico. I due motori — graph.js (LangGraph, gpt-5.5)
// e agent.js (tool loop a mano, Orchestration/Claude) — espongono la stessa
// firma `runAgent({question, history, onEvent, signal})` e lo stesso oggetto
// di ritorno `{answer, sources}`: chi li chiama non deve sapere quale sta
// usando. Il flag serve a poter tornare indietro in produzione senza deploy
// di codice; agent.js resterà finché il confronto non è chiuso.
//
//   BILLY_ENGINE=graph   (default) motore LangGraph
//   BILLY_ENGINE=legacy            tool loop originale
function engineName() {
  const raw = (process.env.BILLY_ENGINE || 'graph').trim().toLowerCase();
  return raw === 'legacy' ? 'legacy' : 'graph';
}

// Risolto a ogni chiamata e non al require: così una modifica della variabile
// d'ambiente vale senza riavvio e i test possono alternare i due motori.
function selectEngine() {
  return engineName() === 'legacy' ? require('./agent') : require('./graph');
}

module.exports = { selectEngine, engineName };
