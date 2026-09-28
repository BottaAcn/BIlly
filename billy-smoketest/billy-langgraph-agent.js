// Replica minima dell'agente di Billy (billy-app/srv/lib/agent.js, 363 righe)
// in LangGraph JS su gpt-5.5 via AzureOpenAiChatClient (NO Orchestration).
//
// Fedeltà rispetto all'originale:
//  - stesso system prompt + manifesto, copiati VERBATIM da buildSystemPrompt()
//  - stessi due tool (searchKnowledge, loadSkill) con le stesse description
//  - stesso tetto di 5 iterazioni
//  - stesso catalogo (22 skill pubblicate, lette dal Billy deployato su CF)
//
// DEVIAZIONE NOTA (vedi report): i tool girano contro gli endpoint REST di CF,
// non contro HANA. `/rest/catalog/deepSearch` restituisce asset+similarity ma
// NON il testo del chunk, e `/rest/catalog/Asset/{id}` esclude `content`
// (la proiezione CAP lo toglie di proposito). Quindi il CORPO delle skill e il
// TESTO dei chunk non sono disponibili in questo harness.
import { RESOURCE_GROUP } from './auth.js';
import { AzureOpenAiChatClient } from '@sap-ai-sdk/langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

const CF = 'https://accenture-global-solutions-ltd-accenture-sapdiscover-it67bfc13e.cfapps.eu10-004.hana.ondemand.com';
export const MAX_ITERATIONS = 5;

// La DNS verso CF/SAP da questa macchina è intermittente: un retry singolo
// evita di contare un errore di rete come un fallimento di routing.
async function getJson(url, attempt = 0) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (attempt < 4) {
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      return getJson(url, attempt + 1);
    }
    throw e;
  }
}

let catalogCache = null;
export async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const all = await getJson(`${CF}/rest/catalog/Asset?$select=ID,title,description,type,certificationLevel,published`);
  catalogCache = {
    byId: new Map(all.map((a) => [a.ID, a])),
    skills: all.filter((a) => a.published && a.type === 'skill')
  };
  return catalogCache;
}

// --- buildSystemPrompt(): copiato VERBATIM da billy-app/srv/lib/agent.js ---
export function buildSystemPrompt(skills) {
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

/** Costruisce l'agente. `trace` raccoglie le chiamate tool per la misura. */
export async function buildAgent(trace) {
  const catalog = await loadCatalog();

  const searchKnowledge = tool(
    async ({ query }) => {
      trace.push({ name: 'searchKnowledge', args: { query } });
      const rows = await getJson(`${CF}/rest/catalog/deepSearch?query=${encodeURIComponent(query)}`);
      const top = rows.slice(0, 3);
      if (!top.length) return 'Nessun documento pertinente trovato in archivio per questa query.';
      return top.map((r) => {
        const a = catalog.byId.get(r.assetId);
        const cert = a?.certificationLevel ?? 'community';
        return `- [${cert}] ${r.title}: ${a?.description || '(estratto non disponibile in questo ambiente di misura)'}`;
      }).join('\n');
    },
    {
      name: 'searchKnowledge',
      description:
        'Cerca per similarità semantica nei documenti del marketplace (policy, procedure, note, materiale di practice). ' +
        'Restituisce i frammenti più pertinenti con il loro livello di certificazione. ' +
        'Usalo per qualsiasi domanda su fatti, regole o contenuti aziendali. Puoi chiamarlo più volte con query diverse.',
      schema: z.object({
        query: z.string().describe('La query di ricerca, in linguaggio naturale. Riformula la domanda dell\'utente con i termini che ti aspetti nei documenti.')
      })
    }
  );

  const loadSkill = tool(
    async ({ skillId }) => {
      trace.push({ name: 'loadSkill', args: { skillId } });
      const a = catalog.byId.get((skillId || '').trim());
      if (!a) return `Nessuna skill trovata con ID ${skillId}. Controlla l'elenco "Skill disponibili".`;
      if (a.type !== 'skill') return `L'asset ${skillId} ("${a.title}") non è una skill ma un asset di tipo "${a.type}". Usa searchKnowledge per consultarlo.`;
      if (!a.published) return `La skill "${a.title}" non è pubblicata e non può essere usata.`;
      // Il corpo vive solo su HANA e non è esposto via REST: restituiamo un
      // segnaposto ESPLICITO. Non inventiamo una procedura.
      return `# Skill: ${a.title}\n\nScopo: ${a.description || ''}\n\n[Corpo della procedura non recuperabile in questo ambiente di misura. Consideralo caricato: procedi con la risposta secondo lo scopo dichiarato e NON tentare di ricaricare altre skill per compensare.]`;
    },
    {
      name: 'loadSkill',
      description:
        'Carica il testo completo di una skill pubblicata nel marketplace, a partire dal suo ID (lo trovi nell\'elenco "Skill disponibili" nelle istruzioni di sistema). ' +
        'Una skill è una procedura operativa da eseguire, non una fonte da citare: dopo averla caricata devi seguirne i passi.',
      schema: z.object({
        skillId: z.string().describe('L\'ID (UUID) della skill, copiato esattamente dall\'elenco "Skill disponibili".')
      })
    }
  );

  const model = new AzureOpenAiChatClient({
    modelName: 'gpt-5.5',
    resourceGroup: RESOURCE_GROUP,
    max_tokens: 4096
  });

  const agent = createReactAgent({ llm: model, tools: [searchKnowledge, loadSkill] });
  return { agent, systemPrompt: buildSystemPrompt(catalog.skills), catalog };
}

/** Un turno, senza history — come nella misura del 27/35. */
export async function ask(question) {
  const trace = [];
  const { agent, systemPrompt } = await buildAgent(trace);
  const res = await agent.invoke(
    { messages: [new SystemMessage(systemPrompt), new HumanMessage(question)] },
    // MAX_ITERATIONS=5 giri modello->tool->modello; in LangGraph un "giro" è
    // due nodi (agent + tools), più il nodo finale che scrive la risposta.
    { recursionLimit: MAX_ITERATIONS * 2 + 1 }
  );
  const last = res.messages[res.messages.length - 1];
  return {
    answer: typeof last.content === 'string' ? last.content : JSON.stringify(last.content),
    trace,
    loadedSkills: trace.filter((t) => t.name === 'loadSkill').map((t) => t.args.skillId),
    searches: trace.filter((t) => t.name === 'searchKnowledge').length
  };
}
