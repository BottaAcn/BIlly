// Costanti e helper condivisi tra componenti e viste.
// Nessuna dipendenza da api.js qui: sono puramente di presentazione/formato.

export const CERT_LABELS = {
  certified: 'Certificato',
  certifiedOutdated: 'Scaduto',
  community: 'Community',
  deprecated: 'Ritirato'
};

export const TYPE_LABELS = {
  document: 'Documento', skill: 'Skill', tool: 'Tool',
  application: 'Applicazione', interface: 'Interfaccia', other: 'Altro'
};

// Nessuna libreria di icone: glifi Unicode semplici, coerenti con la scelta
// di non aggiungere dipendenze esterne per il frontend.
export const TYPE_ICONS = {
  document: '📄', skill: '🧩', tool: '🛠️',
  application: '🖥️', interface: '🔌', other: '📦'
};

export function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Il backend restituisce un COSINE_SIMILARITY grezzo (0-1): un numero come
// "0.26" non comunica nulla a chi non ha scritto la query SQL. Una
// percentuale con etichetta breve resta leggibile anche nei chip stretti.
export function fmtSimilarity(value) {
  if (value == null || Number.isNaN(value)) return '';
  return `${Math.round(value * 100)}% rilevanza`;
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
