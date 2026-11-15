# HUB — rispondi su WhatsApp (v0.1)

App web per iPad e iPhone: https://bifulcma.github.io/hub/ (da Safari: Condividi → Aggiungi alla schermata Home).

## Cosa fa
- **Due profili**: Personale (WhatsApp) e Business (WhatsApp Business), ognuno col suo tono, lingua, firma e messaggi pronti.
- **Rispondi**: incolli il messaggio ricevuto, scrivi (se vuoi) cosa rispondere, Claude propone 3 risposte.
- **Scrivi**: Correggi, Più gentile, Più formale, Più breve, Più chiaro, Traduci, Elenco.
- **Pronti**: messaggi salvati, preferiti in cima, ricerca, modifica.
- **Condividi**: apre il foglio di iPad/iPhone e scegli WhatsApp o WhatsApp Business. «Copia» come riserva.

## Cosa NON fa
- Non legge le chat e non manda messaggi da solo.
- Non ha server: i dati restano sul dispositivo (localStorage). Esporta/Importa in Impostazioni (senza token).

## IA
Claude attraverso il ponte del Mac Studio (`https://mac-studio-di-marco.tail623d1f.ts.net:8443`, lo stesso di Penna e Tubo). Serve Tailscale acceso sul dispositivo e il token del ponte in Impostazioni → «Prova connessione». Senza token: modalità dimostrazione con risposte finte.

## Sviluppo
`npm install`, `npm test`, `npm run build`. Pubblicazione: `dist/` sul ramo `gh-pages`. Alza `VERSION` in `public/sw.js` a ogni pubblicazione (toast «Aggiorna»).
