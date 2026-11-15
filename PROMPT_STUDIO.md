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
- `server/hub-wa/` — COPIA del servizio che gira sul **Mac mini** (`~/hub-wa/server.mjs`, Baileys, porta 127.0.0.1:8791, esposto con Tailscale Serve su `https://mac-mini-von-marco.tail623d1f.ts.net:8445`). Dallo Studio NON puoi installarlo sul Mini: se lo modifichi, committa qui e scrivi nell'esito che va copiato sul Mini e riavviato.

## Regole fisse (non cambiarle)
1. **Mai invii automatici**: un messaggio parte solo dopo «Invia a …» + «Sì, invia». Solo verso chat già presenti.
2. **Privacy**: messaggi solo in memoria su hub-wa, mai su disco; nessun server nostro, nessuna statistica. IA predefinita = Nemotron locale. Niente provider cloud nuovi senza chiedere a Marco.
3. **Business mai collegato** con Baileys (rischio blocco del numero). Per il Business l'unica strada futura è l'API ufficiale di Meta: proponila, non farla senza ok.
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
- hub-wa gira sul Mini (avviato a mano); Marco deve ancora: inquadrare il QR su `https://mac-mini-von-marco.tail623d1f.ts.net:8445/collega` e lanciare `~/hub-wa-installa.sh` sul Mini.
- NON ancora provato su dispositivi veri: Condividi verso WhatsApp/WhatsApp Business, «Incolla e proponi», Comando rapido `comandi/Rispondi con HUB.shortcut`, chat WhatsApp vera e invio vero.

## Possibili prossimi passi (chiedi a Marco quale, proponendo il primo)
1. Notifica/contatore di messaggi nuovi nella scheda Chat (solo dentro l'app, niente push).
2. Nella Chat: messaggi pronti del profilo inseribili con un tocco.
3. Comando rapido separato per il Business (`#/rispondi?p=business`).
4. Lingue dell'interfaccia it/de/fr/es.
5. Studio per il Business con l'API ufficiale di Meta (solo analisi e costi, niente codice).

Comincia così: clona il repo, esegui `npm install`, `npm test`, `npm run build`, e dimmi in 3 righe che è tutto verde. Poi chiedi a Marco cosa fare.
