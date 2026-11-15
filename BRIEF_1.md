# BRIEF 1 — HUB v0.1: due profili, messaggi pronti, Rispondi/Scrivi con Claude, Condividi

Repo: ~/work/hub (git già inizializzato, branch main; remoto da creare: `gh repo create bifulcma/hub --public --source . --push`). Sito: https://bifulcma.github.io/hub/ (ramo `gh-pages`, come Tubo).
Leggi prima DESIGN.md e PROGETTO.md: questo brief li CORREGGE dove diversi (2 profili, non 4; niente Ollama; niente endpoint personalizzato in v0.1).
Modello di riferimento: ~/work/tubo (React + TS + Vite, vitest, routing con hash, modalità dimostrazione, pubblicazione gh-pages). Riusa da lì `src/ponte.ts` (askBridge, SSE, BridgeError, normalizeBridgeUrl), lo schema `askConRiprova` + `SOLO_TESTO` di `src/searchOrchestrator.ts` e `src/storage.ts`. Copiali e adattali, non importarli dal repo di Tubo.
Utente: Marco, non tecnico, usa soprattutto iPad, poi iPhone. Interfaccia tutta in italiano semplice.
NON lanciare sotto-agenti paralleli. Lavora a lotti: dopo OGNI lotto `npm test` + `npm run build` verdi, poi commit + push su main.
Nei test NESSUNA chiamata reale al ponte: solo fetch finto e modalità dimostrazione.

## Cosa è HUB
Aiuta Marco a scrivere e rispondere su WhatsApp con DUE account: **Personale** (app WhatsApp) e **Business** (app WhatsApp Business). HUB non legge e non manda messaggi: prepara il testo, poi Marco lo manda con il foglio Condividi di iOS scegliendo l'app giusta. Nessun server nostro, nessuna statistica: dati solo sul dispositivo.

## Lotto A — impianto e profili
1. Progetto Vite + React + TS, `base: './'`, vitest. Routing hash: `#/` (Rispondi), `#/scrivi`, `#/pronti`, `#/impostazioni`.
2. **Selettore profilo** sempre visibile in alto: due grandi pulsanti a segmento «Personale» (verde salvia) / «Business» (blu ardesia). Il profilo attivo colora la barra superiore e viene ricordato. Ogni profilo ha: nome modificabile, tono predefinito (Personale = amichevole, Business = cortese e professionale), firma facoltativa (es. «Marco Bifulco»), lingua predefinita (it/de/fr/es/en per i messaggi; l'interfaccia resta italiana).
3. Barra in basso con 4 schede (stile app iOS): Rispondi · Scrivi · Pronti · Impostazioni. Icone semplici SVG in linea, niente librerie di icone pesanti.

## Lotto B — Pronti (messaggi salvati)
1. Per ogni profilo un elenco di messaggi pronti. Precaricati 6 per profilo (italiano):
   - Personale: «Arrivo tra 10 minuti», «Ti richiamo appena posso», «Grazie mille, gentilissimo!», «Buon compleanno! Un abbraccio», «Ci vediamo domani?», «Ok, perfetto».
   - Business: «Buongiorno, grazie per il messaggio: le rispondo entro oggi.», «Ricevuto, verifico e le faccio sapere.», «Le invio i dettagli via email.», «Possiamo sentirci al telefono? Mi indichi un orario.», «Grazie, a presto. Cordiali saluti», «Al momento non sono disponibile, la ricontatto appena possibile.».
2. Aggiungi / modifica / elimina (con conferma), preferiti in cima, ricerca.
3. Toccando un messaggio: si apre un'anteprima modificabile con i pulsanti azione (Lotto D).

## Lotto C — Rispondi e Scrivi con Claude (ponte dello Studio)
1. Impostazioni → «IA»: indirizzo ponte (predefinito `https://mac-studio-di-marco.tail623d1f.ts.net:8443`), token (campo password, salvato solo sul dispositivo), pulsante «Prova connessione» (risposta OK / messaggio chiaro: «Tailscale spento o ponte non raggiungibile», «Token sbagliato» per 401). Provider fisso **claude** (niente Ollama, niente Nemotron in questa versione). Ogni chiamata: `askConRiprova` + system con `SOLO_TESTO`.
2. **Rispondi** (pagina principale): casella grande «Incolla qui il messaggio ricevuto» (pulsante «Incolla» che usa `navigator.clipboard.readText()` su tocco, con ripiego: tieni premuto e Incolla). Campo facoltativo «Cosa vuoi rispondere?» (es. «di' che va bene giovedì»). Pulsante «Proponi risposte» → l'IA restituisce SOLO JSON `{"risposte":["...","...","..."]}`: 3 risposte nel tono e nella lingua del profilo (lingua del messaggio ricevuto se diversa), brevi, naturali per WhatsApp, senza emoji eccessive, senza inventare fatti. Parsing robusto (accetta ```json, testo attorno, campi mancanti → messaggio d'errore gentile + Riprova). Ogni risposta in una scheda toccabile → anteprima modificabile con azioni (Lotto D).
3. **Scrivi**: casella grande + barra di azioni IA: Correggi · Più gentile · Più formale · Più breve · Più chiaro · Traduci (it/de/fr/es/en) · Elenco. Il risultato compare sotto con «Usa questo» (sostituisce il testo) e «Annulla». Ogni azione = una chiamata, risposta solo testo.
4. Avanzamento con «Sto pensando…» e pulsante «Annulla» (AbortController). Errori in linguaggio semplice con «Riprova».
5. Modalità dimostrazione (attiva se manca il token, banner «Dimostrazione: risposte finte») con risposte finte credibili, così l'app si prova subito.

## Lotto D — Azioni finali sul testo
1. **Condividi** (pulsante principale, grande): `navigator.share({ text })` → foglio iOS dove Marco sceglie WhatsApp o WhatsApp Business. Se `navigator.share` non c'è (es. desktop): ripiego su Copia.
2. **Copia**: `navigator.clipboard.writeText` dentro il gesto dell'utente + toast «Copiato».
3. **Salva nei pronti** (del profilo attivo).
4. Sotto i pulsanti, una riga discreta: «Profilo: Business → scegli WhatsApp Business nel foglio» (o Personale → WhatsApp) per ricordare l'app giusta.
5. La firma del profilo, se impostata, si aggiunge solo con un interruttore «Aggiungi firma».

## Lotto E — aspetto e PWA minima
1. Tema chiaro: fondo crema (#faf7f2 circa), testo antracite, accento terracotta (#c96442 circa) per i pulsanti principali; i due colori profilo salvia e ardesia. Font di sistema. Nessun tema scuro di default.
2. iPad prima (820×1180 e 1180×820): su iPad orizzontale Rispondi mostra a sinistra il messaggio ricevuto e a destra le proposte. Tutto ciò che serve sta sopra la piega. iPhone 390×844: una colonna.
3. Bersagli ≥ 44 px; input e textarea con font ≥ 16 px (Safari non deve zoomare). Rispettare le safe area (notch, barra Home).
4. Manifest + icona semplice (lettera «H» terracotta su crema) + service worker con costante `VERSION` e toast «Nuova versione: Aggiorna» come Penna. Dati in localStorage (o IndexedDB), un aggiornamento non li cancella.
5. Impostazioni → «Esporta / Importa» dei messaggi pronti e profili in JSON (file scaricato / file scelto). Il token NON va nell'esportazione.

## Lotto F — test, pubblicazione, verifica
1. Test vitest: parsing JSON delle risposte (anche ```json, testo attorno, campi mancanti), askConRiprova (secondo tentativo), CRUD dei pronti, persistenza profilo attivo, esportazione senza token, ripiego Condividi→Copia.
2. Prova visiva in Chrome headless (Playwright se disponibile, altrimenti puppeteer): iPad 820×1180, iPad 1180×820, iPhone 390×844@3x, in modalità dimostrazione: cambio profilo, Rispondi con messaggio incollato → 3 proposte, Scrivi → Correggi, Pronti. Screenshot in `~/work/hub/screenshots/` e controllali.
3. LEGGIMI.md in italiano semplice: cosa fa, cosa NON fa (non legge le chat, non manda da solo), come impostare il ponte, come aggiungere alla Home.
4. `gh repo create bifulcma/hub --public --source . --push` (se non esiste), poi pubblica `dist/` sul ramo `gh-pages` (commit «Pubblica HUB (build dal main <sha>)») e attiva Pages da gh-pages: `gh api -X POST repos/bifulcma/hub/pages -f source[branch]=gh-pages -f source[path]=/` (se già attivo, ignora). Aspetta 1-2 minuti e verifica con curl 200 su https://bifulcma.github.io/hub/ e che serva il nuovo `assets/index-*.js`.
5. Verifica che il ponte accetti l'origine `https://bifulcma.github.io` (è la stessa di Tubo/Penna): con curl una richiesta OPTIONS con `Origin: https://bifulcma.github.io` all'endpoint usato da askBridge deve restituire gli header CORS. Se NON li restituisce, non toccare il ponte: scrivilo nell'esito.

## Esito
Scrivi `~/work/hub_esito_1.md` in italiano semplice: cosa è stato fatto per lotto, sha dei commit, numero test, URL pubblicato verificato, screenshot fatti, e una sezione **NON verificato** (iPad/iPhone veri: foglio Condividi con WhatsApp e WhatsApp Business, Incolla, chiamata vera a Claude dal ponte).
