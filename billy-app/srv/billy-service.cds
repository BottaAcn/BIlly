// BillyService è l'agente conversazionale (D3/architecture.md §3.2): decide
// da solo se cercare nei documenti (RAG) e se caricare ed eseguire una
// skill pubblicata. La gestione del ciclo di vita degli asset (upload,
// revisione, certificazione) vive in CatalogService (srv/catalog-service.cds)
// — separazione di responsabilità.

// XSUAA preparata ma NON attiva (D15 — ultimissimo step). L'app resta
// accessibile a tutti. Quando l'auth va attivata, la riga da scommentare è:
// @(requires: ['authenticated-user'])
service BillyService @(path: 'billy', protocol: 'rest') {

  // `history` è opzionale: senza storico l'action si comporta esattamente
  // come prima (retrocompatibile, incluso l'uso come tool MCP). La
  // variante in streaming è la rotta express POST /rest/billy/askBillyStream
  // (srv/server.js) — un'action CDS non può fare SSE, e un tool MCP deve
  // comunque restituire un risultato unico.
  action askBilly(
    question : String,
    history  : array of {
      role    : String;
      content : String;
    }
  ) returns {
    answer  : String;
    sources : array of {
      assetId            : UUID;
      title              : String;
      similarity         : Double;
      certificationLevel : String;
      link               : String;
    };
  };
}

// Fase 7 — espone BillyService come server MCP (@cap-js/mcp), un tool
// dedicato per askBilly grazie a cds.mcp.per_action_tool (package.json).
// Stessa nota di catalog-service.cds: @protocol già impostato inline nel
// servizio ('rest'), quindi va sovrascritto con un array per aggiungere mcp.
annotate BillyService with @protocol: ['rest', 'mcp'];
annotate BillyService with @mcp.instructions: 'Usa askBilly per rispondere a domande in linguaggio naturale sulla documentazione e sulle procedure della practice. Billy è un agente: decide da solo se cercare nei documenti certificati (RAG) e se caricare ed eseguire una delle skill pubblicate nel marketplace, poi restituisce la risposta con le fonti citate (con relativo livello di certificazione). Passare `history` con i turni precedenti per continuare una conversazione; le fonti di tipo skill hanno similarity null.';
