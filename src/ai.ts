// Chiamate a Claude tramite il ponte dello Studio, con prompt e lettura delle risposte.
import { askBridge } from './ponte';
import type { Profilo, Lingua } from './store';

export const SOLO_TESTO = '\nNon usare strumenti e non cercare file: rispondi subito, solo dal testo che ti do qui.';

export const NOMI_LINGUA: Record<Lingua, string> = {
  it: 'italiano',
  de: 'tedesco',
  fr: 'francese',
  es: 'spagnolo',
  en: 'inglese',
};

type Opzioni = Parameters<typeof askBridge>[0];

/** L'IA a volte torna senza risposta: si riprova una volta (non se annullato). */
export async function askConRiprova(o: Opzioni, ask: typeof askBridge = askBridge): Promise<string> {
  try {
    const r = await ask(o);
    if (r.trim()) return r;
  } catch (e) {
    if (o.signal?.aborted) throw e;
  }
  return await ask(o);
}

/** Estrae le risposte da un JSON anche sporco (```json, testo attorno). */
export function leggiRisposte(raw: string): string[] {
  const testo = (raw || '').replace(/```(?:json)?/gi, '').trim();
  const inizio = testo.indexOf('{');
  const fine = testo.lastIndexOf('}');
  if (inizio >= 0 && fine > inizio) {
    try {
      const dati = JSON.parse(testo.slice(inizio, fine + 1));
      const lista = Array.isArray(dati?.risposte) ? dati.risposte : [];
      const pulite = lista.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim());
      if (pulite.length) return pulite.slice(0, 3);
    } catch {
      /* si prova sotto */
    }
  }
  const a = testo.indexOf('[');
  const b = testo.lastIndexOf(']');
  if (a >= 0 && b > a) {
    try {
      const lista = JSON.parse(testo.slice(a, b + 1));
      if (Array.isArray(lista)) {
        const pulite = lista.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim());
        if (pulite.length) return pulite.slice(0, 3);
      }
    } catch {
      /* niente */
    }
  }
  throw new Error('Claude non ha dato risposte leggibili. Premi Riprova.');
}

export function promptRispondi(p: Profilo, ricevuto: string, intenzione: string) {
  const system =
    `Aiuti Marco a rispondere su WhatsApp (account ${p.nome}). ` +
    `Tono: ${p.tono}. Scrivi in ${NOMI_LINGUA[p.lingua]}, ma se il messaggio ricevuto è in un'altra lingua rispondi in quella lingua. ` +
    'Risposte brevi e naturali per WhatsApp, al massimo un emoji, senza inventare fatti, date o impegni che Marco non ha indicato. ' +
    'Rispondi SOLO con JSON: {"risposte":["...","...","..."]} con 3 alternative diverse.' +
    SOLO_TESTO;
  const prompt =
    `Messaggio ricevuto:\n"""\n${ricevuto.trim()}\n"""\n` +
    (intenzione.trim() ? `Cosa vuole rispondere Marco: ${intenzione.trim()}\n` : 'Marco non ha indicato cosa rispondere: proponi risposte prudenti.\n');
  return { system, prompt };
}

export type AzioneScrivi = 'correggi' | 'gentile' | 'formale' | 'breve' | 'chiaro' | 'traduci' | 'elenco';

export const AZIONI: { id: AzioneScrivi; etichetta: string }[] = [
  { id: 'correggi', etichetta: 'Correggi' },
  { id: 'gentile', etichetta: 'Più gentile' },
  { id: 'formale', etichetta: 'Più formale' },
  { id: 'breve', etichetta: 'Più breve' },
  { id: 'chiaro', etichetta: 'Più chiaro' },
  { id: 'traduci', etichetta: 'Traduci' },
  { id: 'elenco', etichetta: 'Elenco' },
];

const ISTRUZIONI: Record<AzioneScrivi, string> = {
  correggi: 'Correggi ortografia, grammatica e punteggiatura. Non cambiare il senso né lo stile.',
  gentile: 'Riscrivilo in modo più gentile e caloroso, senza esagerare.',
  formale: 'Riscrivilo in modo più formale e professionale.',
  breve: 'Accorcialo il più possibile tenendo tutte le informazioni importanti.',
  chiaro: 'Riscrivilo in modo più chiaro e ordinato, frasi semplici.',
  traduci: 'Traducilo',
  elenco: 'Trasformalo in un elenco puntato chiaro (righe che iniziano con •).',
};

export function promptScrivi(p: Profilo, testo: string, azione: AzioneScrivi, linguaTraduzione: Lingua = 'de') {
  const istruzione =
    azione === 'traduci' ? `Traducilo in ${NOMI_LINGUA[linguaTraduzione]}, con tono naturale per WhatsApp.` : ISTRUZIONI[azione];
  const system =
    `Sistemi un messaggio WhatsApp di Marco (account ${p.nome}, tono di base: ${p.tono}). ${istruzione} ` +
    'Rispondi SOLO con il testo finale, senza virgolette, titoli o spiegazioni.' +
    SOLO_TESTO;
  return { system, prompt: testo.trim() };
}

/** Toglie virgolette o blocchi di codice attorno a un testo. */
export function pulisciTesto(raw: string): string {
  let t = (raw || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  if (/^["«“].*["»”]$/s.test(t) && t.length > 2) t = t.slice(1, -1).trim();
  return t;
}

/** Messaggio d'errore semplice per Marco. */
export function erroreSemplice(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return 'Il token del ponte non è giusto: controllalo in Impostazioni.';
  if (/contattare|Load failed|Failed to fetch|NetworkError/i.test(m))
    return 'Non raggiungo il ponte: controlla che Tailscale sia acceso su questo dispositivo, poi Riprova.';
  return m || 'Qualcosa non ha funzionato. Riprova.';
}
