const {
  MAX_ITERATIONS,
  TOOLS,
  loadSkillManifest,
  buildSystemPrompt,
  createSourceCollector,
  runSearchKnowledge,
  runLoadSkill,
  sanitizeHistory
} = require('./agent');
const { createChatModel } = require('./ai');

// Il motore LangGraph. Sostituisce il tool loop scritto a mano di agent.js
// mantenendo identici: i due tool (stesse description, stesso SQL pesato per
// certificationLevel), il system prompt con le regole numerate, il tetto di
// iterazioni, la firma di runAgent e il contratto degli eventi onEvent.
// Quello che cambia è sotto: modello gpt-5.5 via AzureOpenAiChatClient, con
// i tool passati per singola richiesta invece che fissati sul client.

// createReactAgent alterna i nodi `agent` e `tools`: un giro modello→tool
// costa due passi, più il passo finale del modello che risponde. Il tetto
// resta quello di agent.js (MAX_ITERATIONS giri) tradotto in passi di grafo.
const RECURSION_LIMIT = MAX_ITERATIONS * 2 + 1;

const TRUNCATION_NOTE =
  'Non sono riuscito a completare la richiesta entro il numero massimo di passaggi. Prova a riformulare la domanda in modo più circoscritto.';

// Errori di rete verso i servizi SAP che su questa rete capitano in modo
// intermittente: vale un secondo tentativo prima di dichiarare fallita
// l'invocazione, ma solo se non abbiamo già emesso nulla verso il client.
function isTransient(error) {
  const text = `${error?.code || ''} ${error?.cause?.code || ''} ${error?.message || ''}`;
  return /EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed/i.test(text);
}

function isRecursionLimit(error) {
  return error?.name === 'GraphRecursionError' || /[Rr]ecursion limit/.test(error?.message || '');
}

function isAbort(error) {
  return error?.name === 'AbortError' || /aborted/i.test(error?.message || '');
}

// Il content di un messaggio LangChain è una stringa oppure un array di parti
// tipizzate (i modelli di ragionamento usano la seconda forma). Qui serve solo
// il testo: le parti non testuali — reasoning incluso — non vanno all'utente.
function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}

// Il ToolNode di LangGraph cattura gli errori dei tool e li restituisce al
// modello come ToolMessage con status 'error' (stesso comportamento del loop
// a mano, dove un tool rotto tornava come contenuto del messaggio 'tool').
// `ok:false` nell'evento `result` deve riflettere quello stato.
function toolOutputToSummary(output) {
  const content = typeof output === 'string' ? output : extractText(output?.content);
  return {
    ok: output?.status !== 'error',
    summary: String(content ?? '').slice(0, 200)
  };
}

// I due tool, con le description prese verbatim da agent.js e il corpo che
// richiama le stesse funzioni di query: il peso per certificazione e le
// regole su published/type sono business logic, non vanno duplicate qui.
// Lo schema è JSON Schema (non zod) proprio per riusare TOOLS[].parameters.
async function buildTools(sources) {
  const { tool } = await import('@langchain/core/tools');
  const spec = Object.fromEntries(TOOLS.map((t) => [t.function.name, t.function]));

  return [
    tool(async (args) => runSearchKnowledge(args || {}, sources), {
      name: 'searchKnowledge',
      description: spec.searchKnowledge.description,
      schema: spec.searchKnowledge.parameters
    }),
    tool(async (args) => runLoadSkill(args || {}, sources), {
      name: 'loadSkill',
      description: spec.loadSkill.description,
      schema: spec.loadSkill.parameters
    })
  ];
}

async function buildMessages(question, history) {
  const { HumanMessage, AIMessage } = await import('@langchain/core/messages');
  const messages = sanitizeHistory(history).map((m) =>
    m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content)
  );
  messages.push(new HumanMessage(question));
  return messages;
}

// Un solo giro di esecuzione del grafo. Separato da runAgent perché il retry
// sui guasti di rete transitori lo rilancia da capo.
async function runOnce({ agent, messages, config, emit, streaming }) {
  let answer = '';
  let lastText = '';

  if (!streaming) {
    const state = await agent.invoke({ messages }, config);
    const finalMessage = state?.messages?.[state.messages.length - 1];
    return extractText(finalMessage?.content);
  }

  // streamEvents dà eventi di forma LangChain: qui vengono rimappati sul
  // contratto di API-CONTRACT.md, che il resto dell'app (rotta SSE e
  // frontend) consuma. La forma degli eventi emessi non deve cambiare.
  const stream = agent.streamEvents({ messages }, { ...config, version: 'v2' });

  for await (const event of stream) {
    switch (event.event) {
      case 'on_chat_model_stream': {
        const text = extractText(event.data?.chunk?.content);
        if (text) emit({ type: 'delta', text });
        break;
      }
      case 'on_chat_model_end': {
        const output = event.data?.output;
        const text = extractText(output?.content);
        if (text) lastText = text;
        // Un turno senza tool call è la risposta finale; se invece il modello
        // ha chiesto un tool, il testo eventuale è solo un preambolo.
        if (!output?.tool_calls?.length && text) answer = text;
        break;
      }
      case 'on_tool_start': {
        // `input` arriva già deserializzato, a differenza degli arguments
        // JSON grezzi dell'Orchestration Service.
        emit({ type: 'tool', name: event.name, args: event.data?.input || {} });
        break;
      }
      case 'on_tool_end': {
        const { ok, summary } = toolOutputToSummary(event.data?.output);
        emit({ type: 'result', name: event.name, ok, summary });
        break;
      }
      default:
        break;
    }
  }

  return answer || lastText;
}

/**
 * Agent loop su LangGraph: il modello decide da solo se cercare nei documenti
 * (searchKnowledge) e/o caricare ed eseguire una skill (loadSkill).
 *
 * Firma e valore di ritorno identici a quelli di agent.js#runAgent: i due
 * motori sono intercambiabili dietro il flag BILLY_ENGINE (billy-service.js).
 *
 * @param {object} opts
 * @param {string} opts.question   domanda corrente dell'utente
 * @param {Array}  [opts.history]  turni precedenti [{role:'user'|'assistant', content}]
 * @param {AbortSignal} [opts.signal] se abortito (client disconnesso) il grafo
 *   si ferma al primo punto utile invece di restare orfano.
 * @param {Function} [opts.onEvent] callback per i passi intermedi. Se presente
 *   la generazione avviene in streaming. Eventi emessi (vedi API-CONTRACT.md):
 *     { type:'tool',   name, args }            — sto per eseguire un tool
 *     { type:'result', name, ok, summary }     — tool eseguito
 *     { type:'delta',  text }                  — pezzo di testo della risposta
 *     { type:'answer', answer, sources }       — risposta finale
 *     { type:'error',  message }               — invocazione fallita
 * @returns {Promise<{answer: string, sources: Array}>}
 */
async function runAgent({ question, history = [], onEvent, signal } = {}) {
  const { createReactAgent } = await import('@langchain/langgraph/prebuilt');

  const sources = createSourceCollector();
  let emitted = false;
  const emit = (event) => {
    if (!onEvent) return;
    emitted = true;
    try { onEvent(event); } catch (e) { /* un consumer rotto non deve fermare l'agente */ }
  };

  const skills = await loadSkillManifest();
  const streaming = Boolean(onEvent);

  const agent = createReactAgent({
    // @sap-ai-sdk/foundation-models crasha su chunk senza `delta` (es. il
    // chunk finale con solo `usage`): getDeltaToolCalls legge `.tool_calls`
    // su `this.data.delta` undefined. Soluzione: modello non-streaming anche
    // nel path SSE. LangGraph emette ugualmente on_tool_start/end e
    // on_chat_model_end via streamEvents — si perde solo il token-by-token.
    llm: await createChatModel({ streaming: false }),
    tools: await buildTools(sources),
    // Il system prompt è quello di agent.js, regole numerate comprese: sono
    // tarate in misura, riscriverle invalida il confronto fra i due motori.
    prompt: buildSystemPrompt(skills)
  });

  const messages = await buildMessages(question, history);
  const config = { recursionLimit: RECURSION_LIMIT, signal };

  let answer = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      answer = await runOnce({ agent, messages, config, emit, streaming });
      break;
    } catch (e) {
      if (isAbort(e) || signal?.aborted) {
        // Client sparito: si chiude con quello che si ha, senza errore.
        return { answer: '', sources: sources.list() };
      }
      if (isRecursionLimit(e)) {
        answer = TRUNCATION_NOTE;
        break;
      }
      // DNS verso i servizi SAP intermittente da alcune reti: un secondo
      // tentativo ha senso solo se il client non ha ancora visto niente,
      // altrimenti la risposta risulterebbe duplicata a metà.
      if (attempt === 0 && isTransient(e) && !emitted) {
        console.warn('Invocazione LangGraph fallita, riprovo una volta:', e.message);
        continue;
      }
      console.error('Motore LangGraph fallito:', e);
      emit({ type: 'error', message: e.message });
      throw e;
    }
  }

  const result = { answer: answer || '', sources: sources.list() };
  emit({ type: 'answer', ...result });
  return result;
}

module.exports = { runAgent, RECURSION_LIMIT };
