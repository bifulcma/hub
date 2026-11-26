import { describe, expect, it, vi } from 'vitest';
import { askConRiprova, leggiRisposte, promptChat, promptRispondi, promptScrivi, pulisciTesto, erroreSemplice } from './ai';
import { condividi, copia } from './invio';
import { chiediIA, collegaDalMini, contesto, iaPronta, leggiCollegamento, leggiCollegamentoDaTesto, nomeIA, paginaCollega, waChat, waChats, waInvia, waScollega } from './wa';
import { esporta, importa, normalizza, ordinaPronti, ponteValido, statoIniziale } from './store';
import { askBridge, BridgeError, parseBridgeSseStream, provaPonte } from './ponte';

describe('leggiRisposte', () => {
  it('legge JSON pulito', () => {
    expect(leggiRisposte('{"risposte":["a","b","c"]}')).toEqual(['a', 'b', 'c']);
  });
  it('legge JSON dentro ```json e testo attorno', () => {
    expect(leggiRisposte('Ecco:\n```json\n{"risposte":["uno","due"]}\n```\nfine')).toEqual(['uno', 'due']);
  });
  it('tiene al massimo 3 risposte e scarta vuote', () => {
    expect(leggiRisposte('{"risposte":["a","","b",3,"c","d"]}')).toEqual(['a', 'b', 'c']);
  });
  it('accetta un semplice array', () => {
    expect(leggiRisposte('["x","y"]')).toEqual(['x', 'y']);
  });
  it('campi mancanti → errore gentile', () => {
    expect(() => leggiRisposte('{"altro":1}')).toThrow(/Riprova/);
    expect(() => leggiRisposte('')).toThrow(/Riprova/);
  });
});

describe('leggiRisposte robusto', () => {
  it('prosa con graffe e quadre attorno resta leggibile', () => {
    expect(leggiRisposte('Ecco {3} idee [vedi] poi {"risposte":["a","b","c"]} fine }')).toEqual(['a', 'b', 'c']);
  });
  it('graffe dentro le stringhe non confondono', () => {
    expect(leggiRisposte('{"risposte":["ok {sì}","va bene ]"]}')).toEqual(['ok {sì}', 'va bene ]']);
  });
});

describe('askConRiprova', () => {
  it('due fallimenti → propaga l’errore', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('x'));
    await expect(askConRiprova({ bridgeUrl: 'https://x', token: 't', provider: 'claude', prompt: 'p' }, ask)).rejects.toThrow('x');
    expect(ask).toHaveBeenCalledTimes(2);
  });
  const o = { bridgeUrl: 'https://x', token: 't', provider: 'claude' as const, prompt: 'p' };
  it('riprova una volta se la prima fallisce', async () => {
    const ask = vi.fn().mockRejectedValueOnce(new Error('vuoto')).mockResolvedValueOnce('ok');
    await expect(askConRiprova(o, ask)).resolves.toBe('ok');
    expect(ask).toHaveBeenCalledTimes(2);
  });
  it('riprova se la prima risposta è vuota', async () => {
    const ask = vi.fn().mockResolvedValueOnce('  ').mockResolvedValueOnce('bene');
    await expect(askConRiprova(o, ask)).resolves.toBe('bene');
  });
  it('non riprova se annullato', async () => {
    const c = new AbortController();
    c.abort();
    const ask = vi.fn().mockRejectedValue(new Error('abort'));
    await expect(askConRiprova({ ...o, signal: c.signal }, ask)).rejects.toThrow();
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe('prompt', () => {
  const s = statoIniziale();
  it('Rispondi usa tono, lingua, JSON e SOLO_TESTO', () => {
    const { system, prompt } = promptRispondi(s.profili.business, 'Ci vediamo giovedì?', "di' di sì");
    expect(system).toMatch(/professionale/);
    expect(system).toMatch(/italiano/);
    expect(system).toMatch(/"risposte"/);
    expect(system).toMatch(/Non usare strumenti/);
    expect(prompt).toMatch(/giovedì/);
    expect(prompt).toMatch(/di' di sì/);
  });
  it('Scrivi traduci indica la lingua', () => {
    expect(promptScrivi(s.profili.personale, 'ciao', 'traduci', 'fr').system).toMatch(/francese/);
  });
  it('pulisciTesto toglie virgolette e blocchi', () => {
    expect(pulisciTesto('"Ciao!"')).toBe('Ciao!');
    expect(pulisciTesto('```\nCiao\n```')).toBe('Ciao');
  });
  it('erroreSemplice: token e Tailscale', () => {
    expect(erroreSemplice(new BridgeError('x', 401))).toMatch(/token/);
    expect(erroreSemplice(new Error('Impossibile contattare il ponte AI: Load failed'))).toMatch(/Tailscale/);
  });
});

describe('dati', () => {
  it('stato iniziale: 2 profili con 6 pronti ciascuno', () => {
    const s = statoIniziale();
    expect(Object.keys(s.profili)).toEqual(['personale', 'business']);
    expect(s.pronti.personale).toHaveLength(6);
    expect(s.pronti.business).toHaveLength(6);
  });
  it('profilo attivo e pronti sopravvivono a salva/carica (normalizza)', () => {
    const s = statoIniziale();
    s.attivo = 'business';
    s.pronti.business = [{ id: 'a', testo: 'mio', preferito: true }];
    const r = normalizza(JSON.parse(JSON.stringify(s)));
    expect(r.attivo).toBe('business');
    expect(r.pronti.business[0].testo).toBe('mio');
  });
  it('dati rotti → valori predefiniti', () => {
    expect(normalizza('spazzatura').attivo).toBe('personale');
    expect(normalizza({ attivo: 'boh' }).pronti.personale).toHaveLength(6);
  });
  it('ordinaPronti: preferiti in cima e ricerca', () => {
    const l = [
      { id: '1', testo: 'Ciao', preferito: false },
      { id: '2', testo: 'Grazie', preferito: true },
      { id: '3', testo: 'Ciao ciao', preferito: true },
    ];
    expect(ordinaPronti(l).map((p) => p.id)).toEqual(['2', '3', '1']);
    expect(ordinaPronti(l, 'ciao').map((p) => p.id)).toEqual(['3', '1']);
  });
  it('esportazione senza token, importazione tiene il token attuale', () => {
    const s = statoIniziale();
    s.impostazioni.token = 'SEGRETO';
    const file = esporta(s);
    expect(file).not.toContain('SEGRETO');
    const altro = statoIniziale();
    altro.impostazioni.token = 'MIO';
    const r = importa(file, altro);
    expect(r.impostazioni.token).toBe('MIO');
    expect(r.pronti.personale).toHaveLength(6);
  });
  it('importa NON prende ponte né profilo attivo dal file (il token non può finire altrove)', () => {
    const s = statoIniziale();
    s.attivo = 'business';
    const file = JSON.parse(esporta(s));
    file.impostazioni.ponte = 'https://cattivo.example.com';
    const mio = statoIniziale();
    mio.impostazioni.token = 'MIO';
    const r = importa(JSON.stringify(file), mio);
    expect(r.impostazioni.ponte).toBe(mio.impostazioni.ponte);
    expect(r.attivo).toBe('personale');
  });
  it('normalizza regge tipi sbagliati', () => {
    const r = normalizza({ impostazioni: 'x', profili: { personale: 5, business: { nome: 3, lingua: 'zz' } } });
    expect(r.impostazioni.ponte).toMatch(/^https:/);
    expect(r.profili.business.nome).toBe('Business');
    expect(r.profili.business.lingua).toBe('it');
  });
  it('ponteValido vuole https', () => {
    expect(ponteValido('https://a.ts.net:8443')).toBe(true);
    expect(ponteValido('http://a')).toBe(false);
    expect(ponteValido('boh')).toBe(false);
  });
  it('importa rifiuta file estranei', () => {
    expect(() => importa('{"a":1}', statoIniziale())).toThrow(/HUB/);
  });
});

describe('invio', () => {
  it('Condividi usa il foglio di sistema', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await expect(condividi('ciao', { share })).resolves.toBe('condiviso');
    expect(share).toHaveBeenCalledWith({ text: 'ciao' });
  });
  it('senza share → ripiego su Copia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(condividi('ciao', { clipboard: { writeText } })).resolves.toBe('copiato');
    expect(writeText).toHaveBeenCalledWith('ciao');
  });
  it('foglio chiuso dall’utente → annullato, niente copia', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const writeText = vi.fn();
    await expect(condividi('ciao', { share, clipboard: { writeText } })).resolves.toBe('annullato');
    expect(writeText).not.toHaveBeenCalled();
  });
  it('copia diretta', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copia('x', { clipboard: { writeText } })).resolves.toBe('copiato');
  });
});

describe('ponte SSE e askBridge', () => {
  const corpo = (s: string) => new Response(s).body!;
  it('concatena i text e ignora thinking', async () => {
    const s = 'event: text\ndata: {"t":"a"}\n\nevent: thinking\ndata: {}\n\nevent: text\ndata: {"t":"b"}\n\nevent: done\ndata: {}\n\n';
    await expect(parseBridgeSseStream(corpo(s))).resolves.toBe('ab');
  });
  it('evento error → BridgeError', async () => {
    await expect(parseBridgeSseStream(corpo('event: error\ndata: {"message":"fuoco"}\n\n'))).rejects.toThrow(/fuoco/);
  });
  it('401 → BridgeError con status', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: '', json: () => Promise.resolve({ message: 'no' }) });
    await expect(askBridge({ bridgeUrl: 'https://p', token: 't', provider: 'claude', prompt: 'x', fetchFn: f as never })).rejects.toMatchObject({ status: 401 });
  });
  it('manda Bearer e provider claude a /ask', async () => {
    const f = vi.fn().mockResolvedValue(new Response('event: text\ndata: {"t":"ok"}\n\n'));
    await expect(askBridge({ bridgeUrl: 'https://p/', token: ' t ', provider: 'claude', prompt: 'x', system: 's', fetchFn: f as never })).resolves.toBe('ok');
    expect(f.mock.calls[0][0]).toBe('https://p/ask');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ provider: 'claude', system: 's', web: false });
  });
});

describe('wa (Mac mini)', () => {
  const imp = { ...statoIniziale().impostazioni, waUrl: 'https://mini.ts.net:8445/', waToken: 'T' };
  it('leggiCollegamentoDaTesto: link intero incollato, con spazi, o testo sbagliato', () => {
    const link = 'https://bifulcma.github.io/hub/#/impostazioni?wa=' + encodeURIComponent('https://m:8445') + '&watoken=abc';
    expect(leggiCollegamentoDaTesto('  ' + link + '\n')).toEqual({ waUrl: 'https://m:8445', waToken: 'abc' });
    expect(leggiCollegamentoDaTesto('wa=' + encodeURIComponent('https://m:8445') + '&watoken=abc')).toEqual({ waUrl: 'https://m:8445', waToken: 'abc' });
    expect(leggiCollegamentoDaTesto('ciao')).toBeNull();
    expect(leggiCollegamentoDaTesto('')).toBeNull();
  });
  it('collegaDalMini: un tocco legge il link dal Mini; errori chiari', async () => {
    const link = 'https://bifulcma.github.io/hub/#/impostazioni?wa=' + encodeURIComponent('https://m:8445') + '&watoken=abc';
    const ok = vi.fn(async () => new Response(JSON.stringify({ stato: 'collegato', numero: '+39', link }), { status: 200 }));
    expect(await collegaDalMini('https://m:8445/', ok as never)).toEqual({ waUrl: 'https://m:8445', waToken: 'abc' });
    expect((ok.mock.calls[0] as unknown[])[0]).toBe('https://m:8445/collega/stato');
    const qr = vi.fn(async () => new Response(JSON.stringify({ stato: 'qr', link: '' }), { status: 200 }));
    await expect(collegaDalMini('https://m', qr as never)).rejects.toThrow(/QR/);
    const chiusa = vi.fn(async () => new Response(JSON.stringify({ stato: 'collegato', link: '' }), { status: 200 }));
    await expect(collegaDalMini('https://m', chiusa as never)).rejects.toThrow(/10 minuti/);
    const giu = vi.fn(async () => { throw new TypeError('Load failed'); });
    await expect(collegaDalMini('https://m', giu as never)).rejects.toThrow(/Tailscale/);
  });
  it('leggiCollegamento dal link della pagina collega', () => {
    expect(leggiCollegamento('#/impostazioni?wa=' + encodeURIComponent('https://m:8445') + '&watoken=abc')).toEqual({ waUrl: 'https://m:8445', waToken: 'abc' });
    expect(leggiCollegamento('#/impostazioni?wa=http%3A%2F%2Fm&watoken=abc')).toBeNull();
    expect(leggiCollegamento('#/impostazioni')).toBeNull();
  });
  it('con WhatsApp collegato e Nemotron scelto, l’IA passa dal Mini e non da Claude', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ testo: 'ciao' }) });
    await expect(chiediIA(imp, { system: 's', prompt: 'p', json: true }, f as never)).resolves.toBe('ciao');
    expect(f.mock.calls[0][0]).toBe('https://mini.ts.net:8445/ai');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer T');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ system: 's', prompt: 'p', json: true });
  });
  it('con Claude scelto va al ponte', async () => {
    const f = vi.fn().mockResolvedValue(new Response('event: text\ndata: {"t":"ok"}\n\n'));
    await expect(chiediIA({ ...imp, ia: 'claude', token: 'x' }, { system: 's', prompt: 'p' }, f as never)).resolves.toBe('ok');
    expect(f.mock.calls[0][0]).toMatch(/\/ask$/);
  });
  it('iaPronta e nomeIA', () => {
    expect(iaPronta({ ...imp, waToken: '' })).toBe(false);
    expect(iaPronta(imp)).toBe(true);
    expect(nomeIA(imp)).toMatch(/IA locale/);
  });
  it('Business: ogni chiamata porta linea=business, il Personale resta come prima', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ stato: 'collegato', chats: [], ok: true }), { status: 200 }));
    const i = { ...imp, waUrl: 'https://m:8445/' };
    await waChats(i, 'business', undefined, f as never);
    await waChats(i, 'personale', undefined, f as never);
    await waChat(i, 'a@b', 'business', undefined, f as never);
    await waInvia(i, 'a@b', 'hi', 'business', f as never);
    await waScollega(i, 'business', f as never);
    const urls = f.mock.calls.map((c) => (c as unknown[])[0]);
    expect(urls).toEqual(['https://m:8445/chats?linea=business', 'https://m:8445/chats', 'https://m:8445/chat?jid=a%40b&linea=business', 'https://m:8445/send', 'https://m:8445/scollega?linea=business']);
    expect(JSON.parse(((f.mock.calls[3] as unknown[])[1] as RequestInit).body as string)).toEqual({ jid: 'a@b', testo: 'hi', linea: 'business' });
    expect(paginaCollega(i, 'business')).toBe('https://m:8445/collega?linea=business');
  });
  it('waInvia: 401 → messaggio chiaro', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'token' }) });
    await expect(waInvia(imp, 'j', 't', 'personale', f as never)).rejects.toThrow(/password/);
  });
  it('waInvia: errore del Mini riportato', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ error: 'Aspetta 3 secondi' }) });
    await expect(waInvia(imp, 'j', 't', 'personale', f as never)).rejects.toThrow(/Aspetta/);
  });
  it('contesto: ultimi messaggi con i nomi', () => {
    const c = { jid: 'j', nome: 'Anna', messaggi: [{ id: '1', daMe: false, testo: 'ciao', ts: 1 }, { id: '2', daMe: true, testo: 'ehi', ts: 2 }] };
    expect(contesto(c)).toBe('Anna: ciao\nMarco: ehi');
  });
  it('esportazione non contiene il token di WhatsApp', () => {
    const s = statoIniziale();
    s.impostazioni.waToken = 'SEGRETOWA';
    expect(esporta(s)).not.toContain('SEGRETOWA');
  });
  it('promptChat include conversazione e intenzione', () => {
    const { prompt, system } = promptChat(statoIniziale().profili.personale, 'Anna', 'Anna: ciao', 'va bene');
    expect(prompt).toMatch(/Anna: ciao/);
    expect(prompt).toMatch(/va bene/);
    expect(system).toMatch(/"risposte"/);
  });
});

describe('provaPonte', () => {
  it('va in timeout se il ponte non risponde', async () => {
    const f = vi.fn((_u: string, o: { signal: AbortSignal }) => new Promise((_ok, ko) => o.signal.addEventListener('abort', () => ko(new Error('abort')))));
    expect(await provaPonte('https://p', 't', f as never, 20)).toBe('irraggiungibile');
  });
  it('ok / token / irraggiungibile', async () => {
    expect(await provaPonte('https://p/', 't', vi.fn().mockResolvedValue({ ok: true, status: 200 }) as never)).toBe('ok');
    expect(await provaPonte('https://p', 't', vi.fn().mockResolvedValue({ ok: false, status: 401 }) as never)).toBe('token');
    expect(await provaPonte('https://p', 't', vi.fn().mockRejectedValue(new Error('Load failed')) as never)).toBe('irraggiungibile');
  });
  it('chiama /health con il token Bearer', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await provaPonte('https://p///', ' abc ', f as never);
    expect(f.mock.calls[0][0]).toBe('https://p/health');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  });
});

import { avatar, COLORI_AVATAR, iniziali } from './avatar';
describe('icone delle persone', () => {
  it('iniziali: due parole → due lettere, una parola → una, emoji ignorate', () => {
    expect(iniziali('Paolo Bifulco')).toBe('PB');
    expect(iniziali('martina')).toBe('M');
    expect(iniziali('Carlo Bruno Bifulco')).toBe('CB');
    expect(iniziali('🌸 Vane Viola')).toBe('VV');
    expect(iniziali('Élodie')).toBe('É');
  });
  it('colore fisso per numero, diverso tra persone diverse', () => {
    const a = avatar('martina', '391111111111@s.whatsapp.net');
    expect(avatar('Martina B.', '391111111111@s.whatsapp.net').colore).toBe(a.colore); // cambia il nome, non il colore
    const colori = new Set(Array.from({ length: 40 }, (_, i) => avatar('X', `39${1000 + i}@s.whatsapp.net`).colore));
    expect(colori.size).toBeGreaterThan(8);
    expect(COLORI_AVATAR).toContain(a.colore);
  });
  it('senza nome (solo numero): icona neutra', () => {
    expect(avatar('+33640628502', '33640628502@s.whatsapp.net')).toEqual({ lettere: '', colore: '#8c847a', anonimo: true });
    expect(avatar('Contatto senza nome', 'x@lid').anonimo).toBe(true);
  });
});

import { dimensione, indirizzoAllegato } from './wa';
describe('allegati in HUB', () => {
  it('indirizzo completo solo se c’è il Mini e l’indirizzo firmato', () => {
    const i = { ...statoIniziale().impostazioni, waUrl: 'https://m:8445/', waToken: 'T' };
    expect(indirizzoAllegato(i, { tipo: 'foto', mime: 'image/jpeg', byte: 1, nome: '', url: '/allegato?l=personale&s=x' })).toBe('https://m:8445/allegato?l=personale&s=x');
    expect(indirizzoAllegato(i, { tipo: 'foto', mime: 'image/jpeg', byte: 1, nome: '' })).toBe('');
    expect(indirizzoAllegato({ ...i, waUrl: '' }, { tipo: 'foto', mime: 'image/jpeg', byte: 1, nome: '', url: '/a' })).toBe('');
  });
  it('dimensioni leggibili', () => {
    expect(dimensione(0)).toBe('');
    expect(dimensione(500)).toBe('1 KB');
    expect(dimensione(120000)).toBe('117 KB');
    expect(dimensione(1500000)).toBe('1,4 MB');
  });
});

describe('gruppi in HUB', () => {
  it('il contesto per Nemotron dice chi ha scritto cosa', () => {
    const c = { jid: 'g@g.us', nome: 'Famiglia', gruppo: true, messaggi: [
      { id: '1', daMe: false, testo: 'ci vediamo domenica?', ts: 1, autore: 'Paolo' },
      { id: '2', daMe: false, testo: 'io ci sono', ts: 2, autore: 'Chiara' },
      { id: '3', daMe: true, testo: 'anche io', ts: 3 },
    ] };
    expect(contesto(c)).toBe('Paolo: ci vediamo domenica?\nChiara: io ci sono\nMarco: anche io');
  });
});

import { conInizio, nuovo, quantiNuovi, segnaVisto, type Visti } from './nuovi';
describe('avviso messaggi nuovi (solo sul dispositivo)', () => {
  const c = (jid: string, ts: number, daMe = false) => ({ jid, nome: jid, ultimo: 'x', daMe, ts });
  it('al primo avvio niente è nuovo', () => {
    let v: Visti = { inizio: {}, chat: {} };
    const lista = [c('a', 100), c('b', 200)];
    v = conInizio(v, 'personale', lista, 150);
    expect(quantiNuovi(v, 'personale', lista)).toBe(0);
  });
  it('un messaggio arrivato dopo è nuovo; aprendo la chat non lo è più', () => {
    let v: Visti = { inizio: { personale: 1000 }, chat: {} };
    expect(nuovo(v, 'personale', c('a', 1500))).toBe(true);
    v = segnaVisto(v, 'personale', 'a', 1500);
    expect(nuovo(v, 'personale', c('a', 1500))).toBe(false);
    expect(nuovo(v, 'personale', c('a', 1600))).toBe(true);
  });
  it('se l’ultimo messaggio è mio non è nuovo; le linee sono separate', () => {
    const v: Visti = { inizio: { personale: 1000, business: 1000 }, chat: { 'personale|a': 2000 } };
    expect(nuovo(v, 'personale', c('a', 3000, true))).toBe(false);
    expect(nuovo(v, 'business', c('a', 1500))).toBe(true);
    expect(nuovo({ inizio: {}, chat: {} }, 'business', c('a', 1500))).toBe(false); // linea mai vista: niente pallini
  });
});

import { chiaveInByte } from './wa';
describe('notifiche in HUB', () => {
  it('chiave VAPID base64url → byte', () => {
    expect(Array.from(chiaveInByte('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});
