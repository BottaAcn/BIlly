const cds = require('@sap/cds');
const { embed, RESOURCE_GROUP, LLM_MODEL } = require('./ai');

// Peso applicato alla similarity grezza in base allo stato di certificazione
// (architecture.md §4 / D10). 'deprecated' non compare qui: è escluso a
// monte dalla query, non solo penalizzato. Valori aggiornati in Fase 2
// (salto netto tra certifiedOutdated e community, richiesta esplicita).
// Vive qui e non più in billy-service.js: il retrieval è un tool
// dell'agente, non più un passo obbligatorio della pipeline.
const CERTIFICATION_WEIGHT_SQL = `
  CASE c."CERTIFICATIONLEVEL"
    WHEN 'certified' THEN 1.0
    WHEN 'certifiedOutdated' THEN 0.75
    WHEN 'community' THEN 0.35
    ELSE 0.35
  END`;

// Tetto al numero di giri modello→tool→modello. Oltre questo si chiude con
// una risposta parziale: meglio un messaggio onesto di un loop infinito.
const MAX_ITERATIONS = 5;
// Quanti turni della conversazione precedente rimandare al modello.
const MAX_HISTORY_MESSAGES = 20;

// I due tool esposti al modello. Sono fissati alla costruzione del client
// (limite dell'Orchestration Service: `tools` non è per-richiesta), quindi
// il client viene costruito una volta per invocazione di runAgent.
// `tool_choice` non è supportato: il routing è automatico e guidato dalle
// description qui sotto e dal system prompt.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'searchKnowledge',
      description:
        'Cerca per similarità semantica nei documenti del marketplace (policy, procedure, note, materiale di practice). ' +
        'Restituisce i frammenti più pertinenti con il loro livello di certificazione. ' +
        'Usalo per qualsiasi domanda su fatti, regole o contenuti aziendali. Puoi chiamarlo più volte con query diverse.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'La query di ricerca, in linguaggio naturale. Riformula la domanda dell\'utente con i termini che ti aspetti nei documenti.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'loadSkill',
      description:
        'Carica il testo completo di una skill pubblicata nel marketplace, a partire dal suo ID (lo trovi nell\'elenco "Skill disponibili" nelle istruzioni di sistema). ' +
        'Una skill è una procedura operativa da eseguire, non una fonte da citare: dopo averla caricata devi seguirne i passi.',
      parameters: {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: 'L\'ID (UUID) della skill, copiato esattamente dall\'elenco "Skill disponibili".'
          }
        },
        required: ['skillId']
      }
    }
  }
];

// Livello 1 della progressive disclosure: solo title + description di ogni
// skill pubblicata (~80 token l'una). Il corpo arriva solo se il modello
// chiama loadSkill. Quando le skill saranno centinaia questo elenco andrà
// sostituito con un top-N recuperato per embedding sulle sole description:
// l'interfaccia verso il modello non cambia.
async function loadSkillManifest() {
  try {
    return await SELECT.from('billy.Asset')
      .columns('ID', 'title', 'description')
      .where({ published: true, type: 'skill' });
  } catch (e) {
    console.error('Manifesto skill non caricato:', e.message);
    return [];
  }
}

// Il manifesto è l'unico livello 1 della progressive disclosure: va letto
// come indice, non come contenuto. Le regole 3-6 sono prescrittive (e non
// descrittive) perché in misura il modello si accontentava della
// description — la nominava in risposta senza mai chiamare loadSkill.
function buildSystemPrompt(skills) {
  const manifest = skills.length
    ? skills.map((s) => `- ID: ${s.ID}\n  Titolo: ${s.title}\n  Quando sceglierla: ${s.description || '(nessuna descrizione)'}`).join('\n')
    : '(nessuna skill pubblicata al momento)';

  return [
    'Sei Billy, l\'assistente della practice. Rispondi in italiano, in Markdown.',
    '',
    'Hai a disposizione due strumenti:',
    '- `searchKnowledge(query)` per cercare nei documenti del marketplace;',
    '- `loadSkill(skillId)` per caricare il testo completo di una skill.',
    '',
    'Regole di comportamento:',
    '1. Se la domanda riguarda fatti, policy o contenuti della practice, chiama `searchKnowledge` prima di rispondere. Non inventare: se non trovi nulla di pertinente, dillo esplicitamente.',
    '2. Ogni frammento restituito da `searchKnowledge` è preceduto dal suo stato di certificazione tra parentesi quadre. Se usi per la risposta una fonte che non è "certified", avvisa esplicitamente l\'utente che l\'informazione non è (ancora) certificata.',
    '3. L\'elenco "Skill disponibili" è **solo un indice**: serve a scegliere, non contiene la procedura. La riga "Quando sceglierla" **non è** la skill: non è contenuto da riportare all\'utente e non basta mai per rispondere.',
    '4. Se una delle skill elencate è pertinente alla richiesta, **devi** chiamare `loadSkill` con il suo ID **prima di scrivere la risposta**, e poi eseguirla: segui i suoi passi e produci il risultato che descrive. Vale anche se pensi di sapere già la risposta, anche se ti manca un documento o un dato dell\'utente (carica prima, chiedi dopo) e anche se la userai solo in parte. Non limitarti a citarla o a riassumerla.',
    '5. Non nominare in risposta una skill che non hai caricato in questo turno: se la citi, devi averla caricata.',
    '6. Se invece nessuna skill è davvero pertinente, non caricarne nessuna: rispondi con `searchKnowledge` o ammetti di non saperlo. Caricare una skill a sproposito è un errore tanto quanto non caricarla quando serve.',
    '7. Esegui una skill entro i suoi confini: fai ciò che la skill copre e di\' esplicitamente cosa resta fuori dal suo scopo, invece di accettare l\'incarico intero.',
    '8. Puoi usare più strumenti, anche in sequenza (per esempio cercare i dati e poi applicarci una skill).',
    '9. Non mostrare all\'utente gli ID tecnici delle skill: usa i loro titoli. Allo stesso modo i termini interni che compaiono nell\'indice (nomi di file, di script o di artefatti come `spec.json`) sono gergo del catalogo: non usarli con l\'utente se non arrivano dal corpo di una skill che hai caricato.',
    '',
    '## Skill disponibili',
    '_Indice per la scelta, non contenuto: per usare una di queste skill devi caricarla con `loadSkill`._',
    manifest
  ].join('\n');
}

// Tronca un contenuto troppo lungo per non far esplodere il contesto su
// documenti/skill fuori scala. Il limite è generoso: una skill intera deve
// passare intera, è tutto il senso del meccanismo.
function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}\n\n[...contenuto troncato...]` : text;
}

// Raccoglitore delle fonti citate dalla risposta finale. Deduplica per
// asset: lo stesso documento trovato da due query diverse è una fonte sola.
function createSourceCollector() {
  const byAsset = new Map();
  return {
    add(source) {
      const existing = byAsset.get(source.assetId);
      if (!existing) {
        byAsset.set(source.assetId, source);
        return;
      }
      // Similarity più alta vince; una fonte skill (similarity null) non
      // sovrascrive quella di un chunk dello stesso asset.
      if (source.similarity != null && (existing.similarity == null || source.similarity > existing.similarity)) {
        existing.similarity = source.similarity;
      }
    },
    list() {
      return [...byAsset.values()];
    }
  };
}

async function runSearchKnowledge(args, sources) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return 'Errore: parametro "query" mancante o vuoto.';

  const qEmbedding = await embed(query);

  // "TEXT" va quotata: è parola riservata in SQL HANA. Esclude i chunk
  // di asset 'deprecated' (WHERE, non solo penalizzati) e pesa la
  // similarity per certificationLevel (architecture.md §4, D10). I chunk
  // esistono solo per asset pubblicati (Fase 2 — invariante applicativa,
  // vedi CatalogService.onUploadAsset/onReviewRevision), nessun filtro
  // aggiuntivo su published necessario qui. Le skill non hanno chunk
  // (Fase 11): non compaiono mai qui, si caricano con loadSkill.
  const rows = await cds.run(
    `SELECT TOP 3 a."ID" as "ASSETID", a."TITLE" as "TITLE", c."TEXT" as "TEXT",
            c."CERTIFICATIONLEVEL" as "CERTIFICATIONLEVEL",
            COSINE_SIMILARITY(c."EMBEDDING", TO_REAL_VECTOR(?)) * ${CERTIFICATION_WEIGHT_SQL} AS "SIMILARITY"
     FROM "BILLY_CHUNK" as c
     JOIN "BILLY_ASSET" as a ON a."ID" = c."ASSET_ID"
     WHERE c."CERTIFICATIONLEVEL" != 'deprecated'
     ORDER BY "SIMILARITY" DESC`,
    [`[${qEmbedding.join(',')}]`]
  );

  if (!rows.length) return 'Nessun documento pertinente trovato in archivio per questa query.';

  rows.forEach((r) => sources.add({
    assetId: r.ASSETID,
    title: r.TITLE,
    similarity: r.SIMILARITY,
    certificationLevel: r.CERTIFICATIONLEVEL,
    link: `/catalog/asset/${r.ASSETID}`
  }));

  return rows.map((r) => `- [${r.CERTIFICATIONLEVEL}] ${r.TITLE}: ${r.TEXT}`).join('\n');
}

async function runLoadSkill(args, sources) {
  const skillId = typeof args.skillId === 'string' ? args.skillId.trim() : '';
  if (!skillId) return 'Errore: parametro "skillId" mancante o vuoto.';

  let asset;
  try {
    asset = await SELECT.one.from('billy.Asset')
      .columns('ID', 'title', 'type', 'content', 'certificationLevel', 'published')
      .where({ ID: skillId });
  } catch (e) {
    // ID malformato (non UUID): HANA rifiuta il confronto. È un errore
    // recuperabile dal modello, non un crash del loop.
    return `Errore: "${skillId}" non è un ID valido. Usa esattamente uno degli ID elencati in "Skill disponibili".`;
  }

  if (!asset) return `Nessuna skill trovata con ID ${skillId}. Controlla l'elenco "Skill disponibili".`;
  if (asset.type !== 'skill') return `L'asset ${skillId} ("${asset.title}") non è una skill ma un asset di tipo "${asset.type}". Usa searchKnowledge per consultarlo.`;
  if (!asset.published) return `La skill "${asset.title}" non è pubblicata e non può essere usata.`;
  if (!asset.content) return `La skill "${asset.title}" non ha un contenuto disponibile.`;

  sources.add({
    assetId: asset.ID,
    title: asset.title,
    // Una skill non è recuperata per similarità: il modello la sceglie dal
    // manifesto. `null` è la convenzione che distingue una fonte-skill da
    // una fonte-documento (vedi API-CONTRACT.md §1).
    similarity: null,
    certificationLevel: asset.certificationLevel,
    link: `/catalog/asset/${asset.ID}`
  });

  return `# Skill: ${asset.title}\n\n${truncate(asset.content, 60000)}`;
}

async function executeTool(name, args, sources) {
  if (name === 'searchKnowledge') return runSearchKnowledge(args, sources);
  if (name === 'loadSkill') return runLoadSkill(args, sources);
  return `Errore: strumento "${name}" sconosciuto.`;
}

function parseArgs(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return null;
  }
}

// Normalizza lo storico che arriva dal client: solo turni user/assistant
// con contenuto testuale, gli ultimi MAX_HISTORY_MESSAGES.
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: truncate(m.content, 8000) }));
}

/**
 * Agent loop: il modello decide da solo se cercare nei documenti
 * (searchKnowledge) e/o caricare ed eseguire una skill (loadSkill).
 *
 * @param {object} opts
 * @param {string} opts.question   domanda corrente dell'utente
 * @param {Array}  [opts.history]  turni precedenti [{role:'user'|'assistant', content}]
 * @param {AbortSignal} [opts.signal] se abortito (client disconnesso) il loop
 *   si ferma al primo punto utile invece di restare orfano.
 * @param {Function} [opts.onEvent] callback per i passi intermedi. Se presente
 *   la generazione avviene in streaming. Eventi emessi (vedi API-CONTRACT.md):
 *     { type:'tool',   name, args }            — sto per eseguire un tool
 *     { type:'result', name, ok, summary }     — tool eseguito
 *     { type:'delta',  text }                  — pezzo di testo della risposta
 *     { type:'answer', answer, sources }       — risposta finale
 * @returns {Promise<{answer: string, sources: Array}>}
 */
async function runAgent({ question, history = [], onEvent, signal } = {}) {
  const { OrchestrationClient } = await import('@sap-ai-sdk/orchestration');

  const skills = await loadSkillManifest();
  const sources = createSourceCollector();
  const emit = (event) => {
    if (!onEvent) return;
    try { onEvent(event); } catch (e) { /* un consumer rotto non deve fermare l'agente */ }
  };

  const client = new OrchestrationClient(
    {
      promptTemplating: {
        model: { name: LLM_MODEL, params: { max_tokens: 4096 } },
        prompt: { tools: TOOLS }
      }
    },
    { resourceGroup: RESOURCE_GROUP }
  );

  // Conversazione ricostruita esplicitamente ad ogni giro invece di
  // rimbalzare getAllMessages() come messagesHistory: quel metodo deriva
  // lo storico da intermediate_results.templating, che riflette il singolo
  // scambio, non la catena completa di tool call. Qui serve determinismo.
  const conversation = [
    { role: 'system', content: buildSystemPrompt(skills) },
    ...sanitizeHistory(history),
    { role: 'user', content: question }
  ];

  let answer = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return { answer: answer || '', sources: sources.list() };
    let assistantMessage;
    let toolCalls;

    if (onEvent) {
      const res = await client.stream({ messages: conversation }, signal);
      for await (const chunk of res.stream) {
        const delta = chunk.getDeltaContent();
        if (delta) emit({ type: 'delta', text: delta });
      }
      assistantMessage = res.getAssistantMessage();
      toolCalls = res.getToolCalls();
    } else {
      const res = await client.chatCompletion({ messages: conversation });
      assistantMessage = res.getAssistantMessage();
      toolCalls = res.getToolCalls();
    }

    const content = typeof assistantMessage?.content === 'string' ? assistantMessage.content : '';
    conversation.push(assistantMessage || { role: 'assistant', content });

    if (!toolCalls || !toolCalls.length) {
      answer = content;
      break;
    }

    // Il modello può chiamare più tool nello stesso turno: vanno eseguiti
    // tutti e restituiti tutti, uno per tool_call_id.
    for (const call of toolCalls) {
      if (signal?.aborted) return { answer: answer || '', sources: sources.list() };
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      emit({ type: 'tool', name, args: args || {} });

      let result;
      let ok = true;
      if (args === null) {
        ok = false;
        result = `Errore: argomenti non validi (JSON malformato) per "${name}".`;
      } else {
        try {
          result = await executeTool(name, args, sources);
        } catch (e) {
          // Un tool che fallisce torna al modello come contenuto del
          // messaggio 'tool': deve poter riprovare, non far cadere il loop.
          ok = false;
          result = `Errore nell'esecuzione di "${name}": ${e.message}`;
          console.error(`Tool ${name} fallito:`, e);
        }
      }

      emit({ type: 'result', name, ok, summary: String(result).slice(0, 200) });
      conversation.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }

    // Ultimo giro consumato senza una risposta finale: si chiude con quello
    // che il modello ha già scritto, senza rilanciare all'infinito.
    if (iteration === MAX_ITERATIONS - 1) {
      answer = content || 'Non sono riuscito a completare la richiesta entro il numero massimo di passaggi. Prova a riformulare la domanda in modo più circoscritto.';
    }
  }

  const result = { answer: answer || '', sources: sources.list() };
  emit({ type: 'answer', ...result });
  return result;
}

module.exports = { runAgent, CERTIFICATION_WEIGHT_SQL, MAX_ITERATIONS };
