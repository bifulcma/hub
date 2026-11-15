# HUB — hub web multi-account con IA dell'utente
### Progetto in sintesi — 15/11/2026 (rev. 2: web, non app locale)

## 1. Cos'è
**Web app / PWA** (crema-terracotta, card, tab Hub / Personale / Lavoro / Terzo / Quarto) che riunisce 4 account in un unico hub, con risposte pronte e scrittura assistita.
Niente app nativa: si apre dal browser e si aggiunge alla Home come PWA.

## 2. Principio
- Nessun backend nostro, nessun database di messaggi, zero telemetria.
- L'IA è quella dell'utente: endpoint a sua scelta (Ollama sul suo Mac o qualsiasi servizio OpenAI-compatibile), configurato nell'app.
- L'app **non invia messaggi**: prepara il testo e l'utente lo incolla nella conversazione. Nessun protocollo WhatsApp implementato → nessun rischio ban legato al client.

## 3. Funzioni v1
- **Account 01–04**: card con colore, nome modificabile, apertura della sessione.
- **Risposte**: 6 modelli di partenza + archivio personale (IndexedDB), modifica inline, pulsante **Copia**.
- **Scrittura IA**: campo di testo, Correggi, Riscrivi, stili (Amichevole / Professionale / Conciso), Riassunto, Punti chiave, Elenco, Espandi. Risultato copiabile con un tocco.
- **Impostazioni**: endpoint IA, modello, chiave opzionale, "Prova connessione" con esito in chiaro.

## 4. Non-obiettivi
Nessun invio automatico, nessun bot, nessun massivo, nessun CRM, nessun salvataggio delle conversazioni, nessun training.

## 5. Architettura
- Sito statico (HTML/CSS/JS) su GitHub Pages o Vercel + `manifest.json` + service worker per l'interfaccia offline.
- Dati locali nel browser: modelli di risposta e impostazioni; export/import JSON manuale per il backup.
- Chiamata IA: `fetch` diretto dal browser all'endpoint dell'utente (`/v1/chat/completions`). Nessun proxy nostro: lo ucciderebbe la promessa "nessun dato a noi".

## 6. I due muri tecnici (da risolvere nel progetto, non dopo)
1. **Mixed content.** Pagina `https://` → `fetch` verso `http://192.168.x.x:11434` viene **bloccata** da Safari e Chrome. Non aggirabile lato app.
   - Strade: (a) endpoint locale in HTTPS con certificato vero via **Tailscale Serve** (`*.ts.net`) — la più pulita su iPad; (b) tunnel Cloudflare con dominio proprio; (c) server locale con certificato; (d) app servita in `http://` — sconsigliata, rompe PWA e in parte la clipboard.
   - Decisione: si supportano **solo endpoint HTTPS**, con onboarding guidato.
2. **CORS.** Ollama rifiuta le richieste dal browser se l'origine non è autorizzata: servono `OLLAMA_ORIGINS=https://<dominio-app>` e `OLLAMA_HOST=0.0.0.0` sul server dell'utente, come due righe copiabili nell'onboarding. Senza, l'utente vede "errore di rete" e pensa a un bug nostro.

## 7. Il punto aperto sul multi-account
Una pagina web non può tenere 4 sessioni WhatsApp nello stesso browser: la sessione è legata al profilo del browser.
- **A.** Le card aprono `web.whatsapp.com` e l'utente gestisce profili separati — semplice, ma nell'uso reale sono 4 profili.
- **B.** Le card sono solo identità (nome/colore) e l'hub è sui **testi**; il cambio account resta nel sito ufficiale.
- **C.** Un server dell'utente (Node + Baileys) gestisce le sessioni — reintroduce un componente da installare e il rischio ToS: da evitare.
Consigliata **B** per la v1 (rischio zero, spedibile subito), **A** come v2.

## 8. Rischi
| Rischio | Gravità | Mitigazione |
|---|---|---|
| Ban WhatsApp | **nulla in v1** | l'app non parla con WhatsApp, solo copia-incolla |
| Marchio Meta nella UI | alta (directory/review) | etichette "Account 01–04", nessun logo, nessuna affiliazione |
| Mixed content / CORS | alta (percezione di bug) | solo endpoint HTTPS + test connessione |
| Endpoint IA offline | media | errore esplicito, non spinner infinito |
| Perdita dati del browser | media | export/import JSON |

## 9. Roadmap
- **v0.1** Interfaccia + 6 template + Copia (nessuna IA).
- **v0.2** Modulo IA + impostazioni + test connessione + guida endpoint HTTPS.
- **v0.3** PWA installabile, export/import, i18n it/de/fr/es.
- **v1.0** Pubblicazione, privacy: "nessun dato raccolto, nessun server nostro".

## 10. Accettazione
L'utente apre l'app dal browser, sceglie una risposta o fa "Correggi", copia e incolla in WhatsApp. **Nessuna richiesta di rete verso domini nostri**: verificabile in DevTools e con mitmproxy.
