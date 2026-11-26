// hub-wa — i due numeri collegati e le regole di invio.
// Business collegato su scelta di Marco (15/11/2026), sapendo che il collegamento non ufficiale
// può portare al blocco del numero: per questo ha regole più prudenti.

export const LINEE = {
  personale: { id: 'personale', etichetta: 'Personale', app: 'WhatsApp', cartella: 'session', pausaMs: 4000, soloRisposte: false, avvioSempre: true },
  business: { id: 'business', etichetta: 'Business', app: 'WhatsApp Business', cartella: 'session-business', pausaMs: 15000, soloRisposte: true, avvioSempre: false },
};

/** Linea dalla richiesta: solo valori noti, altrimenti Personale. */
export const lineaDa = (x) => (x === 'business' ? 'business' : 'personale');

/**
 * Perché NON si può inviare (null = si può). Regole fisse:
 * - solo chat già presenti in HUB; - mai messaggi vuoti o enormi; - numero collegato;
 * - pausa tra un invio e l'altro (Business 15 s); - Business: solo a chi ti ha già scritto.
 */
export function motivoBlocco({ linea, chat, testo, stato, ultimoInvio, ora }) {
  const L = LINEE[linea];
  if (!chat) return { codice: 400, errore: 'Posso scrivere solo nelle chat già presenti in HUB.' };
  const t = String(testo || '').trim();
  if (!t) return { codice: 400, errore: 'Messaggio vuoto' };
  if (t.length > 4000) return { codice: 400, errore: 'Messaggio troppo lungo' };
  if (stato !== 'collegato') return { codice: 503, errore: `WhatsApp ${L.etichetta} non è collegato.` };
  if (L.soloRisposte && !chat.messaggi.some((m) => !m.daMe))
    return { codice: 403, errore: 'Sul Business HUB risponde solo a chi ti ha già scritto: questa persona non ti ha ancora scritto (o il suo messaggio è vecchio). Rispondi dal telefono.' };
  const attesa = ultimoInvio + L.pausaMs - ora;
  if (attesa > 0) return { codice: 429, errore: `Aspetta ${Math.ceil(attesa / 1000)} secondi tra un invio e l'altro.` };
  return null;
}

/**
 * Cosa fare quando WhatsApp chiude la connessione di una linea.
 * Attenzione: dopo aver inquadrato il QR WhatsApp chiude SEMPRE una volta (515 «restart required»)
 * e bisogna ricollegarsi: non è un QR mancato. Con il QR, `creds.registered` resta false:
 * per sapere se il numero è collegato si guarda `creds.me`.
 */
export function dopoChiusura({ linea, motivo, spegnendo, haCredenziali }) {
  if (spegnendo) return 'spento';
  if (motivo === 401) return 'uscito'; // DisconnectReason.loggedOut
  if (motivo === 515) return 'riprova'; // DisconnectReason.restartRequired (anche subito dopo il QR)
  if (!haCredenziali && linea === 'business') return 'spento'; // QR mai inquadrato: niente QR a ripetizione
  return 'riprova';
}

/**
 * I pulsanti della pagina /collega (Nuovo QR, Rifai il QR, Collega un nuovo dispositivo) valgono solo se la
 * richiesta parte dalla pagina stessa: intestazione propria (un altro sito non può aggiungerla senza permesso)
 * e, se il browser lo dice, «same-origin». Così un sito malevolo non può staccarti WhatsApp.
 */
export function dallaPagina(h) {
  if (h['x-hub-pagina'] !== '1') return false;
  const sito = h['sec-fetch-site'];
  return !sito || sito === 'same-origin';
}

/** Finestra in cui la pagina /collega consegna la password ai dispositivi nuovi (10 minuti). */
export const DURATA_FINESTRA_MS = 10 * 60 * 1000;
export const finestraAperta = (fino, ora = Date.now()) => fino > ora;
