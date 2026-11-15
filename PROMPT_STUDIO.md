# Prompt per continuare HUB sul Mac Studio

Copia tutto quello che c'è sotto la riga in Claude Code sul Mac Studio, aperto in una cartella vuota di lavoro (es. `~/work`).

---

Lavori sul progetto **HUB** di Marco. Rispondi sempre in **italiano semplice**: Marco non è tecnico, frasi corte, niente gergo. Usa gli strumenti per fare davvero le cose (codice, test, pubblicazione), poi riferisci cosa hai verificato e cosa NO.

## Cos'è HUB
App web (PWA) per iPad e iPhone che aiuta Marco a scrivere e rispondere su WhatsApp con due profili:
- **Personale** (app WhatsApp): scheda **Chat** collegata davvero a WhatsApp tramite il servizio `hub-wa` sul Mac mini. Si vedono i messaggi, l'IA propone 3 risposte, Marco tocca «Invia a …», conferma, e il messaggio parte.
- **Business** (app WhatsApp Business): NON collegato. Solo Rispondi/Scrivi + foglio Condividi di iOS.

Online: https://bifulcma.github.io/hub/ (GitHub Pages, ramo `gh-pages`). Codice: `git clone https://github.com/bifulcma/hub.git` (ramo `main`). Stack: Vite + React + TypeScript, test con vitest. Leggi prima `LEGGIMI.md`, `DESIGN.md` e `src/`.

File principali:
- `src/App.tsx` — pagine Chat, Rispondi, Scrivi, Pronti, Impostazioni + foglio «Anteprima» (Condividi / Invia diretto con conferma).
- `src/ai.ts` — prompt e lettura robusta del JSON `{"risposte":[...]}`.
- `src/wa.ts` — chiamate a hub-wa (`/chats`, `/chat`, `/ai`, `/send`, `/health`) e scelta IA: **Nemotron locale** (via hub-wa → Ollama sullo Studio, `nemotron35:latest`) oppure **Claude** (via il ponte dello Studio `https://mac-studio-di-marco.tail623d1f.ts.net:8443`, endpoint `/ask`, SSE).
- `src/store.ts` — dati solo in localStorage; l'esportazione non contiene mai i token.
- `public/sw.js` — service worker con `VERSION` (alzala a ogni pubblicazione: fa comparire il toast «Aggiorna»).
- `server/hub-wa/` — COPIA del servizio che gira sul **Mac mini** (`~/hub-wa/server.mjs`, Baileys, porta 127.0.0.1:8791, esposto con Tailscale Serve su `https://mac-mini-von-marco.tail623d1f.ts.net:8445`). Dallo Studio lo aggiorni tu con `ssh mini` (in ssh usa `/usr/local/bin/node`): copia di sicurezza di `server.mjs`, `node --check`, sostituisci, poi `~/hub-wa-installa.sh` (servizio launchd `com.marco.hub-wa`). Committa anche qui.

## Regole fisse (non cambiarle)
1. **Mai invii automatici**: un messaggio parte solo dopo «Invia a …» + «Sì, invia». Solo verso chat già presenti.
2. **Privacy**: messaggi solo in memoria su hub-wa, mai su disco; nessun server nostro, nessuna statistica. IA predefinita = Nemotron locale. Niente provider cloud nuovi senza chiedere a Marco.
3. **Business collegato con Baileys per scelta di Marco (15/11/2026)**: sa che il collegamento non ufficiale può far bloccare il numero e accetta il rischio (usa il Business per avere 2 numeri sul telefono, ~20 messaggi al giorno, e vuole l'inglese corretto). Regole fisse in `server/hub-wa/linee.mjs`, non allentarle senza chiederlo: solo invii dopo «Sì, invia», solo a chi ha già scritto, almeno 15 s tra invii, «Scollega Business» sempre disponibile. Strada ufficiale (Coexistence + fornitore, ~50 €/mese): vedi `STUDIO_BUSINESS_META.md`.
4. Non toccare il ponte dello Studio (`studio-bridge`) né Ollama: usali come sono.
5. Non scrivere token o password in chat, nei commit o nei log.
6. Aspetto: chiaro crema/terracotta, profilo Personale verde salvia, Business blu ardesia; pensato prima per iPad (820×1180 e 1180×820), poi iPhone 390×844. Pulsanti ≥ 44 px, testi dei campi ≥ 16 px. Interfaccia tutta in italiano.
7. Modello per il codice: Opus.

## Come si lavora
- Dopo ogni modifica: `npm test` + `npm run build` verdi, poi commit + push su `main`.
- Pubblicare: alza `VERSION` in `public/sw.js`, `npm run build`, poi copia `dist/` sul ramo `gh-pages` (worktree: `git worktree add <tmp> gh-pages`, `git rm -rq .`, `cp -R dist/. .`, `touch .nojekyll`, commit «Pubblica HUB (build dal main <sha>)», push). Dopo ~1 minuto verifica con curl che `https://bifulcma.github.io/hub/sw.js` abbia la nuova VERSION.
- Prova visiva in Chrome headless (puppeteer-core con Chrome di sistema, `--no-sandbox`), viewport iPad e iPhone, con screenshot; per la Chat usa un hub-wa FINTO in locale (vedi lo stile dei test in `src/hub.test.ts`), mai il WhatsApp vero.
- In ogni rapporto a Marco: cosa hai fatto, cosa hai verificato (con l'esito vero), e una sezione **NON verificato** (cose provabili solo sull'iPad/iPhone veri).

## Stato al 15/11/2026
- HUB 0.2.0 pubblicato, 44 test verdi.
- hub-wa gira sul Mini come servizio fisso (launchd) e WhatsApp Personale è COLLEGATO (15/11 sera, ricollegato col telefono Personale dopo un primo collegamento sbagliato col Business, subito scollegato e sessione cancellata). Le chat stanno solo in RAM: ogni riavvio di hub-wa svuota la lista e lo storico torna solo ricollegando col QR → non riavviarlo senza avvisare Marco.
- HUB 0.2.4: «Collega WhatsApp» con un tocco (HUB legge /collega/stato dal Mini). Sull'iPhone l'icona sulla Home ha memoria separata dal browser e usa il motore di Safari: col Relay privato di iCloud acceso i nomi *.ts.net non si risolvono (Chrome invece funziona). Soluzione: Relay privato spento. Chat e invio vero provati sull'iPhone (15/11 sera).
- hub-wa 2 linee (Personale + Business) e correzione «stessa persona due volte» (codice nascosto @lid) installate sul Mini il 15/11 sera: file `server.mjs`, `memoria.mjs`, `linee.mjs` (copiarli TUTTI e tre in `~/hub-wa/`). Pagina QR: `/collega` (Personale) e `/collega?linea=business`. Il Business parte solo se ha già una sessione. Corretta la pagina `/collega` che restava bianca (apice escapato nel template literal; test in `server/hub-wa/pagina.test.mjs`).
- NON ancora provato su dispositivi veri: Condividi verso WhatsApp/WhatsApp Business, «Incolla e proponi», Comando rapido `comandi/Rispondi con HUB.shortcut`, chat WhatsApp vera e invio vero.

- Sera 15/11 (fine giornata): Business ricollegato pulito (150 chat, quasi tutte con nome). Personale SCOLLEGATO apposta per rifare il QR e riavere storico+nomi: Marco deve ancora inquadrarlo (`/collega` → «Mostra il QR»). Controlla con `ssh mini` + `/chats?linea=…` (conta solo, mai contenuti).
- Prossimo tema scelto da Marco per il 16/11: **allegati** (foto, vocali, documenti nelle chat di HUB).

## Possibili prossimi passi (chiedi a Marco quale, proponendo il primo)
1. Notifica/contatore di messaggi nuovi nella scheda Chat (solo dentro l'app, niente push).
2. Nella Chat: messaggi pronti del profilo inseribili con un tocco.
3. Comando rapido separato per il Business (`#/rispondi?p=business`).
4. Lingue dell'interfaccia it/de/fr/es.
5. Studio per il Business con l'API ufficiale di Meta (solo analisi e costi, niente codice).

Comincia così: clona il repo, esegui `npm install`, `npm test`, `npm run build`, e dimmi in 3 righe che è tutto verde. Poi chiedi a Marco cosa fare.
