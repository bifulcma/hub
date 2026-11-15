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

import { dopoChiusura } from './linee.mjs';
describe('dopo la chiusura della connessione', () => {
  it('subito dopo il QR (515) si ricollega, anche sul Business senza credenziali complete', () => {
    expect(dopoChiusura({ linea: 'business', motivo: 515, spegnendo: false, haCredenziali: false })).toBe('riprova');
  });
  it('Business con QR mai inquadrato: si spegne', () => {
    expect(dopoChiusura({ linea: 'business', motivo: 408, spegnendo: false, haCredenziali: false })).toBe('spento');
  });
  it('Business già collegato: si ricollega dopo un problema di rete', () => {
    expect(dopoChiusura({ linea: 'business', motivo: 428, spegnendo: false, haCredenziali: true })).toBe('riprova');
  });
  it('logout dal telefono: uscito; «Scollega»: spento; Personale riprova sempre', () => {
    expect(dopoChiusura({ linea: 'personale', motivo: 401, spegnendo: false, haCredenziali: true })).toBe('uscito');
    expect(dopoChiusura({ linea: 'business', motivo: 401, spegnendo: true, haCredenziali: true })).toBe('spento');
    expect(dopoChiusura({ linea: 'personale', motivo: 408, spegnendo: false, haCredenziali: false })).toBe('riprova');
  });
});
