import { describe, expect, it, vi } from 'vitest';
import { askConRiprova, leggiRisposte, promptRispondi, promptScrivi, pulisciTesto, erroreSemplice } from './ai';
import { condividi, copia } from './invio';
import { esporta, importa, normalizza, ordinaPronti, statoIniziale } from './store';
import { BridgeError, provaPonte } from './ponte';

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

describe('askConRiprova', () => {
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

describe('provaPonte', () => {
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
