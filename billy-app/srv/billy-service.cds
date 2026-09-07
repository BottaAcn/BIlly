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
