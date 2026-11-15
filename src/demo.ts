// Modalità dimostrazione: risposte finte, nessuna chiamata al ponte.
import type { AzioneScrivi } from './ai';
import type { ProfiloId } from './store';

const attesa = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, ko) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      ko(new DOMException('Annullato', 'AbortError'));
    });
  });

export async function demoRispondi(profilo: ProfiloId, intenzione: string, signal?: AbortSignal): Promise<string[]> {
  await attesa(700, signal);
  const ora = (intenzione.match(/\b(\d{1,2}(?:[:.]\d{2})?)\b/) || [])[1];
  const extra = ora ? ` Va bene alle ${ora}.` : '';
  if (profilo === 'business')
    return [
      `Buonasera, grazie del messaggio. Le confermo volentieri.${extra} Cordiali saluti.`,
      'Gentile cliente, ho ricevuto la sua richiesta: verifico e le rispondo entro oggi.',
      'Grazie per avermi scritto. Possiamo sentirci al telefono per definire i dettagli?',
    ];
  return [`Certo, volentieri!${extra} 😊`, 'Ciao! Sì, per me va benissimo, ci sentiamo dopo.', 'Grazie del messaggio! Ti faccio sapere a breve.'];
}

export async function demoScrivi(testo: string, azione: AzioneScrivi, signal?: AbortSignal): Promise<string> {
  await attesa(500, signal);
  const t = testo.trim();
  switch (azione) {
    case 'correggi':
      return t.charAt(0).toUpperCase() + t.slice(1).replace(/\s+/g, ' ').replace(/([^.!?])$/, '$1.');
    case 'gentile':
      return `Ciao! ${t} Grazie mille 😊`;
    case 'formale':
      return `Buongiorno, ${t.charAt(0).toLowerCase() + t.slice(1)} Cordiali saluti`;
    case 'breve':
      return t.split(/[.!?]/)[0].trim() + '.';
    case 'chiaro':
      return t.replace(/\s+/g, ' ');
    case 'traduci':
      return `[Traduzione dimostrativa] ${t}`;
    case 'elenco':
      return t
        .split(/[.,;\n]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => `• ${x}`)
        .join('\n');
  }
}
