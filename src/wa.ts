// Collegamento con hub-wa sul Mac mini: chat WhatsApp (solo Personale) e IA locale (Nemotron sul Mac Studio).
import { askBridge } from './ponte';
import { askConRiprova } from './ai';
import type { Impostazioni } from './store';

export interface ChatBreve {
  jid: string;
  nome: string;
  ultimo: string;
  daMe: boolean;
  ts: number;
}
export interface Messaggio {
  id: string;
  daMe: boolean;
  testo: string;
  ts: number;
}
export interface Conversazione {
  jid: string;
  nome: string;
  messaggi: Messaggio[];
}

export class WaErrore extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'WaErrore';
  }
}

const pulisci = (u: string) => u.trim().replace(/\/+$/, '');

export function waConfigurato(i: Impostazioni): boolean {
  return !!(i.waUrl && i.waUrl.trim() && i.waToken && i.waToken.trim());
}

async function chiama<T>(i: Impostazioni, percorso: string, opz: { metodo?: string; corpo?: unknown; signal?: AbortSignal; fetchFn?: typeof fetch } = {}): Promise<T> {
  const f = opz.fetchFn || fetch;
  let r: Response;
  try {
    r = await f(pulisci(i.waUrl || '') + percorso, {
      method: opz.metodo || 'GET',
      headers: { Authorization: 'Bearer ' + (i.waToken || '').trim(), ...(opz.corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: opz.corpo ? JSON.stringify(opz.corpo) : undefined,
      signal: opz.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new WaErrore('Non raggiungo il Mac mini: controlla che Tailscale sia acceso.');
  }
  let d: { error?: string } & Record<string, unknown> = {};
  try {
    d = await r.json();
  } catch {
    /* corpo vuoto */
  }
  if (!r.ok) {
    if (r.status === 401) throw new WaErrore('La password di WhatsApp sul Mini non è giusta: ricollega da Impostazioni.', 401);
    throw new WaErrore(String(d.error || 'Errore dal Mac mini (' + r.status + ')'), r.status);
  }
  return d as T;
}

export const waSalute = (i: Impostazioni, fetchFn?: typeof fetch) => chiama<{ ok: boolean; stato: string; numero: string; modello: string }>(i, '/health', { fetchFn });
export const waChats = (i: Impostazioni, signal?: AbortSignal, fetchFn?: typeof fetch) => chiama<{ stato: string; chats: ChatBreve[] }>(i, '/chats', { signal, fetchFn });
export const waChat = (i: Impostazioni, jid: string, signal?: AbortSignal, fetchFn?: typeof fetch) =>
  chiama<Conversazione>(i, '/chat?jid=' + encodeURIComponent(jid), { signal, fetchFn });
export const waInvia = (i: Impostazioni, jid: string, testo: string, fetchFn?: typeof fetch) =>
  chiama<{ ok: boolean }>(i, '/send', { metodo: 'POST', corpo: { jid, testo }, fetchFn });

/** Chiede all'IA scelta: Nemotron locale (via Mini) oppure Claude (via ponte dello Studio). */
export async function chiediIA(
  i: Impostazioni,
  o: { system: string; prompt: string; json?: boolean; signal?: AbortSignal },
  fetchFn?: typeof fetch,
): Promise<string> {
  if (usaNemotron(i)) {
    const r = await chiama<{ testo: string }>(i, '/ai', { metodo: 'POST', corpo: { system: o.system, prompt: o.prompt, json: !!o.json }, signal: o.signal, fetchFn });
    return r.testo || '';
  }
  return askConRiprova({ bridgeUrl: i.ponte, token: i.token, provider: 'claude', system: o.system, prompt: o.prompt, signal: o.signal, fetchFn }, askBridge);
}

export function usaNemotron(i: Impostazioni): boolean {
  return (i.ia || 'nemotron') === 'nemotron' && waConfigurato(i);
}

export function nomeIA(i: Impostazioni): string {
  return usaNemotron(i) ? 'Nemotron (locale, privato)' : 'Claude';
}

/** IA disponibile? (altrimenti modalità prova) */
export function iaPronta(i: Impostazioni): boolean {
  return usaNemotron(i) || !!i.token.trim();
}

/** Ultimi messaggi come contesto per la proposta di risposta. */
export function contesto(c: Conversazione, n = 12): string {
  return c.messaggi
    .slice(-n)
    .map((m) => `${m.daMe ? 'Marco' : c.nome}: ${m.testo}`)
    .join('\n');
}

/** Dall'indirizzo #/impostazioni?wa=…&watoken=… (link della pagina «collega» sul Mini). */
export function leggiCollegamento(hash: string): { waUrl: string; waToken: string } | null {
  const q = new URLSearchParams(hash.split('?')[1] || '');
  const u = q.get('wa');
  const t = q.get('watoken');
  if (!u || !t) return null;
  try {
    if (new URL(u).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { waUrl: u, waToken: t };
}

/** Link incollato a mano (icona sulla schermata Home: memoria separata dal browser). */
export function leggiCollegamentoDaTesto(testo: string): { waUrl: string; waToken: string } | null {
  const t = testo.trim();
  const i = t.indexOf('#');
  return leggiCollegamento(i >= 0 ? t.slice(i) : t.includes('?') ? t : '?' + t);
}
