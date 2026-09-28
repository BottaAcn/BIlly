// Prova singola dell'agente LangGraph replica, prima di lanciare i 35 casi.
import { ask } from './billy-langgraph-agent.js';
const q = "Ho stimato 120 giorni per questo progetto SAC Planning, me la sfidi prima che la mandi al cliente?";
const r = await ask(q);
console.log('TRACE:', JSON.stringify(r.trace.map(t => t.name + ':' + (t.args.skillId ?? t.args.query?.slice(0,40)))), null, 2);
console.log('SKILL CARICATE:', r.loadedSkills);
console.log('RISPOSTA (primi 300):', r.answer.slice(0, 300));
