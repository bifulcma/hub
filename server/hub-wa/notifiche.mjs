// hub-wa — notifiche sul telefono/iPad quando arriva un messaggio (Web Push, tramite il servizio di Apple).
// Il contenuto è cifrato per il dispositivo (Apple non lo legge) e NON contiene il testo del messaggio:
// solo chi ha scritto e su quale numero. Sul disco del Mini si salvano solo le «iscrizioni» dei dispositivi
// (indirizzo del servizio push + chiavi), mai messaggi.

export const PREFERENZE_BASE = { personale: true, business: true, gruppi: true };
const PAUSA_PER_CHAT_MS = 3 * 60 * 1000; // la stessa chat suona al massimo ogni 3 minuti
const MAX_AL_MINUTO = 8; // e in tutto al massimo 8 notifiche al minuto (es. dopo un riavvio)

/** Testo della notifica: niente contenuto del messaggio. */
export function testoNotifica({ linea, nomeChat, autore, gruppo, allegato }) {
  const dove = linea === 'business' ? 'Business' : 'Personale';
  const cosa = allegato === 'foto' ? 'una foto' : allegato === 'documento' ? 'un documento' : 'un messaggio';
  return {
    titolo: `${nomeChat} · ${dove}`,
    corpo: (gruppo ? `${autore || 'Qualcuno'} ha ` : 'Ti ha ') + (allegato ? 'mandato ' : 'scritto ') + cosa,
  };
}

/**
 * Gestore delle notifiche. `invia(iscrizione, testoJSON, opzioni)` è la funzione di web-push;
 * `leggi`/`scrivi` caricano e salvano le iscrizioni (file sul Mini).
 */
export function creaNotifiche({ invia, leggi, scrivi, ora = () => Date.now(), log = () => {} }) {
  let iscritti = [];
  try {
    const d = leggi();
    if (Array.isArray(d)) iscritti = d.filter((x) => x?.sub?.endpoint);
  } catch {}
  const ultimaPerChat = new Map();
  let inviateMinuto = [];
  const salva = () => { try { scrivi(iscritti); } catch (e) { log('notifiche: non salvo le iscrizioni: ' + e.message); } };

  function iscrivi(sub, preferenze = {}) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Iscrizione non valida');
    const pref = { ...PREFERENZE_BASE, ...Object.fromEntries(Object.entries(preferenze).filter(([k, v]) => k in PREFERENZE_BASE && typeof v === 'boolean')) };
    iscritti = iscritti.filter((x) => x.sub.endpoint !== sub.endpoint);
    iscritti.push({ sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, pref, dal: ora() });
    salva();
    return pref;
  }
  function disiscrivi(endpoint) {
    const prima = iscritti.length;
    iscritti = iscritti.filter((x) => x.sub.endpoint !== endpoint);
    if (iscritti.length !== prima) salva();
    return prima !== iscritti.length;
  }
  const preferenze = (endpoint) => iscritti.find((x) => x.sub.endpoint === endpoint)?.pref || null;

  async function spedisci(destinatari, dati, chiave) {
    let n = 0;
    for (const x of destinatari) {
      try {
        // Niente «topic»: Apple lo rifiuta (400 BadWebPushTopic, provato il 17/11/2026). Il raggruppamento
        // per chat lo fa già il «tag» della notifica sul dispositivo.
        await invia(x.sub, JSON.stringify(dati), { TTL: 3600 });
        n++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) disiscrivi(x.sub.endpoint); // dispositivo non più iscritto
        else log('notifica non inviata: ' + (e?.statusCode || e?.message || e));
      }
    }
    return n;
  }

  /** Messaggio nuovo arrivato: avvisa i dispositivi che lo vogliono (con le pause). */
  async function nuovoMessaggio({ linea, jid, nomeChat, autore, gruppo, allegato }) {
    const t = ora();
    const chiave = linea + '|' + jid;
    if (t - (ultimaPerChat.get(chiave) || 0) < PAUSA_PER_CHAT_MS) return 0;
    inviateMinuto = inviateMinuto.filter((x) => t - x < 60000);
    if (inviateMinuto.length >= MAX_AL_MINUTO) return 0;
    const destinatari = iscritti.filter((x) => x.pref[linea] && (!gruppo || x.pref.gruppi));
    if (!destinatari.length) return 0;
    ultimaPerChat.set(chiave, t);
    inviateMinuto.push(t);
    const { titolo, corpo } = testoNotifica({ linea, nomeChat, autore, gruppo, allegato });
    return spedisci(destinatari, { titolo, corpo, linea, tag: chiave, url: `./#/chat?p=${linea}` }, chiave);
  }

  async function prova(endpoint) {
    const x = iscritti.find((y) => y.sub.endpoint === endpoint);
    if (!x) throw new Error('Questo dispositivo non è iscritto alle notifiche.');
    return spedisci([x], { titolo: 'HUB', corpo: '✅ Le notifiche funzionano', tag: 'prova', url: './#/impostazioni' }, 'prova');
  }

  return { iscrivi, disiscrivi, preferenze, nuovoMessaggio, prova, quanti: () => iscritti.length };
}
