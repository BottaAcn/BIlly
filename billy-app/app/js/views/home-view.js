import { api } from '../api.js';

const statAssets = document.getElementById('stat-assets');
const statCertified = document.getElementById('stat-certified');
const landingArt = document.getElementById('landing-art');
const landingCharacter = document.getElementById('landing-character');

// I contatori della hero riusano la stessa listAssets() del catalogo e si
// caricano una volta sola: la landing è la prima cosa che si vede, non deve
// rifare la chiamata ogni volta che ci si torna dalla nav.
let statsLoaded = false;

export async function loadHomeStats() {
  if (statsLoaded) return;
  try {
    const assets = await api.listAssets();
    statAssets.textContent = assets.length;
    statCertified.textContent = assets.filter((a) => a.certificationLevel === 'certified').length;
    statsLoaded = true;
  } catch (e) {
    // Backend non raggiungibile: i contatori restano a "—", la landing
    // resta comunque leggibile e il pulsante "Start chatting" funziona.
  }
}

export function initHomeView() {
  landingCharacter.addEventListener('error', () => landingArt.classList.add('is-missing'));
  loadHomeStats();
}
