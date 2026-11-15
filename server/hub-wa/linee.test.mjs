import { describe, expect, it } from 'vitest';
import { lineaDa, motivoBlocco } from './linee.mjs';

const chatConRisposta = { messaggi: [{ daMe: false }, { daMe: true }] };
const chatSoloMia = { messaggi: [{ daMe: true }] };
const base = { testo: 'ciao', stato: 'collegato', ultimoInvio: 0, ora: 100000 };

describe('regole di invio di hub-wa', () => {
  it('Personale: si può inviare anche se l’altro non ha scritto', () => {
    expect(motivoBlocco({ ...base, linea: 'personale', chat: chatSoloMia })).toBeNull();
  });
  it('Business: solo a chi ti ha già scritto', () => {
    expect(motivoBlocco({ ...base, linea: 'business', chat: chatSoloMia })?.codice).toBe(403);
    expect(motivoBlocco({ ...base, linea: 'business', chat: chatConRisposta })).toBeNull();
  });
  it('pause: Personale 4 s, Business 15 s', () => {
    const ora = 100000;
    expect(motivoBlocco({ ...base, linea: 'personale', chat: chatConRisposta, ultimoInvio: ora - 5000, ora })).toBeNull();
    const b = motivoBlocco({ ...base, linea: 'business', chat: chatConRisposta, ultimoInvio: ora - 5000, ora });
    expect(b?.codice).toBe(429);
    expect(b?.errore).toMatch(/10 secondi/);
    expect(motivoBlocco({ ...base, linea: 'business', chat: chatConRisposta, ultimoInvio: ora - 15000, ora })).toBeNull();
  });
  it('chat assente, testo vuoto, numero scollegato', () => {
    expect(motivoBlocco({ ...base, linea: 'personale', chat: undefined })?.codice).toBe(400);
    expect(motivoBlocco({ ...base, linea: 'personale', chat: chatConRisposta, testo: '  ' })?.codice).toBe(400);
    expect(motivoBlocco({ ...base, linea: 'business', chat: chatConRisposta, stato: 'qr' })?.errore).toMatch(/Business non è collegato/);
  });
  it('lineaDa accetta solo valori noti', () => {
    expect(lineaDa('business')).toBe('business');
    expect(lineaDa('altro')).toBe('personale');
    expect(lineaDa(null)).toBe('personale');
  });
});
