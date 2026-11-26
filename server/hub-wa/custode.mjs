// hub-wa — «custode» delle chat: un piccolo servizio sempre acceso sul Mac mini che tiene in RAM le chat
// mentre hub-wa si riavvia (aggiornamenti, cambi di configurazione fatti da chiunque).
// hub-wa, quando si spegne, gli consegna la memoria; quando riparte, se la riprende. MAI su disco.
// Ascolta solo su 127.0.0.1 (non è esposto in rete) e vuole la stessa password di hub-wa.
// Si perde tutto solo se si spegne o riavvia il Mac mini.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VITA_MS = 24 * 60 * 60 * 1000; // dopo un giorno il deposito non serve più: si butta

export function creaCustode(ora = () => Date.now()) {
  let deposito = null; // { dati: string, t }
  return {
    deposita(dati) {
      deposito = { dati: String(dati), t: ora() };
      return deposito.dati.length;
    },
    /** Restituisce il deposito (una volta sola) e lo cancella. */
    ritira() {
      const d = deposito;
      deposito = null;
      if (!d || ora() - d.t > VITA_MS) return null;
      return d.dati;
    },
    pieno: () => !!deposito,
  };
}

function avvia() {
  const BASE = path.join(os.homedir(), '.hermes', 'hub-wa');
  const TOKEN = readFileSync(path.join(BASE, 'token'), 'utf8').trim();
  const PORT = Number(process.env.HUB_WA_CUSTODE_PORT || 8792);
  const c = creaCustode();
  const ok = (req) => {
    const h = String(req.headers.authorization || '');
    const a = Buffer.from(h.startsWith('Bearer ') ? h.slice(7).trim() : '');
    const b = Buffer.from(TOKEN);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  http
    .createServer((req, res) => {
      if (!ok(req)) {
        res.writeHead(401).end();
        return;
      }
      if (req.method === 'POST' && req.url === '/deposita') {
        let s = '';
        req.on('data', (d) => {
          s += d;
          if (s.length > 300 * 1024 * 1024) req.destroy();
        });
        req.on('end', () => {
          const n = c.deposita(s);
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, caratteri: n }));
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/ritira') {
        const d = c.ritira();
        if (!d) {
          res.writeHead(204).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(d);
        return;
      }
      res.writeHead(404).end();
    })
    .listen(PORT, '127.0.0.1');
}

const avviatoDirettamente = () => {
  try {
    return realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (avviatoDirettamente()) avvia();
