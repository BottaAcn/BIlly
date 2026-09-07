// BillyService è puro RAG (D3/architecture.md §3.2). La gestione del ciclo
// di vita degli asset (upload, revisione, certificazione) vive in
// CatalogService (srv/catalog-service.cds) — separazione di responsabilità.

// XSUAA preparata ma NON attiva (D15 — ultimissimo step). L'app resta
// accessibile a tutti. Quando l'auth va attivata, la riga da scommentare è:
// @(requires: ['authenticated-user'])
service BillyService @(path: 'billy', protocol: 'rest') {

  action askBilly(question: String) returns {
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
annotate BillyService with @mcp.instructions: 'Usa askBilly per rispondere a domande in linguaggio naturale sulla documentazione della practice: fa RAG sugli asset certificati e restituisce risposta con le fonti citate (con relativo livello di certificazione).';
