using { billy as db } from '../db/schema';

// XSUAA preparata ma NON attiva (D15 — ultimissimo step). L'app resta
// accessibile a tutti. Quando l'auth va attivata, la riga da scommentare è:
// @(requires: ['authenticated-user'])
service BillyService @(path: 'billy', protocol: 'rest') {

  entity Asset as projection on db.Asset;

  action uploadAsset(title: String, content: String) returns Asset;

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
