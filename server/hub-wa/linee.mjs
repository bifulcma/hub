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
