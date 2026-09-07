// Copia app/ nel modulo nodejs generato: `cds build` non lo fa quando non
// si usa l'HTML5 App Repository (scelta deliberata per v0.0.1, vedi spec §3/§6).
const fs = require('fs');
fs.cpSync('app', 'gen/srv/app', { recursive: true });
