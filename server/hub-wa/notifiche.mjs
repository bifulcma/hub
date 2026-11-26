// hub-wa — notifiche sul telefono/iPad quando arriva un messaggio (Web Push, tramite il servizio di Apple).
// Il contenuto è cifrato per il dispositivo (Apple non lo legge) e NON contiene il testo del messaggio:
// solo chi ha scritto e su quale numero. Sul disco del Mini si salvano solo le «iscrizioni» dei dispositivi
// (indirizzo del servizio push + chiavi), mai messaggi.

export const PREFERENZE_BASE = { personale: true, business: true, gruppi: true, silenzio: true };
// Meno rumore: al primo messaggio la notifica arriva subito; per i 10 minuti dopo niente, poi UN riassunto.
export const FINESTRA_MS = 10 * 60 * 1000;
// Silenzio di notte (ora del Mac mini): niente notifiche, alle 7 un solo riassunto della notte.
export const NOTTE_DA = 22;
export const NOTTE_A = 7;
export const diNotte = (t) => {
  const h = new Date(t).getHours();
  return h >= NOTTE_DA || h < NOTTE_A;
};
export function fineNotte(t) {
  const d = new Date(t);
  if (d.getHours() >= NOTTE_DA) d.setDate(d.getDate() + 1);
  d.setHours(NOTTE_A, 0, 0, 0);
  return d.getTime();
}

/** Riassunto di più messaggi: chi ha scritto (al massimo 3 nomi), mai il testo. */
export function testoRiassunto(voci, notte = false) {
  const chat = [...new Map(voci.map((v) => [v.linea + '|' + v.jid, v])).values()];
  const nomi = chat.map((v) => v.nomeChat);
  const elenco = nomi.length <= 3 ? nomi.join(', ').replace(/, ([^,]*)$/, ' e $1') : nomi.slice(0, 3).join(', ') + ` e altri ${nomi.length - 3}`;
  const linee = [...new Set(voci.map((v) => v.linea))];
  const dove = linee.length > 1 ? ' (Personale e Business)' : linee[0] === 'business' ? ' (Business)' : ' (Personale)';
  const n = voci.length;
  return {
    titolo: (notte ? 'Stanotte: ' : 'HUB · ') + (n === 1 ? '1 messaggio nuovo' : `${n} messaggi nuovi`),
    corpo: 'Da ' + elenco + dove,
    url: linee.length > 1 ? './#/chat' : `./#/chat?p=${linee[0]}`,
  };
}

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
export function creaNotifiche({ invia, leggi, scrivi, ora = () => Date.now(), log = () => {}, timer = (f, ms) => setTimeout(f, ms) }) {
  let iscritti = [];
  try {
    const d = leggi();
    if (Array.isArray(d)) iscritti = d.filter((x) => x?.sub?.endpoint).map((x) => ({ ...x, pref: { ...PREFERENZE_BASE, ...x.pref } }));
  } catch {}
  const salva = () => { try { scrivi(iscritti); } catch (e) { log('notifiche: non salvo le iscrizioni: ' + e.message); } };
  // Per ogni dispositivo, solo in RAM: quando ha avuto l'ultima notifica e cosa aspetta nel riassunto.
  const stati = new Map(); // endpoint -> { ultimo, attesa: [], timerAttesa, notte: [], timerNotte }
  const statoDi = (endpoint) => {
    if (!stati.has(endpoint)) stati.set(endpoint, { ultimo: 0, attesa: [], timerAttesa: null, notte: [], timerNotte: null });
    return stati.get(endpoint);
  };

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
    stati.delete(endpoint);
    if (iscritti.length !== prima) salva();
    return prima !== iscritti.length;
  }
  const preferenze = (endpoint) => iscritti.find((x) => x.sub.endpoint === endpoint)?.pref || null;

  async function spedisci(x, dati) {
    try {
      // Niente «topic»: Apple lo rifiuta (400 BadWebPushTopic, provato il 17/11/2026).
      await invia(x.sub, JSON.stringify(dati), { TTL: 3600 });
      return 1;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) disiscrivi(x.sub.endpoint); // dispositivo non più iscritto
      else log('notifica non inviata: ' + (e?.statusCode || e?.message || e));
      return 0;
    }
  }
  const ancoraIscritto = (endpoint) => iscritti.find((y) => y.sub.endpoint === endpoint);

  function chiudiFinestra(endpoint) {
    const st = statoDi(endpoint);
    st.timerAttesa = null;
    const x = ancoraIscritto(endpoint);
    if (!x || !st.attesa.length) return;
    const voci = st.attesa.splice(0);
    st.ultimo = ora();
    const r = voci.length === 1 ? { ...testoNotifica(voci[0]), url: `./#/chat?p=${voci[0].linea}` } : testoRiassunto(voci);
    spedisci(x, { titolo: r.titolo, corpo: r.corpo, tag: 'hub-riassunto', url: r.url });
  }
  function finisceNotte(endpoint) {
    const st = statoDi(endpoint);
    st.timerNotte = null;
    const x = ancoraIscritto(endpoint);
    if (!x || !st.notte.length) return;
    const r = testoRiassunto(st.notte.splice(0), true);
    st.ultimo = ora();
    spedisci(x, { titolo: r.titolo, corpo: r.corpo, tag: 'hub-notte', url: r.url });
  }

  /** Messaggio nuovo arrivato: subito se è il primo da un po', altrimenti nel riassunto; di notte al mattino. */
  async function nuovoMessaggio(voce) {
    const t = ora();
    let n = 0;
    for (const x of iscritti) {
      if (!x.pref[voce.linea] || (voce.gruppo && !x.pref.gruppi)) continue;
      const st = statoDi(x.sub.endpoint);
      if (x.pref.silenzio && diNotte(t)) {
        st.notte.push(voce);
        if (!st.timerNotte) st.timerNotte = timer(() => finisceNotte(x.sub.endpoint), fineNotte(t) - t);
        continue;
      }
      if (!st.attesa.length && t - st.ultimo >= FINESTRA_MS) {
        st.ultimo = t;
        const { titolo, corpo } = testoNotifica(voce);
        n += await spedisci(x, { titolo, corpo, linea: voce.linea, tag: voce.linea + '|' + voce.jid, url: `./#/chat?p=${voce.linea}` });
        continue;
      }
      st.attesa.push(voce);
      if (!st.timerAttesa) st.timerAttesa = timer(() => chiudiFinestra(x.sub.endpoint), Math.max(1000, st.ultimo + FINESTRA_MS - t));
    }
    return n;
  }

  async function prova(endpoint) {
    const x = ancoraIscritto(endpoint);
    if (!x) throw new Error('Questo dispositivo non è iscritto alle notifiche.');
    return spedisci(x, { titolo: 'HUB', corpo: '✅ Le notifiche funzionano', tag: 'prova', url: './#/impostazioni' });
  }

  return { iscrivi, disiscrivi, preferenze, nuovoMessaggio, prova, quanti: () => iscritti.length };
}
