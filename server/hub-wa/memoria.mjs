// hub-wa — memoria delle chat, SOLO in RAM (mai su disco).
// WhatsApp indica la stessa persona a volte col numero (…@s.whatsapp.net) e a volte con un codice
// nascosto (…@lid). Teniamo in RAM chi è chi e usiamo il numero appena lo conosciamo,
// così la stessa persona non compare due volte e non si vede un «numero strano».

export const MAX_CHAT = 150;
export const MAX_MSG = 40;

export const chatSingola = (jid) => !!jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
const soloUtente = (j) => String(j || '').replace(/:\d+(?=@)/, ''); // toglie il «:dispositivo»

export function testoDi(m) {
  const c = m?.message;
  if (!c) return '';
  const x = c.ephemeralMessage?.message || c.viewOnceMessage?.message || c;
  if (x.conversation) return x.conversation;
  if (x.extendedTextMessage?.text) return x.extendedTextMessage.text;
  if (x.imageMessage) return '[foto]' + (x.imageMessage.caption ? ' ' + x.imageMessage.caption : '');
  if (x.videoMessage) return '[video]' + (x.videoMessage.caption ? ' ' + x.videoMessage.caption : '');
  if (x.audioMessage) return '[messaggio vocale]';
  if (x.documentMessage) return '[documento] ' + (x.documentMessage.fileName || '');
  if (x.stickerMessage) return '[sticker]';
  if (x.locationMessage) return '[posizione]';
  if (x.contactMessage) return '[contatto] ' + (x.contactMessage.displayName || '');
  return '';
}

/** Nome da mostrare: mai il codice nascosto spacciato per numero. */
export const nomeChat = (c) => c.nome || (c.jid.endsWith('@lid') ? 'Contatto senza nome' : '+' + c.jid.replace(/@.*/, ''));


/** Una memoria per ogni numero collegato (Personale, Business): chat e «chi è chi», solo RAM. */
export function creaMemoria() {
  const chats = new Map(); // jid -> { jid, nome, messaggi: [{id, daMe, testo, ts}], ts }
  const lidPn = new Map(); // lid -> pn
  // Nomi, anche se arrivano PRIMA della chat: rubrica del telefono (vince) e nome scelto dalla persona.
  const rubrica = new Map(); // jid -> nome salvato in rubrica
  const notify = new Map(); // jid -> nome che la persona si è data su WhatsApp
  /** Jid con cui teniamo la chat: il numero se lo conosciamo, altrimenti quello ricevuto. */
  const jidChat = (j) => {
    const u = soloUtente(j);
    return lidPn.get(u) || u;
  };

  /** Impara che il codice nascosto `lid` è il numero `pn` e unisce le due chat se esistono entrambe. */
  function imparaLid(lid, pn) {
    lid = soloUtente(lid);
    pn = soloUtente(pn);
    if (!lid.endsWith('@lid') || !pn.endsWith('@s.whatsapp.net')) return;
    if (lidPn.get(lid) === pn) return;
    lidPn.set(lid, pn);
    const vecchia = chats.get(lid);
    if (!vecchia) return;
    chats.delete(lid);
    const c = chats.get(pn);
    if (!c) {
      chats.set(pn, { ...vecchia, jid: pn });
      return;
    }
    for (const m of vecchia.messaggi) if (!c.messaggi.some((x) => x.id === m.id)) c.messaggi.push(m);
    c.messaggi.sort((a, b) => a.ts - b.ts);
    if (c.messaggi.length > MAX_MSG) c.messaggi.splice(0, c.messaggi.length - MAX_MSG);
    if (!c.nome && vecchia.nome) c.nome = vecchia.nome;
    c.ts = Math.max(c.ts, vecchia.ts);
  }
  const nomeDa = (mappa, j) => mappa.get(j) || [...lidPn].filter(([, pn]) => pn === j).map(([lid]) => mappa.get(lid)).find(Boolean) || '';

  /** Nome da mostrare: rubrica, poi nome WhatsApp, poi numero; mai il codice nascosto. */
  function nomeDi(c) {
    return nomeDa(rubrica, c.jid) || c.nome || nomeDa(notify, c.jid) || nomeChat(c);
  }

  /** Dalla rubrica/storico: un contatto può portare sia il codice nascosto sia il numero. */
  function imparaDaContatto(k) {
    if (!k) return;
    const pn = soloUtente(k.phoneNumber || (String(k.id || '').endsWith('@s.whatsapp.net') ? k.id : ''));
    const lid = soloUtente(k.lid || (String(k.id || '').endsWith('@lid') ? k.id : ''));
    if (lid && pn) imparaLid(lid, pn);
    const n1 = String(k.name || '').trim();
    const n2 = String(k.notify || k.verifiedName || '').trim();
    for (const j of [pn, lid].filter(Boolean)) {
      if (n1) rubrica.set(j, n1);
      if (n2) notify.set(j, n2);
    }
  }

  /** Ricorda un messaggio. Restituisce il jid della chat (o '' se ignorato). */
  function ricorda(m) {
    const k = m?.key || {};
    const grezzo = soloUtente(k.remoteJid);
    if (!chatSingola(grezzo)) return '';
    const alt = soloUtente(k.remoteJidAlt);
    if (alt) {
      if (grezzo.endsWith('@lid')) imparaLid(grezzo, alt);
      else imparaLid(alt, grezzo);
    }
    const jid = jidChat(grezzo);
    const testo = testoDi(m).trim();
    if (!testo) return '';
    const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? Date.now() / 1000) * 1000;
    let c = chats.get(jid);
    if (!c) {
      c = { jid, nome: '', messaggi: [], ts: 0 };
      chats.set(jid, c);
    }
    if (!k.fromMe && m.pushName) c.nome = m.pushName;
    if (c.messaggi.some((x) => x.id === k.id)) return jid;
    c.messaggi.push({ id: k.id, daMe: !!k.fromMe, testo: testo.slice(0, 4000), ts });
    c.messaggi.sort((a, b) => a.ts - b.ts);
    if (c.messaggi.length > MAX_MSG) c.messaggi.splice(0, c.messaggi.length - MAX_MSG);
    c.ts = Math.max(c.ts, ts);
    if (chats.size > MAX_CHAT) {
      const vecchie = [...chats.values()].sort((a, b) => a.ts - b.ts).slice(0, chats.size - MAX_CHAT);
      for (const v of vecchie) chats.delete(v.jid);
    }
    return jid;
  }

  return { chats, jidChat, imparaLid, imparaDaContatto, ricorda, nomeDi, nomiInRubrica: () => rubrica.size, senzaNome: () => [...chats.values()].filter((c) => !nomeDa(rubrica, c.jid) && !c.nome && !nomeDa(notify, c.jid)).length, svuota: () => { chats.clear(); lidPn.clear(); rubrica.clear(); notify.clear(); } };
}
