// Icona di ogni persona nella lista Chat: colore fisso ricavato dal numero (non cambia se cambia il nome)
// e due iniziali. Chi non ha nome (solo numero) ha un'icona neutra con una sagoma.
// Colori tenui in armonia con crema/terracotta, tutti con testo bianco leggibile (contrasto ≥ 4,5:1).

export const COLORI_AVATAR = ['#9a5a3f', '#4f7a57', '#4a6a8c', '#76598c', '#8a6a2e', '#2f7a74', '#a04a5c', '#5a6270', '#66783a', '#86566e', '#3d6f9e', '#a0603a'];
export const COLORE_SENZA_NOME = '#8c847a';

/** Hash semplice e stabile (FNV-1a) del testo. */
function hash(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const senzaNome = (nome: string) => !nome.trim() || /^[+\d]/.test(nome.trim()) || nome.trim() === 'Contatto senza nome';

/** Iniziali: «Paolo Bifulco» → «PB», «martina» → «M». Emoji e simboli ignorati. */
export function iniziali(nome: string): string {
  const parole = nome
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!parole.length) return '?';
  return parole
    .slice(0, 2)
    .map((p) => [...p][0].toUpperCase())
    .join('');
}

export function avatar(nome: string, jid: string): { lettere: string; colore: string; anonimo: boolean } {
  if (senzaNome(nome)) return { lettere: '', colore: COLORE_SENZA_NOME, anonimo: true };
  return { lettere: iniziali(nome), colore: COLORI_AVATAR[hash(jid || nome) % COLORI_AVATAR.length], anonimo: false };
}
