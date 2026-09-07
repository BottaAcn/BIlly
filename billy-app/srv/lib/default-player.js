const cds = require('@sap/cds');

// Nessun utente reale finché XSUAA non è attiva (D15). Placeholder tecnico
// da rimuovere quando l'auth reale sostituirà questo utente fittizio con
// l'utente autenticato (cds.context.user).
//
// isCertifier/isAdmin sono a true di default: fino a XSUAA non esiste modo
// di distinguere utenti reali, quindi l'unico attore possibile deve poter
// testare anche i flussi da Certifier/Admin — altrimenti quelle azioni
// resterebbero non testabili fino alla Fase 8. Da rivedere quando l'auth
// reale distinguerà i player e i ruoli andranno assegnati singolarmente.
const ANONYMOUS_USER_ID = 'anonymous';

async function getOrCreateDefaultPlayer() {
  const existing = await SELECT.one.from('billy.Player').where({ userId: ANONYMOUS_USER_ID });
  if (existing) {
    // Il player anonimo può già esistere da una fase precedente (Fase 0/1,
    // quando isCertifier/isAdmin non esistevano ancora nello schema) —
    // in quel caso questi campi sono ancora al default `false`. Elevarli
    // qui una tantum, altrimenti nessuna azione da Certifier/Admin sarebbe
    // mai testabile (bug reale osservato: 403 "Solo Certifier o Admin" al
    // primo reviewRevision di Fase 2).
    if (!existing.isCertifier || !existing.isAdmin) {
      await UPDATE('billy.Player', existing.ID).with({ isCertifier: true, isAdmin: true });
      existing.isCertifier = true;
      existing.isAdmin = true;
    }
    return existing;
  }

  const ID = crypto.randomUUID();
  await INSERT.into('billy.Player').entries({
    ID,
    userId: ANONYMOUS_USER_ID,
    displayName: 'Utente anonimo',
    isCertifier: true,
    isAdmin: true
  });
  return { ID, userId: ANONYMOUS_USER_ID, displayName: 'Utente anonimo', isCertifier: true, isAdmin: true };
}

module.exports = { getOrCreateDefaultPlayer, ANONYMOUS_USER_ID };
