import { api, readFileAsBase64 } from '../api.js';
import { escapeHtml } from '../utils.js';
import { refreshQueueCount } from './queue-view.js';

const toasts = document.getElementById('toast-container');

// Stesso limite del backend (srv/lib/text-extraction.js, MAX_FILE_SIZE_BYTES):
// validare qui evita un giro di rete inutile per un file che il server
// rifiuterebbe comunque.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt'];

// db/schema.cds: Asset.description e' String(2000). Superarlo fa fallire
// l'INSERT lato HANA, quindi la composizione viene tagliata qui.
const MAX_DESCRIPTION = 2000;

/* =====================================================================
   TABELLA DI CONFIGURAZIONE DEL WIZARD

   Perche' dichiarativa: quello che serve a Billy per *usare davvero* un
   asset cambia col tipo (una skill deve dichiarare input e output perche'
   l'agente la esegue, un'applicazione no), e l'elenco dei campi e'
   destinato a cambiare mano a mano che si capisce cosa manca. Tenere la
   forma del wizard in una struttura dati significa che aggiungere un
   campo o uno step e' una modifica di dati: barra degli step, validazione,
   riepilogo e composizione del payload si adattano da soli al numero di
   step del tipo scelto.

   Ogni campo dichiara dove finisce nel contratto backend (che NON cambia,
   vedi srv/catalog-service.cds: title / description / type / content /
   externalLink / file*):
     - target 'title' / 'externalLink' : colonna vera su Asset
     - target 'description'            : concatenato dentro description
     - target 'content'                : sezione markdown dentro content
     - control 'body'                  : il corpo vero (testo o file)

   'section' e' l'intestazione markdown usata in content; 'descLabel' il
   prefisso usato in description ('bare: true' = nessun prefisso, il testo
   E' la description — serve alle skill, dove agent.js stampa la
   description sotto "Quando usarla:" nel manifesto letto dall'agente).
   ===================================================================== */

const TITLE_FIELD = {
  key: 'title', label: 'Titolo', control: 'text', required: true,
  target: 'title', placeholder: 'Es. Policy smart working 2025',
  errorText: 'Inserisci un titolo per continuare.'
};

const TYPE_FIELD = { key: 'type', label: 'Tipo di asset', control: 'type', required: true, target: 'type' };

const OPTIONAL_LINK = {
  key: 'externalLink', label: 'Link esterno (opzionale)', control: 'text',
  target: 'externalLink', placeholder: 'https://…'
};

const TYPE_WIZARDS = {
  document: {
    label: 'Documento',
    steps: [
      {
        id: 'contesto', label: 'Contesto',
        fields: [
          {
            key: 'purpose', label: 'A cosa serve', control: 'textarea', required: true,
            target: 'description', descLabel: 'A cosa serve', section: 'A cosa serve',
            placeholder: 'Es. Definisce le regole di smart working e i casi di deroga.',
            hint: 'È la riga che i colleghi leggono nel catalogo e su cui lavora la ricerca per parole chiave.'
          },
          {
            key: 'audience', label: 'A chi è utile', control: 'text',
            target: 'description', descLabel: 'A chi è utile', section: 'A chi è utile',
            placeholder: 'Es. Tutta la practice, in particolare i manager'
          }
        ]
      },
      {
        id: 'contenuto', label: 'Contenuto',
        fields: [
          {
            key: 'body', label: 'Contenuto', control: 'body', required: true,
            placeholder: 'Incolla il contenuto…',
            errorText: 'Aggiungi il testo del documento oppure un file.',
            hint: 'È il materiale che viene spezzato in chunk e indicizzato: senza, Billy non può citare il documento.'
          }
        ]
      }
    ]
  },

  skill: {
    label: 'Skill',
    steps: [
      {
        id: 'quando', label: 'Quando usarla',
        fields: [
          {
            key: 'whenToUse', label: 'Quando Billy deve usarla', control: 'textarea', required: true,
            target: 'description', bare: true, section: 'Quando usarla',
            placeholder: 'Usare quando l’utente ha in mano una stima gg/uomo e deve stressarla prima di esporla…',
            hint: 'È l’unico testo che l’agente legge per decidere se invocarla (manifesto skill in srv/lib/agent.js). Descrivi il bisogno che la attiva, non l’artefatto che produce.',
            errorText: 'Senza questo testo l’agente non sa quando invocare la skill.'
          },
          {
            key: 'notWhen', label: 'Quando NON usarla (opzionale)', control: 'textarea',
            target: 'description', descLabel: 'Quando NON usarla', section: 'Quando NON usarla',
            placeholder: 'Es. non redige la risposta di gara, si ferma all’analisi e al go/no-go.',
            hint: 'Un confine esplicito evita che la skill scatti su richieste vicine ma diverse.'
          }
        ]
      },
      {
        id: 'contratto', label: 'Contratto',
        fields: [
          {
            key: 'inputs', label: 'Input richiesti', control: 'textarea', required: true,
            target: 'content', section: 'Input richiesti',
            placeholder: 'Es. il testo della stima, oppure il capitolato incollato dall’utente.',
            hint: 'Cosa deve avere in mano l’agente prima di partire, e cosa deve chiedere all’utente se manca.'
          },
          {
            key: 'outputs', label: 'Output prodotto', control: 'textarea', required: true,
            target: 'content', section: 'Output prodotto',
            placeholder: 'Es. tabella dei rischi + range P50/P80 + contingency consigliata.'
          },
          {
            key: 'example', label: 'Esempio di invocazione (opzionale)', control: 'textarea',
            target: 'content', section: 'Esempio di invocazione',
            placeholder: 'Es. «Mi rivedi questa stima da 120 gg per un rollout SAC su 3 legal entity?»'
          }
        ]
      },
      {
        id: 'procedura', label: 'Procedura',
        fields: [
          {
            key: 'body', label: 'Passi da eseguire', control: 'body', required: true,
            section: 'Procedura',
            placeholder: 'Incolla qui il corpo della skill, cioè i passi che l’agente deve seguire…',
            errorText: 'Una skill senza corpo non è eseguibile: incolla i passi o carica un file.',
            hint: 'Le skill non vengono spezzate in chunk: l’agente le carica intere con loadSkill ed esegue quello che c’è scritto qui.'
          }
        ]
      }
    ]
  },

  interface: {
    label: 'Interfaccia',
    steps: [
      {
        id: 'sintesi', label: 'Sintesi',
        fields: [
          {
            key: 'purpose', label: 'Cosa espone', control: 'textarea', required: true,
            target: 'description', descLabel: 'Cosa espone', section: 'Cosa espone',
            placeholder: 'Es. API di lettura delle anagrafiche cliente dal sistema X.'
          },
          {
            key: 'protocol', label: 'Endpoint e protocollo', control: 'textarea', required: true,
            target: 'content', section: 'Endpoint e protocollo',
            placeholder: 'Es. GET https://…/api/v1/customers — REST/JSON, oppure OData v4 su /odata…'
          },
          Object.assign({}, OPTIONAL_LINK, { label: 'Base URL o documentazione (opzionale)' })
        ]
      },
      {
        id: 'accesso', label: 'Accesso',
        fields: [
          {
            key: 'auth', label: 'Autenticazione', control: 'textarea', required: true,
            target: 'content', section: 'Autenticazione',
            placeholder: 'Es. OAuth2 client credentials, destination BTP «CRM_PROD», scope read.'
          },
          {
            key: 'payload', label: 'Payload di esempio (opzionale)', control: 'textarea',
            target: 'content', section: 'Payload di esempio',
            placeholder: 'Richiesta e risposta di esempio, anche abbreviate.'
          },
          {
            key: 'limits', label: 'Limiti noti (opzionale)', control: 'textarea',
            target: 'content', section: 'Limiti noti',
            placeholder: 'Es. rate limit 100 req/min, niente paginazione oltre 1000 record, ambiente QA spento di notte.'
          }
        ]
      },
      {
        id: 'readme', label: 'README',
        fields: [
          {
            key: 'body', label: 'README approfondito (opzionale)', control: 'body',
            section: 'README',
            placeholder: 'Tutto il resto: casi d’uso, errori tipici, contatti…',
            hint: 'I campi degli step precedenti finiscono già nel contenuto indicizzato: qui va quello che non ci sta.'
          }
        ]
      }
    ]
  },

  application: {
    label: 'Applicazione',
    steps: [
      {
        id: 'uso', label: 'Uso',
        fields: [
          {
            key: 'purpose', label: 'A cosa serve', control: 'textarea', required: true,
            target: 'description', descLabel: 'A cosa serve', section: 'A cosa serve',
            placeholder: 'Es. simulatore di negoziazione per prepararsi a un incontro con procurement.'
          },
          {
            key: 'audience', label: 'Chi può usarla', control: 'text',
            target: 'description', descLabel: 'Chi può usarla', section: 'Chi può usarla',
            placeholder: 'Es. chiunque nella practice SAP D&A'
          }
        ]
      },
      {
        id: 'accesso', label: 'Accesso',
        fields: [
          Object.assign({}, OPTIONAL_LINK, {
            label: 'URL dell’applicazione', required: true,
            errorText: 'Un’applicazione senza URL non è raggiungibile.'
          }),
          {
            key: 'owner', label: 'Owner', control: 'text', required: true,
            target: 'description', descLabel: 'Owner', section: 'Owner',
            placeholder: 'Nome e cognome di chi la mantiene'
          },
          {
            key: 'prerequisites', label: 'Prerequisiti e accessi (opzionale)', control: 'textarea',
            target: 'content', section: 'Prerequisiti e accessi',
            placeholder: 'Es. serve il ruolo «SAC Modeler», si richiede via ticket al team BTP.'
          }
        ]
      }
    ]
  },

  tool: {
    label: 'Tool',
    steps: [
      {
        id: 'cosafa', label: 'Cosa fa',
        fields: [
          {
            key: 'purpose', label: 'Cosa fa', control: 'textarea', required: true,
            target: 'description', descLabel: 'Cosa fa', section: 'Cosa fa',
            placeholder: 'Es. genera il workbook Excel di progettazione SAC a partire da uno spec.json.'
          },
          Object.assign({}, OPTIONAL_LINK, { label: 'Repository o pagina del tool (opzionale)' })
        ]
      },
      {
        id: 'accesso', label: 'Accesso',
        fields: [
          {
            key: 'access', label: 'Come si accede o si installa', control: 'textarea', required: true,
            target: 'content', section: 'Come si accede o si installa',
            placeholder: 'Es. pip install …, oppure copia la cartella in ~/.claude/skills.'
          },
          {
            key: 'prerequisites', label: 'Prerequisiti (opzionale)', control: 'textarea',
            target: 'content', section: 'Prerequisiti',
            placeholder: 'Es. Python 3.11, openpyxl, accesso alla share di progetto.'
          }
        ]
      }
    ]
  },

  other: {
    label: 'Altro',
    steps: [
      {
        id: 'descrizione', label: 'Descrizione',
        fields: [
          {
            key: 'purpose', label: 'Descrizione', control: 'textarea', required: true,
            target: 'description', bare: true, section: 'Descrizione',
            placeholder: 'Che cos’è e perché può servire a qualcun altro.'
          },
          OPTIONAL_LINK
        ]
      },
      {
        id: 'contenuto', label: 'Contenuto',
        fields: [
          {
            key: 'body', label: 'Contenuto (opzionale)', control: 'body',
            placeholder: 'Incolla il contenuto…'
          }
        ]
      }
    ]
  }
};

// Stesso ordine della select del mockup (riga 370) e degli enum di
// db/schema.cds: i `value` sono gia' quelli che il backend si aspetta.
const TYPE_ORDER = ['document', 'skill', 'tool', 'application', 'interface', 'other'];

/* ===================================================================== */

// Icona della dropzone: trascritta dal mockup (riga 383).
const DZ_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>';

// I valori sono tenuti per chiave e NON azzerati al cambio tipo: chi
// compila il titolo, si accorge di aver sbagliato tipo e torna indietro
// non deve riscrivere quello che ha gia' messo.
const state = {
  type: 'document',
  values: { title: '', externalLink: '' },
  bodyTab: 'txt',
  file: null,
  step: 0,
  submitting: false
};

let root = null;

function isAllowedFile(file) {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// Gli step effettivi del tipo corrente: primo step fisso (tipo + titolo),
// in mezzo gli step del tipo presi dalla tabella, riepilogo sempre in coda.
// Il link esterno resta nel primo step come nel mockup, tranne quando il
// tipo se lo prende per se' con una label e un'obbligatorieta' proprie.
function currentSteps() {
  const cfg = TYPE_WIZARDS[state.type] || TYPE_WIZARDS.document;
  const typeOwnsLink = cfg.steps.some((s) => s.fields.some((f) => f.target === 'externalLink'));
  return [
    { id: 'tipo', label: 'Tipo', fields: typeOwnsLink ? [TITLE_FIELD, TYPE_FIELD] : [TITLE_FIELD, TYPE_FIELD, OPTIONAL_LINK] },
    ...cfg.steps,
    { id: 'revisione', label: 'Revisione', fields: [], summary: true }
  ];
}

function allFields() {
  return currentSteps().flatMap((s) => s.fields);
}

function bodyField() {
  return allFields().find((f) => f.control === 'body') || null;
}

function val(key) {
  return (state.values[key] || '').trim();
}

// escapeHtml (utils.js) non tocca le virgolette: dentro un attributo una
// virgoletta digitata nel titolo chiuderebbe l'attributo e sfarinerebbe il
// markup al render successivo. Per gli attributi serve una versione piu'
// stretta, per il testo basta escapeHtml.
function attr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/* --------------------------------------------------------------- render */

function fieldHtml(f) {
  if (f.control === 'type') {
    const opts = TYPE_ORDER
      .map((t) => `<option value="${t}"${t === state.type ? ' selected' : ''}>${escapeHtml(TYPE_WIZARDS[t].label)}</option>`)
      .join('');
    return `<div class="wfl"><label>${escapeHtml(f.label)}</label><select data-key="type">${opts}</select></div>`;
  }

  if (f.control === 'body') {
    const isTxt = state.bodyTab === 'txt';
    const dzText = state.file
      ? `Selezionato: ${escapeHtml(state.file.name)} (${(state.file.size / 1024).toFixed(0)} KB)`
      : 'Trascina o clicca per selezionare';
    return `<div class="wfl"><label>${escapeHtml(f.label)}</label>
      <div class="ftabs">
        <div class="ftab${isTxt ? ' on' : ''}" data-ft="txt">Testo incollato</div>
        <div class="ftab${isTxt ? '' : ' on'}" data-ft="file">File</div>
      </div>
      <div data-ft-pane="txt"${isTxt ? '' : ' style="display:none"'}><textarea data-key="body" placeholder="${attr(f.placeholder || '')}" style="min-height:80px">${escapeHtml(state.values.body || '')}</textarea></div>
      <div data-ft-pane="file"${isTxt ? ' style="display:none"' : ''}><div class="dz${state.file ? ' has-file' : ''}">${DZ_ICON} ${dzText} <span style="font-size:11px;opacity:.6">PDF, DOCX, PPTX, TXT</span></div><input type="file" data-role="file" accept=".pdf,.docx,.pptx,.txt" style="display:none"></div>
      ${f.hint ? `<div class="wfl-hint">${escapeHtml(f.hint)}</div>` : ''}
    </div>`;
  }

  const ph = attr(f.placeholder || '');
  const control = f.control === 'textarea'
    ? `<textarea data-key="${f.key}" placeholder="${ph}">${escapeHtml(state.values[f.key] || '')}</textarea>`
    : `<input data-key="${f.key}" placeholder="${ph}" value="${attr(state.values[f.key] || '')}"/>`;
  return `<div class="wfl"><label>${escapeHtml(f.label)}</label>${control}${f.hint ? `<div class="wfl-hint">${escapeHtml(f.hint)}</div>` : ''}</div>`;
}

function summaryHtml() {
  const rows = [
    `<div class="wsum-row"><span class="wsum-k">Titolo</span><span class="wsum-v">${escapeHtml(val('title') || '—')}</span></div>`,
    `<div class="wsum-row"><span class="wsum-k">Tipo</span><span class="wsum-v">${escapeHtml(TYPE_WIZARDS[state.type].label)}</span></div>`
  ];
  for (const f of allFields()) {
    if (f.key === 'title' || f.control === 'type') continue;
    if (f.control === 'body') {
      // Del corpo non si ristampa il testo: nel riepilogo servirebbe solo
      // a spingere il bottone di invio fuori schermo.
      if (state.file) {
        rows.push(`<div class="wsum-row"><span class="wsum-k">${escapeHtml(f.label)}</span><span class="wsum-v">${escapeHtml(state.file.name)}</span></div>`);
      } else if (val('body')) {
        rows.push(`<div class="wsum-row"><span class="wsum-k">${escapeHtml(f.label)}</span><span class="wsum-v">${val('body').length} caratteri</span></div>`);
      }
      continue;
    }
    const v = val(f.key);
    if (!v) continue;
    // La riga flex del mockup e' pensata per coppie corte: un paragrafo
    // intero schiaccerebbe l'etichetta, quindi va a capo.
    const long = v.length > 60;
    rows.push(`<div class="wsum-row${long ? ' wsum-long' : ''}"><span class="wsum-k">${escapeHtml(f.label)}</span><span class="wsum-v">${escapeHtml(v)}</span></div>`);
  }
  rows.push('<div class="wsum-row"><span class="wsum-k">Stato</span><span class="wsum-badge">In attesa di revisione</span></div>');
  return `<div class="wsum"><div class="wsum-h">Riepilogo</div>${rows.join('')}</div>`;
}

function render() {
  const steps = currentSteps();
  if (state.step >= steps.length) state.step = steps.length - 1;

  const bar = steps.map((s, i) => {
    const cls = i < state.step ? 'wstep done' : (i === state.step ? 'wstep active' : 'wstep');
    const line = i < steps.length - 1 ? `<div class="wline${i < state.step ? ' done' : ''}"></div>` : '';
    return `<div class="${cls}"><div class="wstep-num">${i + 1}</div><div class="wstep-label">${escapeHtml(s.label)}</div></div>${line}`;
  }).join('');

  const forms = steps.map((s, i) => {
    const inner = s.summary ? summaryHtml() : s.fields.map(fieldHtml).join('');
    const back = i > 0 ? '<button type="button" class="wbtn-back" data-act="back">Indietro</button>' : '';
    const next = s.summary
      ? `<button type="button" class="wbtn-next" data-act="submit"${state.submitting ? ' disabled' : ''}>${state.submitting ? 'Invio…' : 'Invia alla revisione'}</button>`
      : '<button type="button" class="wbtn-next" data-act="next">Continua</button>';
    return `<div class="wform${i === state.step ? ' vis' : ''}" data-step="${i}">
      ${inner}
      <div class="werr" data-role="err"></div>
      <div class="wbtns">${back}${next}</div>
    </div>`;
  }).join('');

  root.innerHTML = `<div class="wizard-steps">${bar}</div>${forms}`;
}

function showStepError(msg) {
  const err = root.querySelector(`.wform[data-step="${state.step}"] [data-role="err"]`);
  if (!err) return;
  err.textContent = msg || '';
  err.style.display = msg ? 'block' : 'none';
}

/* ----------------------------------------------------------- validazione */

function validateStep() {
  const step = currentSteps()[state.step];
  for (const f of step.fields) {
    if (!f.required) continue;
    if (f.control === 'body') {
      if (!val('body') && !state.file) return f.errorText || 'Aggiungi del testo oppure un file.';
      continue;
    }
    if (!val(f.key)) return f.errorText || `Compila il campo «${f.label}» per continuare.`;
  }
  return null;
}

function goTo(index) {
  state.step = index;
  render();
}

/* ------------------------------------------------- composizione payload */

// Il contratto backend (srv/catalog-service.cds, action uploadAsset) resta
// quello di prima: title / description / type / content / externalLink +
// file. I campi in piu' per tipo vengono composti qui in testo leggibile,
// cosi' finiscono nell'indice senza toccare il modello dati.
function composeDescription() {
  const parts = [];
  for (const f of allFields()) {
    if (f.target !== 'description') continue;
    const v = val(f.key);
    if (!v) continue;
    parts.push(f.bare ? v : `${f.descLabel || f.label}: ${v}`);
  }
  let out = parts.join('\n');

  // Con un file allegato il server ignora `content` e indicizza il testo
  // estratto (resolveContent in srv/catalog-service.js): le sezioni per
  // tipo andrebbero perse, quindi si ripiegano qui. La soluzione pulita e'
  // che il backend concateni invece di scartare — segnalata nel report.
  if (state.file) {
    const extra = composeContentSections();
    if (extra) out = out ? `${out}\n\n${extra}` : extra;
  }

  return out.length > MAX_DESCRIPTION ? `${out.slice(0, MAX_DESCRIPTION - 1)}…` : out;
}

function composeContentSections() {
  const hasBody = Boolean(bodyField());
  const parts = [];
  for (const f of allFields()) {
    if (f.control === 'body' || !f.section) continue;
    // I tipi senza corpo (Applicazione, Tool) non hanno altro contenuto:
    // li' anche i campi destinati a description vengono ripetuti come
    // sezioni, altrimenti `content` resterebbe vuoto e non ci sarebbe
    // niente da indicizzare.
    const goesInContent = f.target === 'content' || (!hasBody && f.target === 'description');
    if (!goesInContent) continue;
    const v = val(f.key);
    if (!v) continue;
    parts.push(`## ${f.section}\n\n${v}`);
  }
  return parts.join('\n\n');
}

function composeContent() {
  const sections = composeContentSections();
  const bf = bodyField();
  const body = bf ? val('body') : '';
  if (!body) return sections;
  // Il corpo prende un'intestazione solo se convive con altre sezioni: per
  // un documento semplice il content deve restare il testo nudo, com'era
  // prima del wizard.
  if (!sections) return body;
  return `${sections}\n\n## ${bf.section || 'Contenuto'}\n\n${body}`;
}

/* --------------------------------------------------------------- upload */

function applySelectedFile(file) {
  if (!file) return;
  if (!isAllowedFile(file)) { showStepError('Formato non supportato: usa PDF, DOCX, PPTX o TXT.'); return; }
  if (file.size > MAX_FILE_SIZE) { showStepError(`File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024}MB).`); return; }
  state.file = file;
  render();
}

async function submit() {
  const title = val('title');
  const description = composeDescription();
  const file = state.file;
  const content = composeContent();

  // Ultima rete di protezione: resolveContent lato server risponde 400 se
  // non arriva ne' testo ne' file. Per i tipi col corpo facoltativo
  // (Altro, Interfaccia) la descrizione composta fa da contenuto minimo.
  const effectiveContent = content || (file ? '' : description);
  if (!effectiveContent && !file) { showStepError('Aggiungi del contenuto prima di inviare.'); return; }
  if (file && !isAllowedFile(file)) { showStepError('Formato non supportato: usa PDF, DOCX, PPTX o TXT.'); return; }
  if (file && file.size > MAX_FILE_SIZE) { showStepError(`File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024}MB).`); return; }

  state.submitting = true;
  render();
  try {
    const body = {
      title,
      description,
      type: state.type,
      content: effectiveContent,
      externalLink: val('externalLink')
    };
    if (file) {
      body.fileContent = await readFileAsBase64(file);
      body.fileName = file.name;
      body.fileMimeType = file.type;
    }
    await api.uploadAsset(body);
    reset();
    refreshQueueCount();
    toasts.show('Asset inviato alla coda di revisione', 'success');
    document.dispatchEvent(new CustomEvent('navigate-view', { detail: { view: 'queue' } }));
  } catch (err) {
    state.submitting = false;
    render();
    showStepError(err.message);
    toasts.show(err.message, 'error');
  }
}

function reset() {
  state.type = 'document';
  state.values = { title: '', externalLink: '' };
  state.bodyTab = 'txt';
  state.file = null;
  state.step = 0;
  state.submitting = false;
  render();
}

/* ----------------------------------------------------------------- init */

export function initUploadView() {
  root = document.getElementById('upload-wizard');
  if (!root) return;

  // Delega su un solo nodo: il wizard viene ridisegnato a ogni cambio di
  // step o di tipo, quindi i listener non possono stare sui singoli campi.
  // Su 'input' si aggiorna solo lo stato, senza render: ridisegnare a ogni
  // tasto farebbe perdere il focus e il cursore.
  root.addEventListener('input', (e) => {
    const key = e.target.dataset?.key;
    if (key) state.values[key] = e.target.value;
  });

  root.addEventListener('change', (e) => {
    if (e.target.dataset?.key === 'type') {
      state.type = e.target.value;
      state.step = 0;
      render();
      return;
    }
    if (e.target.dataset?.role === 'file') applySelectedFile(e.target.files[0]);
  });

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('.ftab');
    if (tab) {
      state.bodyTab = tab.dataset.ft;
      render();
      return;
    }
    if (e.target.closest('.dz')) {
      root.querySelector('[data-role="file"]')?.click();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') {
      const err = validateStep();
      if (err) { showStepError(err); return; }
      showStepError('');
      goTo(state.step + 1);
    } else if (act === 'back') {
      goTo(state.step - 1);
    } else if (act === 'submit' && !state.submitting) {
      submit();
    }
  });

  // Drag-and-drop reale sulla dropzone: il mockup non carica niente, qui
  // il file va davvero al backend.
  root.addEventListener('dragover', (e) => {
    const dz = e.target.closest('.dz');
    if (!dz) return;
    e.preventDefault();
    dz.classList.add('dragover');
  });
  root.addEventListener('dragleave', (e) => {
    e.target.closest('.dz')?.classList.remove('dragover');
  });
  root.addEventListener('drop', (e) => {
    const dz = e.target.closest('.dz');
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove('dragover');
    applySelectedFile(e.dataTransfer.files[0]);
  });

  render();
}
