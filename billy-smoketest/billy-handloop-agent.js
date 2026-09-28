// CONTROLLO SPERIMENTALE: lo stesso loop a mano di billy-app/srv/lib/agent.js
// (while + tool_calls + max 5 iterazioni), ma su gpt-5.5 e con gli stessi due
// tool della replica LangGraph. Serve a separare le due variabili:
//   LangGraph vs loop a mano, a MODELLO COSTANTE (gpt-5.5) e TOOL COSTANTI.
import { makeTools, makeModel, MAX_ITERATIONS } from './billy-langgraph-agent.js';
import { SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

export async function ask(question) {
  const trace = [];
  const { searchKnowledge, loadSkill, systemPrompt } = await makeTools(trace);
  const byName = { searchKnowledge, loadSkill };
  const model = makeModel().bindTools([searchKnowledge, loadSkill]);

  const messages = [new SystemMessage(systemPrompt), new HumanMessage(question)];
  let answer = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await model.invoke(messages);
    messages.push(res);
    const calls = res.tool_calls ?? [];
    if (!calls.length) {
      answer = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      break;
    }
    for (const c of calls) {
      let out;
      try {
        out = await byName[c.name].invoke(c.args);
      } catch (e) {
        out = `Errore: strumento "${c.name}" non eseguibile (${e.message}).`;
      }
      messages.push(new ToolMessage({ content: String(out), tool_call_id: c.id, name: c.name }));
    }
  }
  if (!answer) answer = '[tetto di iterazioni raggiunto senza risposta finale]';

  return {
    answer,
    trace,
    loadedSkills: trace.filter((t) => t.name === 'loadSkill').map((t) => t.args.skillId),
    searches: trace.filter((t) => t.name === 'searchKnowledge').length
  };
}
