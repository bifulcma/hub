// Controlla che lo script della pagina /collega sia JavaScript valido.
// Il 15/11/2026 un apice escapato dentro il template literal rompeva lo script e la pagina restava bianca.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sorgente = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');

function paginaCollega() {
  const inizio = sorgente.indexOf('const PAGINA_COLLEGA = () => `');
  expect(inizio).toBeGreaterThan(-1);
  const fine = sorgente.indexOf('</html>`;', inizio);
  const letterale = sorgente.slice(inizio + 'const PAGINA_COLLEGA = () => '.length, fine + '</html>`'.length);
  // Valuta il template literal come fa Node (senza ${...} dentro, quindi è sicuro).
  expect(letterale.includes('${')).toBe(false);
  return new Function('return ' + letterale)();
}

describe('pagina /collega di hub-wa', () => {
  it('ha uno script JavaScript valido', () => {
    const html = paginaCollega();
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    expect(() => new Function(script)).not.toThrow();
  });
  it('usa percorsi assoluti e riprova dopo un errore', () => {
    const html = paginaCollega();
    expect(html).toContain("fetch('/collega/stato'");
    expect(html).toContain("'/collega/qr.png?'");
    expect(html).toContain('catch(e)');
    expect(html).toContain('id=copia');
    expect(html).toContain('navigator.clipboard.writeText(linkAttuale)');
  });
});
