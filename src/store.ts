// Dati di HUB: tutto sul dispositivo (localStorage). Nessun server.

export type ProfiloId = 'personale' | 'business';
export type Lingua = 'it' | 'de' | 'fr' | 'es' | 'en';

export interface Profilo {
  id: ProfiloId;
  nome: string;
  tono: string;
  firma: string;
  lingua: Lingua;
  app: string; // app WhatsApp da scegliere nel foglio Condividi
}

export interface Pronto {
  id: string;
  testo: string;
  preferito: boolean;
}

export interface Impostazioni {
  ponte: string;
  token: string;
}

export interface Stato {
  attivo: ProfiloId;
  profili: Record<ProfiloId, Profilo>;
  pronti: Record<ProfiloId, Pronto[]>;
  impostazioni: Impostazioni;
}

export const PONTE_PREDEFINITO = 'https://mac-studio-di-marco.tail623d1f.ts.net:8443';
const CHIAVE = 'hub.stato.v1';

let contatore = 0;
export function nuovoId(): string {
  contatore += 1;
  return Date.now().toString(36) + '-' + contatore.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

const pronto = (testo: string): Pronto => ({ id: nuovoId(), testo, preferito: false });

export function statoIniziale(): Stato {
  return {
    attivo: 'personale',
    profili: {
      personale: { id: 'personale', nome: 'Personale', tono: 'amichevole e naturale', firma: '', lingua: 'it', app: 'WhatsApp' },
      business: { id: 'business', nome: 'Business', tono: 'cortese e professionale, dando del Lei', firma: '', lingua: 'it', app: 'WhatsApp Business' },
    },
    pronti: {
      personale: [
        'Arrivo tra 10 minuti',
        'Ti richiamo appena posso',
        'Grazie mille, gentilissimo!',
        'Buon compleanno! Un abbraccio',
        'Ci vediamo domani?',
        'Ok, perfetto',
      ].map(pronto),
      business: [
        'Buongiorno, grazie per il messaggio: le rispondo entro oggi.',
        'Ricevuto, verifico e le faccio sapere.',
        'Le invio i dettagli via email.',
        'Possiamo sentirci al telefono? Mi indichi un orario.',
        'Grazie, a presto. Cordiali saluti',
        'Al momento non sono disponibile, la ricontatto appena possibile.',
      ].map(pronto),
    },
    impostazioni: { ponte: PONTE_PREDEFINITO, token: '' },
  };
}

function memoria(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Unisce dati salvati (anche vecchi o parziali) con i valori predefiniti. */
export function normalizza(raw: unknown): Stato {
  const base = statoIniziale();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Stato>;
  const ids: ProfiloId[] = ['personale', 'business'];
  const out: Stato = {
    attivo: r.attivo === 'business' ? 'business' : 'personale',
    profili: { ...base.profili },
    pronti: { ...base.pronti },
    impostazioni: { ...base.impostazioni, ...(r.impostazioni || {}) },
  };
  for (const id of ids) {
    if (r.profili?.[id]) out.profili[id] = { ...base.profili[id], ...r.profili[id], id };
    const lista = r.pronti?.[id];
    if (Array.isArray(lista)) {
      out.pronti[id] = lista
        .filter((p) => p && typeof p.testo === 'string' && p.testo.trim())
        .map((p) => ({ id: p.id || nuovoId(), testo: p.testo, preferito: !!p.preferito }));
    }
  }
  return out;
}

export function carica(): Stato {
  const m = memoria();
  if (!m) return statoIniziale();
  try {
    const s = m.getItem(CHIAVE);
    return s ? normalizza(JSON.parse(s)) : statoIniziale();
  } catch {
    return statoIniziale();
  }
}

export function salva(s: Stato): void {
  const m = memoria();
  if (!m) return;
  try {
    m.setItem(CHIAVE, JSON.stringify(s));
  } catch {
    /* memoria piena: si ignora */
  }
}

/** Esporta profili e messaggi pronti. Il token NON esce mai. */
export function esporta(s: Stato): string {
  return JSON.stringify(
    { app: 'HUB', versione: 1, attivo: s.attivo, profili: s.profili, pronti: s.pronti, impostazioni: { ponte: s.impostazioni.ponte } },
    null,
    2,
  );
}

/** Importa un file esportato, tenendo il token attuale. */
export function importa(testo: string, attuale: Stato): Stato {
  const dati = JSON.parse(testo);
  if (!dati || typeof dati !== 'object' || !dati.pronti) throw new Error('Questo file non sembra un salvataggio di HUB.');
  const nuovo = normalizza({ ...dati, impostazioni: { ponte: dati.impostazioni?.ponte || attuale.impostazioni.ponte } });
  nuovo.impostazioni.token = attuale.impostazioni.token;
  return nuovo;
}

/** Preferiti in cima, poi l'ordine di inserimento; filtro per testo. */
export function ordinaPronti(lista: Pronto[], cerca = ''): Pronto[] {
  const q = cerca.trim().toLowerCase();
  const f = q ? lista.filter((p) => p.testo.toLowerCase().includes(q)) : lista;
  return [...f.filter((p) => p.preferito), ...f.filter((p) => !p.preferito)];
}
