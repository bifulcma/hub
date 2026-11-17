import { describe, expect, it, vi } from 'vitest';
import { creaNotifiche, testoNotifica } from './notifiche.mjs';

const sub = (n) => ({ endpoint: 'https://web.push.apple.com/' + n, keys: { p256dh: 'P' + n, auth: 'A' + n } });

function prepara(salvati = []) {
  let file = salvati;
  let t = 1_000_000;
  const invia = vi.fn(async () => {});
  const n = creaNotifiche({ invia, leggi: () => file, scrivi: (d) => { file = JSON.parse(JSON.stringify(d)); }, ora: () => t });
  return { n, invia, avanti: (ms) => { t += ms; }, file: () => file };
}

describe('notifiche', () => {
  it('il testo non contiene mai il messaggio', () => {
    expect(testoNotifica({ linea: 'business', nomeChat: 'Paolo', gruppo: false })).toEqual({ titolo: 'Paolo · Business', corpo: 'Ti ha scritto un messaggio' });
    expect(testoNotifica({ linea: 'personale', nomeChat: 'Famiglia', autore: 'Chiara', gruppo: true, allegato: 'foto' })).toEqual({ titolo: 'Famiglia · Personale', corpo: 'Chiara ha mandato una foto' });
  });
  it('iscrizione salvata (solo indirizzo e chiavi) e ripresa dopo un riavvio', () => {
    const a = prepara();
    a.n.iscrivi({ ...sub(1), altro: 'x' }, { gruppi: false, strano: true });
    expect(a.file()).toHaveLength(1);
    expect(a.file()[0].sub).toEqual(sub(1));
    expect(a.file()[0].pref).toEqual({ personale: true, business: true, gruppi: false });
    const b = prepara(a.file());
    expect(b.n.quanti()).toBe(1);
  });
  it('rispetta le preferenze e la pausa di 3 minuti per chat', async () => {
    const a = prepara();
    a.n.iscrivi(sub(1), { business: false });
    a.n.iscrivi(sub(2), {});
    expect(await a.n.nuovoMessaggio({ linea: 'business', jid: 'x', nomeChat: 'X' })).toBe(1); // solo il 2
    expect(await a.n.nuovoMessaggio({ linea: 'business', jid: 'x', nomeChat: 'X' })).toBe(0); // pausa
    a.avanti(3 * 60 * 1000);
    expect(await a.n.nuovoMessaggio({ linea: 'business', jid: 'x', nomeChat: 'X' })).toBe(1);
    expect(await a.n.nuovoMessaggio({ linea: 'personale', jid: 'y', nomeChat: 'Y' })).toBe(2);
    expect(a.invia.mock.calls[0][2]).toEqual({ TTL: 3600 }); // niente topic: Apple lo rifiuta
    const dati = JSON.parse(a.invia.mock.calls[0][1]);
    expect(dati).toMatchObject({ titolo: 'X · Business', url: './#/chat?p=business' });
  });
  it('gruppi spenti: niente notifiche dai gruppi', async () => {
    const a = prepara();
    a.n.iscrivi(sub(1), { gruppi: false });
    expect(await a.n.nuovoMessaggio({ linea: 'personale', jid: 'g@g.us', nomeChat: 'Famiglia', gruppo: true })).toBe(0);
  });
  it('al massimo 8 al minuto; dispositivo sparito (410) viene tolto', async () => {
    const a = prepara();
    a.n.iscrivi(sub(1), {});
    let tot = 0;
    for (let i = 0; i < 12; i++) tot += await a.n.nuovoMessaggio({ linea: 'personale', jid: 'c' + i, nomeChat: 'C' });
    expect(tot).toBe(8);
    a.invia.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    a.avanti(61000);
    await a.n.nuovoMessaggio({ linea: 'personale', jid: 'z', nomeChat: 'Z' });
    expect(a.n.quanti()).toBe(0);
  });
});
