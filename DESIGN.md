# HUB — piano di design (modello: Tubo)

Stesso impianto di Tubo: React + TS + Vite, test vitest, routing con hash, pubblicazione su GitHub Pages (`bifulcma/hub`, ramo gh-pages), modalità dimostrazione con dati finti, interfaccia in italiano semplice.

## AI: stesso ponte di Tubo e Penna
- Default: ponte Studio `https://mac-studio-di-marco.tail623d1f.ts.net:8443` + token Bearer. È già HTTPS su Tailscale → niente problemi di mixed content e CORS.
- Selettore AI come in Tubo: Nemotron (locale Studio) · Claude · Qwen. Nome intero + mini-descrizione.
- Ogni chiamata passa da `askConRiprova` + `SOLO_TESTO` (niente strumenti/file).
- «Endpoint personalizzato» (Ollama/OpenAI-compatibile, solo HTTPS) in Impostazioni, per altri utenti.

## Pagine (routing hash)
- `#/` **Account**: 4 card grandi (01–04), nome + colore + iniziale. Tocco → diventa l'account attivo (barra colorata in alto su tutte le pagine).
- `#/scrivi` **Scrivi**: casella grande + barra azioni AI (Correggi · Riscrivi · Formale · Amichevole · Breve · Riassunto · Punti chiave · Elenco · Espandi). Il risultato compare sotto, confronto prima/dopo, «Usa questo».
- `#/risposte` **Risposte pronte**: 6 template + archivio personale; ricerca, preferiti, «Salva come risposta» dallo Scrivi.
- `#/impostazioni`: account (nome/colore), AI, lingua (it/de/fr/es), esporta/importa JSON, «Prova connessione».

## Azione finale (su ogni testo)
1. **Apri in WhatsApp** (pulsante principale): `https://wa.me/?text=…`, l'utente sceglie solo il contatto.
2. **Copia** (riserva): clipboard API col gesto dell'utente + toast «Copiato».
3. Numero facoltativo per card/contatto → `wa.me/<numero>?text=…` apre direttamente la chat.

## Aspetto
- Chiaro: fondo crema, accento terracotta, testo antracite (stile Claude), font di sistema. Niente tema scuro di default.
- iPad prima: 820×1180 e 1180×820; tutto ciò che serve per decidere sta sopra la piega. iPhone 390 px: card in colonna, barra azioni scorrevole.
- Bersagli di tocco ≥ 44 px, testi ≥ 16 px (Safari non zooma i campi).
- Colori account: 4 tinte distinguibili anche da daltonici (terracotta, salvia, blu ardesia, ocra).

## Dati e privacy
- Tutto in IndexedDB/localStorage sul dispositivo; nessun server nostro, nessuna statistica.
- PWA installabile (manifest + service worker con `VERSION`, toast «Aggiorna» come Penna).

## Fasi (un brief = una fase, Opus)
- **v0.1** UI + 4 card + 6 template + Apri in WhatsApp/Copia + demo.
- **v0.2** modulo AI sul ponte + «Prova connessione» + endpoint personalizzato.
- **v0.3** PWA, esporta/importa, lingue it/de/fr/es.
- **v1.0** pagina privacy «nessun dato raccolto», verifica DevTools: zero richieste fuori da ponte/endpoint scelto.

Ogni fase: test vitest + Chrome headless iPad/iPhone con screenshot, pubblicazione gh-pages verificata con curl, sezione «NON verificato su iPad vero».
