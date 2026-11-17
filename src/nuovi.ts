// Messaggi nuovi: calcolati SOLO su questo dispositivo (localStorage), senza dire niente a WhatsApp.
// «Nuovo» = l'ultimo messaggio della chat è di un'altra persona ed è arrivato dopo l'ultima volta che hai aperto
// quella chat in HUB. Al primo avvio vale come «già visto» tutto quello che c'è (niente 150 pallini).
// I messaggi letti sul telefono qui restano «nuovi» finché non apri la chat in HUB, oppure finché non rispondi.
import type { ChatBreve, Linea } from './wa';

const CHIAVE = 'hub-visti-v1';

export interface Visti {
  /** linea -> momento da cui si conta (prima volta che HUB ha visto la lista) */
  inizio: Partial<Record<Linea, number>>;
  /** "linea|jid" -> ts dell'ultimo messaggio visto */
  chat: Record<string, number>;
}

const memoria = (): Storage | null => (typeof localStorage !== 'undefined' ? localStorage : null);

export function caricaVisti(): Visti {
  try {
    const d = JSON.parse(memoria()?.getItem(CHIAVE) || '{}');
    return { inizio: d.inizio && typeof d.inizio === 'object' ? d.inizio : {}, chat: d.chat && typeof d.chat === 'object' ? d.chat : {} };
  } catch {
    return { inizio: {}, chat: {} };
  }
}

export function salvaVisti(v: Visti): void {
  // tiene al massimo 400 chat (le più recenti)
  const voci = Object.entries(v.chat).sort((a, b) => b[1] - a[1]).slice(0, 400);
  memoria()?.setItem(CHIAVE, JSON.stringify({ inizio: v.inizio, chat: Object.fromEntries(voci) }));
}

/** Alla prima lista di una linea fissa il punto di partenza: quello che c'è già non conta come nuovo. */
export function conInizio(v: Visti, linea: Linea, lista: ChatBreve[], ora = Date.now()): Visti {
  if (v.inizio[linea]) return v;
  const piuRecente = lista.reduce((m, c) => Math.max(m, c.ts), 0);
  return { ...v, inizio: { ...v.inizio, [linea]: Math.max(ora, piuRecente) } };
}

export function nuovo(v: Visti, linea: Linea, c: ChatBreve): boolean {
  if (c.daMe || !c.ts) return false;
  const visto = v.chat[linea + '|' + c.jid] ?? v.inizio[linea] ?? Infinity;
  return c.ts > visto;
}

export const quantiNuovi = (v: Visti, linea: Linea, lista: ChatBreve[]) => lista.filter((c) => nuovo(v, linea, c)).length;

export function segnaVisto(v: Visti, linea: Linea, jid: string, ts: number): Visti {
  const k = linea + '|' + jid;
  if ((v.chat[k] || 0) >= ts) return v;
  return { ...v, chat: { ...v.chat, [k]: ts } };
}
