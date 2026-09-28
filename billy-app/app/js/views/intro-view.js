// Intro/splash a tutta pagina mostrata all'avvio, che sfuma nella shell
// dell'app quando si preme "Start chatting".
//
// Il contratto con app.js e' solo questo: initIntroView() viene chiamata al
// bootstrap, e quando l'utente entra nell'app la vista emette
// 'navigate-view' con {view:'chat'}. Nessun'altra dipendenza.
import { api } from '../api.js';

const intro = document.getElementById('intro');
const startBtn = document.getElementById('intro-start');
const introRight = document.getElementById('intro-right');
const character = document.getElementById('intro-character');
const statAssets = document.getElementById('intro-stat-assets');
const statCertified = document.getElementById('intro-stat-certified');

// Tempi presi dal mockup (startChat(), righe 418-425): l'intro sfuma in
// .5s e a 420ms — cioe' quando la dissolvenza e' quasi finita — l'app
// diventa operativa. Qui la shell e' gia' visibile sotto l'intro, quindi
// il "rendi visibile la shell" del mockup diventa la navigazione in chat.
const HANDOFF_MS = 420;
// 520ms = i .5s della transizione + un margine: prima di allora l'intro
// sta ancora dissolvendo e non va staccata dal layout.
const REMOVE_MS = 520;

// L'intro resta finche' non si preme "Start chatting", sempre.
//
// C'era un "mostrala una volta per sessione del tab" con un flag in
// sessionStorage, ed era sbagliato: app.js e' un modulo ES, quindi
// differito. Il browser dipinge l'intro, poi scarica e valuta tutta la
// catena di import, e solo allora initIntroView() poteva nasconderla —
// risultato, l'intro compariva e spariva da sola dopo un paio di secondi
// senza che nessuno avesse premuto niente. Un salto deciso dopo il primo
// paint non e' un salto, e' un lampo.
//
// Se un giorno si volesse davvero saltarla, la decisione va presa PRIMA
// del paint (script inline nell'<head> che mette l'attributo hidden sul
// markup), non in un modulo differito.

function goToChat() {
  document.dispatchEvent(new CustomEvent('navigate-view', { detail: { view: 'chat' } }));
}

function enterApp() {
  if (intro.hidden || intro.classList.contains('out')) return;
  intro.classList.add('out');
  setTimeout(goToChat, HANDOFF_MS);
  // .out mette gia' pointer-events:none, ma l'intro resterebbe nel flusso
  // con un bottone raggiungibile da tastiera sopra l'app: a dissolvenza
  // finita la si toglie del tutto.
  setTimeout(() => { intro.hidden = true; }, REMOVE_MS);
}

// I contatori riusano la stessa listAssets() del catalogo. Backend
// irraggiungibile: restano i trattini del markup e l'intro resta
// perfettamente usabile — nessun numero inventato, nessun errore bloccante.
async function loadStats() {
  try {
    const assets = await api.listAssets();
    statAssets.textContent = assets.length;
    statCertified.textContent = assets.filter((a) => a.certificationLevel === 'certified').length;
  } catch (e) {
    /* contatori lasciati a "—" */
  }
}

export function initIntroView() {
  if (!intro) return;

  // Se il PNG del personaggio manca si nasconde la colonna destra invece
  // di mostrare l'icona di immagine rotta: la colonna sinistra da sola
  // resta una intro sensata.
  //
  // Il controllo su complete/naturalWidth serve perche' questo modulo e'
  // differito: se il caricamento e' gia' fallito prima che arrivassimo
  // qui, l'evento 'error' e' gia' passato e il listener non scatterebbe
  // mai.
  const hideArt = () => { introRight.hidden = true; };
  if (character.complete && character.naturalWidth === 0) hideArt();
  character.addEventListener('error', hideArt);

  startBtn.addEventListener('click', enterApp);
  loadStats();
}
