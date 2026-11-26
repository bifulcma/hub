import { describe, expect, it, vi } from 'vitest';
import { creaNotifiche, diNotte, fineNotte, testoNotifica, testoRiassunto, FINESTRA_MS } from './notifiche.mjs';

const sub = (n) => ({ endpoint: 'https://web.push.apple.com/' + n, keys: { p256dh: 'P' + n, auth: 'A' + n } });
const alle = (h, m = 0) => new Date(2026, 10, 26, h, m).getTime();
const voce = (jid, extra = {}) => ({ linea: 'personale', jid, nomeChat: jid.toUpperCase(), ...extra });

function prepara({ salvati = [], t0 = alle(15) } = {}) {
  let file = salvati;
  let t = t0;
  const timers = [];
  const invia = vi.fn(async () => {});
  const n = creaNotifiche({
    invia,
    leggi: () => file,
    scrivi: (d) => { file = JSON.parse(JSON.stringify(d)); },
    ora: () => t,
    timer: (f, ms) => { timers.push({ f, quando: t + ms }); return timers.length; },
  });
  const avanti = (ms) => {
    t += ms;
    for (const x of timers.filter((y) => !y.fatto && y.quando <= t)) { x.fatto = true; x.f(); }
  };
  const inviate = () => invia.mock.calls.map((c) => JSON.parse(c[1]));
  return { n, invia, avanti, inviate, file: () => file };
}

describe('notifiche: testi', () => {
  it('il testo non contiene mai il messaggio', () => {
    expect(testoNotifica({ linea: 'business', nomeChat: 'Paolo', gruppo: false })).toEqual({ titolo: 'Paolo · Business', corpo: 'Ti ha scritto un messaggio' });
    expect(testoNotifica({ linea: 'personale', nomeChat: 'Famiglia', autore: 'Chiara', gruppo: true, allegato: 'foto' })).toEqual({ titolo: 'Famiglia · Personale', corpo: 'Chiara ha mandato una foto' });
  });
  it('riassunto: chi ha scritto, al massimo 3 nomi', () => {
    expect(testoRiassunto([voce('a'), voce('b'), voce('a')]).corpo).toBe('Da A e B (Personale)');
    expect(testoRiassunto([voce('a'), voce('b'), voce('c'), voce('d', { linea: 'business' })])).toMatchObject({ titolo: 'HUB · 4 messaggi nuovi', corpo: 'Da A, B, C e altri 1 (Personale e Business)', url: './#/chat' });
    expect(testoRiassunto([voce('a')], true).titolo).toBe('Stanotte: 1 messaggio nuovo');
  });
  it('notte: dalle 22 alle 7', () => {
    expect(diNotte(alle(23))).toBe(true);
    expect(diNotte(alle(3))).toBe(true);
    expect(diNotte(alle(7))).toBe(false);
    expect(new Date(fineNotte(alle(23))).getHours()).toBe(7);
    expect(fineNotte(alle(23)) - alle(23)).toBe(8 * 3600 * 1000);
  });
});

describe('notifiche: meno rumore', () => {
  it('iscrizione salvata (solo indirizzo e chiavi); le vecchie ricevono «silenzio» acceso', () => {
    const a = prepara();
    a.n.iscrivi({ ...sub(1), altro: 'x' }, { gruppi: false, strano: true });
    expect(a.file()[0].sub).toEqual(sub(1));
    expect(a.file()[0].pref).toEqual({ personale: true, business: true, gruppi: false, silenzio: true });
    const b = prepara({ salvati: [{ sub: sub(2), pref: { personale: true, business: true, gruppi: true } }] });
    expect(b.n.preferenze(sub(2).endpoint).silenzio).toBe(true);
  });
  it('di giorno: la prima subito, le altre in UN riassunto dopo 10 minuti', async () => {
    const a = prepara();
    a.n.iscrivi(sub(1), {});
    expect(await a.n.nuovoMessaggio(voce('a'))).toBe(1);
    await a.n.nuovoMessaggio(voce('b'));
    await a.n.nuovoMessaggio(voce('c'));
    await a.n.nuovoMessaggio(voce('b'));
    expect(a.inviate()).toHaveLength(1);
    a.avanti(FINESTRA_MS);
    await Promise.resolve();
    expect(a.inviate()).toHaveLength(2);
    expect(a.inviate()[1]).toMatchObject({ titolo: 'HUB · 3 messaggi nuovi', corpo: 'Da B e C (Personale)' });
    a.avanti(FINESTRA_MS); // niente di nuovo: niente notifica
    expect(a.inviate()).toHaveLength(2);
  });
  it('un solo messaggio nel riassunto: notifica normale', async () => {
    const a = prepara();
    a.n.iscrivi(sub(1), {});
    await a.n.nuovoMessaggio(voce('a'));
    await a.n.nuovoMessaggio(voce('b', { linea: 'business' }));
    a.avanti(FINESTRA_MS);
    expect(a.inviate()[1]).toMatchObject({ titolo: 'B · Business', corpo: 'Ti ha scritto un messaggio', url: './#/chat?p=business' });
  });
  it('di notte niente; alle 7 un solo riassunto', async () => {
    const a = prepara({ t0: alle(23) });
    a.n.iscrivi(sub(1), {});
    await a.n.nuovoMessaggio(voce('a'));
    a.avanti(3600 * 1000);
    await a.n.nuovoMessaggio(voce('b'));
    expect(a.inviate()).toHaveLength(0);
    a.avanti(7 * 3600 * 1000); // ore 7
    expect(a.inviate()).toEqual([expect.objectContaining({ titolo: 'Stanotte: 2 messaggi nuovi', corpo: 'Da A e B (Personale)' })]);
  });
  it('silenzio spento: anche di notte; preferenze e gruppi rispettati', async () => {
    const a = prepara({ t0: alle(23) });
    a.n.iscrivi(sub(1), { silenzio: false, gruppi: false });
    a.n.iscrivi(sub(2), { personale: false });
    expect(await a.n.nuovoMessaggio(voce('a'))).toBe(1); // solo il 1
    expect(await a.n.nuovoMessaggio(voce('g@g.us', { gruppo: true, autore: 'Chiara' }))).toBe(0);
  });
  it('dispositivo sparito (410) viene tolto', async () => {
    const a = prepara();
    a.n.iscrivi(sub(1), {});
    a.invia.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    await a.n.nuovoMessaggio(voce('a'));
    expect(a.n.quanti()).toBe(0);
    expect(a.invia.mock.calls[0][2]).toEqual({ TTL: 3600 }); // niente topic: Apple lo rifiuta
  });
});
