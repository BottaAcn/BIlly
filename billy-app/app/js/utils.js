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

export function escapeHtml(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'short', day: 'numeric' });
}
