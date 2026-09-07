using { billy as db } from '../db/schema';

// XSUAA preparata ma NON attiva in v0.0.1 (vedi FASE 5) — l'app resta accessibile a tutti.
// In una fase futura, quando l'auth va attivata, la riga da scommentare è:
// @(requires: ['authenticated-user'])
service BillyService @(path: 'billy', protocol: 'rest') {

  entity Document as projection on db.Document excluding { embedding };

  action addDocument(title: String, content: String) returns Document;

  action askBilly(question: String) returns {
    answer  : String;
    sources : array of {
      title      : String;
      similarity : Double;
    };
  };
}
