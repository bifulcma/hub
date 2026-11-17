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
  gruppo?: boolean;
}
export interface Allegato {
  tipo: 'foto' | 'documento';
  mime: string;
  byte: number;
  nome: string;
  /** Indirizzo firmato sul Mini (valido 30 minuti); si scarica solo quando Marco lo tocca. */
  url?: string;
}
export interface Messaggio {
  id: string;
  daMe: boolean;
  testo: string;
  ts: number;
  allegato?: Allegato;
  /** Nei gruppi: chi ha scritto (nome in rubrica o su WhatsApp). */
  autore?: string;
}

/** Indirizzo completo di un allegato sul Mini, oppure '' se manca. */
export const indirizzoAllegato = (i: Impostazioni, a?: Allegato) => (a?.url && i.waUrl ? i.waUrl.trim().replace(/\/+$/, '') + a.url : '');

/** «120 KB», «1,4 MB». */
export function dimensione(byte: number): string {
  if (!byte) return '';
  if (byte < 1024 * 1024) return Math.max(1, Math.round(byte / 1024)) + ' KB';
  return (byte / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}
export interface Conversazione {
  jid: string;
  nome: string;
  messaggi: Messaggio[];
  gruppo?: boolean;
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
    throw new WaErrore('Non raggiungo il Mac mini. Controlla che Tailscale sia acceso. Se HUB è aperto dall’icona: Impostazioni → il tuo nome → iCloud → Relay privato spento.');
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

/** Quale numero: Personale o Business (collegato su scelta di Marco, con regole più prudenti sul Mini). */
export type Linea = 'personale' | 'business';
const conLinea = (percorso: string, linea: Linea = 'personale') =>
  linea === 'business' ? percorso + (percorso.includes('?') ? '&' : '?') + 'linea=business' : percorso;

export interface StatoLinea {
  stato: string;
  numero: string;
}
export const waSalute = (i: Impostazioni, linea: Linea = 'personale', fetchFn?: typeof fetch) =>
  chiama<{ ok: boolean; stato: string; numero: string; modello: string; linee?: Record<Linea, StatoLinea> }>(i, conLinea('/health', linea), { fetchFn });
export const waChats = (i: Impostazioni, linea: Linea = 'personale', signal?: AbortSignal, fetchFn?: typeof fetch) =>
  chiama<{ stato: string; chats: ChatBreve[] }>(i, conLinea('/chats', linea), { signal, fetchFn });
export const waChat = (i: Impostazioni, jid: string, linea: Linea = 'personale', signal?: AbortSignal, fetchFn?: typeof fetch) =>
  chiama<Conversazione>(i, conLinea('/chat?jid=' + encodeURIComponent(jid), linea), { signal, fetchFn });
export const waInvia = (i: Impostazioni, jid: string, testo: string, linea: Linea = 'personale', fetchFn?: typeof fetch) =>
  chiama<{ ok: boolean }>(i, '/send', { metodo: 'POST', corpo: { jid, testo, linea }, fetchFn });
/** Scollega davvero il numero dal Mini (sparisce anche da «Dispositivi collegati» sul telefono). */
export const waScollega = (i: Impostazioni, linea: Linea, fetchFn?: typeof fetch) =>
  chiama<{ ok: boolean; stato: string }>(i, conLinea('/scollega', linea), { metodo: 'POST', fetchFn });
/** Notifiche (Web Push via Apple): chiave pubblica del Mini e iscrizione di questo dispositivo. */
export interface PrefNotifiche {
  personale: boolean;
  business: boolean;
  gruppi: boolean;
}
export const waChiaveNotifiche = (i: Impostazioni, fetchFn?: typeof fetch) => chiama<{ publicKey: string }>(i, '/notifiche/chiave', { fetchFn });
export const waNotifiche = <T,>(i: Impostazioni, azione: 'iscrivi' | 'disiscrivi' | 'stato' | 'prova', corpo: unknown, fetchFn?: typeof fetch) =>
  chiama<T>(i, '/notifiche/' + azione, { metodo: 'POST', corpo, fetchFn });
/** La chiave VAPID arriva in base64url: il browser la vuole in byte. */
export function chiaveInByte(b64: string): Uint8Array {
  const t = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Pagina del Mini con il QR per collegare un numero. */
export const paginaCollega = (i: Impostazioni, linea: Linea) => pulisci(i.waUrl || WA_MINI) + conLinea('/collega', linea);

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
    .map((m) => `${m.daMe ? 'Marco' : m.autore || c.nome}: ${m.testo}`)
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

/** Indirizzo di hub-wa sul Mac mini (raggiungibile solo con Tailscale acceso). */
export const WA_MINI = 'https://mac-mini-von-marco.tail623d1f.ts.net:8445';

/** Un tocco: chiede il collegamento direttamente al Mac mini (/collega/stato, aperto solo a HUB). */
export async function collegaDalMini(base = WA_MINI, f: typeof fetch = fetch): Promise<{ waUrl: string; waToken: string }> {
  let r: Response;
  try {
    r = await f(base.replace(/\/+$/, '') + '/collega/stato', { cache: 'no-store' });
  } catch {
    throw new WaErrore('Non raggiungo il Mac mini. Controlla che Tailscale sia acceso. Se HUB è aperto dall’icona: Impostazioni → il tuo nome → iCloud → Relay privato spento.');
  }
  if (!r.ok) throw new WaErrore('Il Mac mini risponde con un errore (' + r.status + ').', r.status);
  const d = (await r.json()) as { stato?: string; link?: string };
  if (d.stato === 'qr') throw new WaErrore('WhatsApp non è ancora collegato al Mac mini: serve inquadrare il QR (pagina «collega»).');
  if (d.stato !== 'collegato') throw new WaErrore('WhatsApp sul Mac mini non è pronto (' + (d.stato || '?') + '). Riprova tra poco.');
  const wa = leggiCollegamentoDaTesto(d.link || '');
  if (!wa) throw new WaErrore('Risposta del Mac mini non valida.');
  return wa;
}
