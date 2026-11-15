// Stessa persona indicata col numero e col codice nascosto (@lid): una sola chat, mai «numeri strani».
import { beforeEach, describe, expect, it } from 'vitest';
import { creaMemoria, nomeChat } from './memoria.mjs';

let chats, imparaDaContatto, imparaLid, jidChat, ricorda;

const PN = '391234567890@s.whatsapp.net';
const LID = '219876543210987@lid';
const msg = (id, remoteJid, testo, extra = {}) => ({
  key: { id, remoteJid, fromMe: false, ...extra },
  pushName: extra.fromMe ? undefined : 'martina',
  messageTimestamp: 1000 + Number(id.replace(/\D/g, '') || 0),
  message: { conversation: testo },
});

beforeEach(() => {
  ({ chats, imparaDaContatto, imparaLid, jidChat, ricorda } = creaMemoria());
});

describe('memoria hub-wa: codice nascosto (@lid) e numero', () => {
  it('remoteJidAlt nella busta: tutto finisce nella chat col numero', () => {
    ricorda(msg('a1', PN, 'ciao'));
    ricorda(msg('a2', LID, 'come va', { remoteJidAlt: PN }));
    expect([...chats.keys()]).toEqual([PN]);
    expect(chats.get(PN).messaggi.map((m) => m.testo)).toEqual(['ciao', 'come va']);
  });

  it('due chat già separate si uniscono quando si scopre chi è (lid-mapping)', () => {
    ricorda(msg('b1', PN, 'uno'));
    ricorda(msg('b2', LID, 'due', { fromMe: true }));
    expect(chats.size).toBe(2);
    imparaLid(LID + '', PN.replace('@', ':12@'));
    expect([...chats.keys()]).toEqual([PN]);
    const c = chats.get(PN);
    expect(c.nome).toBe('martina');
    expect(c.messaggi.map((m) => m.testo)).toEqual(['uno', 'due']);
    expect(jidChat(LID)).toBe(PN); // HUB con il vecchio jid trova ancora la chat (anche per «Invia»)
  });

  it('chat solo col codice nascosto diventa la chat col numero, senza duplicati di messaggi', () => {
    ricorda(msg('c1', LID, 'x'));
    ricorda(msg('c1', LID, 'x'));
    imparaLid(LID, PN);
    expect([...chats.keys()]).toEqual([PN]);
    expect(chats.get(PN).messaggi).toHaveLength(1);
  });

  it('dalla rubrica: contatto con lid e phoneNumber', () => {
    imparaDaContatto({ id: LID, phoneNumber: PN });
    ricorda(msg('d1', LID, 'ehi'));
    expect([...chats.keys()]).toEqual([PN]);
  });

  it('senza numero conosciuto: «Contatto senza nome», non il codice spacciato per numero', () => {
    expect(nomeChat({ jid: LID, nome: '' })).toBe('Contatto senza nome');
    expect(nomeChat({ jid: PN, nome: '' })).toBe('+391234567890');
    expect(nomeChat({ jid: LID, nome: 'Anna' })).toBe('Anna');
  });

  it('ignora gruppi e dati sbagliati', () => {
    expect(ricorda(msg('e1', '123-456@g.us', 'gruppo'))).toBe('');
    imparaLid(PN, LID); // al contrario: ignorato
    expect(jidChat(PN)).toBe(PN);
    expect(chats.size).toBe(0);
  });

  it('Personale e Business hanno memorie separate', () => {
    const altra = creaMemoria();
    ricorda(msg('f1', PN, 'personale'));
    altra.ricorda(msg('f2', PN, 'business'));
    expect(chats.get(PN).messaggi.map((m) => m.testo)).toEqual(['personale']);
    expect(altra.chats.get(PN).messaggi.map((m) => m.testo)).toEqual(['business']);
  });
});
