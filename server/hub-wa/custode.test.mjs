import { describe, expect, it } from 'vitest';
import { creaCustode, VITA_MS } from './custode.mjs';

describe('custode delle chat (solo RAM)', () => {
  it('consegna una volta sola quello che ha ricevuto', () => {
    const c = creaCustode();
    expect(c.ritira()).toBeNull();
    c.deposita('{"personale":{}}');
    expect(c.pieno()).toBe(true);
    expect(c.ritira()).toBe('{"personale":{}}');
    expect(c.ritira()).toBeNull();
  });
  it('un deposito più vecchio di un giorno non si restituisce', () => {
    let t = 0;
    const c = creaCustode(() => t);
    c.deposita('x');
    t = VITA_MS + 1;
    expect(c.ritira()).toBeNull();
  });
  it('l’ultimo deposito vince', () => {
    const c = creaCustode();
    c.deposita('a');
    c.deposita('b');
    expect(c.ritira()).toBe('b');
  });
});
