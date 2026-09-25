# Immagini dell'interfaccia

File attesi dal frontend (nomi fissi, referenziati in `app/index.html`):

| File | Dove si vede | Formato consigliato |
| --- | --- | --- |
| `billy-logo.png` | Sidebar, in alto (larghezza resa: 108px) | PNG **sfondo trasparente**, ~400px di larghezza, oppure SVG |
| `billy-character.png` | Landing page, colonna destra (larghezza resa: fino a 580px) | PNG **sfondo trasparente**, ritagliato, altezza ~1400px |

Entrambi sono opzionali a runtime: se il file manca, `app.js` nasconde
l'immagine — la sidebar mostra il nome "Billy" in testo e la landing passa a
una colonna sola.

L'intera cartella `app/` viene copiata nel build (`scripts/copy-app.js`) e
zippata per HTML5 App Repo (`scripts/zip-html5-content.js`): non serve
registrare i nuovi file da nessuna parte.
