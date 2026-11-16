// hub-wa — WhatsApp per HUB (dispositivo collegato a parte da Hermes): numero Personale e, su scelta di Marco, Business.
// Tiene in MEMORIA (mai su disco) gli ultimi messaggi delle chat singole, propone risposte con
// Nemotron LOCALE sul Mac Studio (Ollama) e manda un messaggio SOLO quando Marco tocca «Invia» in HUB.
// Ascolta su 127.0.0.1; fuori casa si raggiunge solo via Tailscale Serve (https, tailnet).
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { creaMemoria } from './memoria.mjs';
import { LINEE, dopoChiusura, lineaDa, motivoBlocco } from './linee.mjs';

const BASE = path.join(os.homedir(), '.hermes', 'hub-wa');
const TOKEN_FILE = path.join(BASE, 'token');
const LOG = path.join(BASE, 'hub-wa.log');
const PORT = Number(process.env.HUB_WA_PORT || 8791);
const ORIGINE = 'https://bifulcma.github.io';
const URL_PUBBLICO = process.env.HUB_WA_URL || 'https://mac-mini-von-marco.tail623d1f.ts.net:8445';
const OLLAMA = process.env.HUB_WA_OLLAMA || 'http://100.87.233.111:11434';
const MODELLO = process.env.HUB_WA_MODEL || 'nemotron35:latest';

mkdirSync(BASE, { recursive: true, mode: 0o700 });

// Un errore di rete in uno scaricamento (es. storico da WhatsApp) non deve far cadere tutto il servizio:
// le chat stanno solo in RAM e si perderebbero. Lo scriviamo nel registro e andiamo avanti.
// Solo «porta già occupata» chiude davvero (c'è già un altro hub-wa acceso).
process.on('uncaughtException', (e) => {
  try { appendFileSync(path.join(BASE, 'hub-wa.log'), new Date().toISOString() + ' errore non gestito, continuo: ' + (e?.code || '') + ' ' + (e?.message || e) + '\n'); } catch {}
  if (e?.code === 'EADDRINUSE') process.exit(1);
});
process.on('unhandledRejection', (e) => {
  try { appendFileSync(path.join(BASE, 'hub-wa.log'), new Date().toISOString() + ' promessa rifiutata, continuo: ' + (e?.message || e) + '\n'); } catch {}
});
if (!existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, randomBytes(24).toString('hex'), { mode: 0o600 });
const TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim();

const log = (s) => {
  try { appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`); } catch {}
};

// ------------------------------------------------------------------ WhatsApp: una «linea» per numero
// Ogni linea ha la sua sessione, il suo QR, la sua memoria (solo RAM) e le sue regole (linee.mjs).
const linee = {};
for (const L of Object.values(LINEE)) {
  linee[L.id] = { ...L, session: path.join(BASE, L.cartella), sock: null, stato: 'spento', qr: '', numero: '', ultimoInvio: 0, spegnendo: false, mem: creaMemoria(), giaChiesti: new Set() };
}
// avvio | qr | collegato | scollegato | uscito | spento

async function versione() {
  try {
    const r = await Promise.race([fetchLatestBaileysVersion(), new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), 10000))]);
    return r.version;
  } catch {
    return undefined;
  }
}

async function avvia(L) {
  L.spegnendo = false;
  L.stato = 'avvio';
  const { state, saveCreds } = await useMultiFileAuthState(L.session);
  const version = await versione();
  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['HUB', 'Safari', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => ({ conversation: '' }),
  });
  L.sock = sock;
  const { imparaLid, imparaDaContatto } = L.mem;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (L.sock !== sock) return; // socket vecchio
    if (u.qr) {
      L.qr = u.qr;
      L.stato = 'qr';
    }
    if (u.connection === 'open') {
      L.stato = 'collegato';
      L.qr = '';
      L.numero = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
      log('collegato ' + L.id);
      // I nomi della rubrica WhatsApp li manda solo al primo collegamento: dopo un riavvio del servizio
      // (memoria solo RAM) li chiediamo di nuovo, una volta per avvio, come fa WhatsApp Web.
      setTimeout(() => {
        if (L.sock !== sock || L.rubricaChiesta || L.mem.nomiInRubrica() > 0) return;
        L.rubricaChiesta = true;
        log('rubrica vuota ' + L.id + ': la chiedo a WhatsApp');
        Promise.resolve(sock.resyncAppState?.(['critical_unblock_low'], true))
          .then(() => log('rubrica ' + L.id + ': ' + L.mem.nomiInRubrica() + ' nomi'))
          .catch((e) => log('rubrica ' + L.id + ' non riuscita: ' + (e?.message || e)));
      }, 20000);
    }
    if (u.connection === 'close') {
      const motivo = new Boom(u.lastDisconnect?.error)?.output?.statusCode;
      const cosa = dopoChiusura({ linea: L.id, motivo, spegnendo: L.spegnendo, haCredenziali: !!state.creds.me });
      log('chiuso ' + L.id + ' (' + motivo + ') → ' + cosa);
      if (cosa === 'spento') {
        L.stato = 'spento';
        L.qr = '';
        return;
      }
      if (cosa === 'uscito') {
        L.stato = 'uscito';
        return; // niente riprova a vuoto: si ricollega dalla pagina /collega
      }
      L.stato = 'scollegato';
      setTimeout(() => avvia(L).catch((e) => log('avvio fallito ' + L.id + ' ' + e.message)), motivo === 515 ? 1000 : 5000);
    }
  });
  sock.ev.on('messaging-history.set', ({ chats: cs = [], contacts = [], messages = [] }) => {
    for (const k of contacts) imparaDaContatto(k);
    for (const m of messages) ricordaERisolvi(L, m);
    for (const ch of cs) if (ch.name && !String(ch.id).endsWith('@g.us')) imparaDaContatto({ id: ch.id, notify: ch.name });
  });
  sock.ev.on('contacts.upsert', (cs) => { for (const k of cs) imparaDaContatto(k); });
  sock.ev.on('contacts.update', (cs) => { for (const k of cs) imparaDaContatto(k); });
  sock.ev.on('lid-mapping.update', (x) => {
    for (const { lid, pn } of Array.isArray(x) ? x : [x]) imparaLid(lid, pn);
  });
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) ricordaERisolvi(L, m);
  });
}

// Se una chat resta col codice nascosto, chiediamo a Baileys il numero (solo in RAM).
function ricordaERisolvi(L, m) {
  const jid = L.mem.ricorda(m);
  if (!jid.endsWith('@lid') || L.giaChiesti.has(jid)) return;
  L.giaChiesti.add(jid);
  const mappa = L.sock?.signalRepository?.lidMapping;
  if (!mappa?.getPNForLID) return;
  Promise.resolve(mappa.getPNForLID(jid))
    .then((pn) => { if (pn) L.mem.imparaLid(jid, pn); })
    .catch(() => {});
}

/** Scollega davvero (anche dalla lista «Dispositivi collegati» del telefono) e cancella la sessione. */
async function scollega(L) {
  L.spegnendo = true;
  try { await L.sock?.logout(); } catch {}
  try { L.sock?.end?.(undefined); } catch {}
  L.sock = null;
  try { rmSync(L.session, { recursive: true, force: true }); } catch {}
  L.stato = 'spento';
  L.qr = '';
  L.numero = '';
  L.mem.svuota();
  L.giaChiesti.clear();
  log('scollegato ' + L.id + ' da HUB');
}

// ------------------------------------------------------------------ IA locale (Nemotron sul Mac Studio)
async function chiediIA(system, prompt, json) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 120000);
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal: c.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELLO,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        options: { temperature: 0.6 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error('Nemotron sullo Studio ha risposto ' + r.status);
    const d = await r.json();
    return (d.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Nemotron ci mette troppo: riprova.');
    throw new Error(/fetch failed|ECONN|EHOST/i.test(e.message) ? 'Non raggiungo il Mac Studio: è acceso?' : e.message);
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------------------------ HTTP
function autorizzato(req) {
  const h = String(req.headers.authorization || '');
  const t = Buffer.from(h.startsWith('Bearer ') ? h.slice(7).trim() : '');
  const k = Buffer.from(TOKEN);
  return t.length === k.length && timingSafeEqual(t, k);
}

function invia(res, code, dati, tipo = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': tipo,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ORIGINE,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
  res.end(typeof dati === 'string' || Buffer.isBuffer(dati) ? dati : JSON.stringify(dati));
}

function corpo(req) {
  return new Promise((ok, ko) => {
    let s = '';
    req.on('data', (d) => {
      s += d;
      if (s.length > 200000) {
        ko(new Error('troppo grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { ok(s ? JSON.parse(s) : {}); } catch { ko(new Error('JSON non valido')); }
    });
  });
}


const PAGINA_COLLEGA = () => `<!doctype html><html lang=it><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>HUB — collega WhatsApp</title><style>body{font-family:-apple-system,sans-serif;background:#faf7f2;color:#2b2723;text-align:center;padding:24px;max-width:560px;margin:auto}
img{width:min(80vw,400px);background:#fff;padding:12px;border-radius:12px}a.b{display:inline-block;background:#c96442;color:#fff;border-radius:12px;padding:14px 22px;font-size:19px;text-decoration:none;margin-top:12px}.av{background:#f3e3c3;border-radius:12px;padding:12px;font-size:15px}nav a{margin:0 8px;color:#2b2723}</style>
<h1 id=titolo>HUB ↔ WhatsApp</h1><nav><a href="/collega">Personale</a> · <a href="/collega?linea=business">Business</a></nav><div id=c><p>Carico…</p></div>
<script>
// Attenzione: questo testo sta dentro un template literal di Node: niente apici escapati, niente dollaro-graffa, usa addEventListener.
// Percorsi assoluti, niente cache, e la pagina riprova sempre: un errore di rete non la lascia bianca.
const LINEA=new URLSearchParams(location.search).get('linea')==='business'?'business':'personale';
const Q='?linea='+LINEA;
const BIZ=LINEA==='business';
const APP=BIZ?'<b>WhatsApp Business</b> (l’app con la «B»)':'<b>WhatsApp</b> (l’app verde normale, non Business)';
document.getElementById('titolo').textContent='HUB ↔ WhatsApp '+(BIZ?'Business':'Personale');
let ultimo='';
function mostra(chiave,html){if(chiave!==ultimo){ultimo=chiave;document.getElementById('c').innerHTML=html}}
function nuovoQr(){const i=document.getElementById('qr');if(!i)return;const n=new Image();n.onload=()=>{i.src=n.src};n.src='/collega/qr.png'+Q+'&t='+Date.now()}
let linkAttuale='';
document.addEventListener('click',(e)=>{const id=e.target&&e.target.id;
if(id==='nuovo'){e.preventDefault();ultimo='';mostra('attesa','<p>Preparo il QR…</p>');fetch('/collega/nuovo'+Q,{method:'POST'})}
if(id==='copia'){e.preventDefault();const f=()=>{const t=document.getElementById('testo');t.style.display='block';t.value=linkAttuale;t.select();document.getElementById('esito').textContent='Tieni premuto sul testo e scegli Copia.'};
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(linkAttuale).then(()=>{document.getElementById('esito').textContent='✅ Link copiato. Ora apri HUB dall’icona → Impostazioni → «Incolla link».'},f)}else f()}});
const AVVISO_BIZ='<p class=av>Il Business usa un collegamento non ufficiale: WhatsApp potrebbe bloccare il numero. Marco ha scelto di accettare il rischio. HUB invia solo quando tocchi «Sì, invia», solo a chi ti ha già scritto, con almeno 15 secondi tra un invio e l’altro.</p>';
async function giro(){
try{const x=await fetch('/collega/stato'+Q,{cache:'no-store'});if(!x.ok)throw new Error('HTTP '+x.status);const r=await x.json();
if(r.stato==='qr'){mostra('qr',(BIZ?AVVISO_BIZ:'')+'<p>Sul telefono apri '+APP+' → Impostazioni → <b>Dispositivi collegati</b> → <b>Collega un dispositivo</b>, poi inquadra:</p><img id=qr alt="QR">');nuovoQr()}
else if(r.stato==='collegato'){linkAttuale=r.link;mostra('ok'+r.numero,'<p>✅ WhatsApp '+(BIZ?'Business':'Personale')+' collegato a HUB ('+r.numero+').</p>'+(BIZ?'<p>Apri HUB, scegli <b>Business</b> in alto e vai su <b>Chat</b>. Per staccarlo: HUB → Impostazioni → «Scollega Business».</p>':'<p>Ultimo passo, sul dispositivo dove userai HUB (iPad o iPhone).</p><p><b>Se apri HUB dall’icona sulla schermata Home</b>: tocca «Copia link», poi in HUB → Impostazioni → «Incolla link».</p><a class=b id=copia href="#">Copia link</a><p id=esito></p><textarea id=testo readonly style="display:none;width:100%;height:90px;font-size:16px"></textarea><p>Se invece usi HUB nel browser:</p><a class=b href="'+r.link+'">Apri HUB e collega</a><p style="font-size:14px;color:#6b6259">Il link contiene la password: non mandarlo a nessuno.</p>'))}
else if(r.stato==='uscito'){mostra('uscito','<p>WhatsApp ha scollegato HUB.</p><a class=b id=nuovo href="#">Nuovo QR</a>')}
else if(r.stato==='spento'){mostra('spento',(BIZ?AVVISO_BIZ:'')+'<p>WhatsApp '+(BIZ?'Business':'Personale')+' non è collegato a HUB.</p><a class=b id=nuovo href="#">Mostra il QR</a>')}
else mostra('st'+r.stato,'<p>Attendo WhatsApp… ('+r.stato+')</p>')}
catch(e){mostra('err','<p>Non riesco a raggiungere il Mac mini. Controlla che Tailscale sia acceso: riprovo da solo…</p>')}
setTimeout(giro,2500)}
giro();
</script></html>`;

const linkHub = () => `${ORIGINE}/hub/#/impostazioni?wa=${encodeURIComponent(URL_PUBBLICO)}&watoken=${TOKEN}`;
const sintesi = (L) => ({ stato: L.stato, numero: L.numero ? '+' + L.numero : '' });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const L = linee[lineaDa(url.searchParams.get('linea'))];
  try {
    if (req.method === 'OPTIONS') return invia(res, 204, '');
    // Pagina di collegamento: raggiungibile solo dalla rete Tailscale (Serve) o dal Mini.
    if (p === '/collega') return invia(res, 200, PAGINA_COLLEGA(), 'text/html; charset=utf-8');
    if (p === '/collega/stato') return invia(res, 200, { ...sintesi(L), link: L.stato === 'collegato' ? linkHub() : '' });
    if (p === '/collega/qr.png') {
      if (L.stato !== 'qr' || !L.qr) return invia(res, 404, '');
      return invia(res, 200, await QRCode.toBuffer(L.qr, { width: 420, margin: 1 }), 'image/png');
    }
    if (p === '/collega/nuovo' && req.method === 'POST') {
      if (L.stato === 'uscito' || L.stato === 'spento') {
        if (L.stato === 'uscito') try { renameSync(L.session, L.session + '.uscita-' + Date.now()); } catch {}
        avvia(L).catch((e) => log('avvio ' + L.id + ' ' + e.message));
      }
      return invia(res, 200, { ok: true });
    }

    if (!autorizzato(req)) return invia(res, 401, { error: 'token' });

    if (p === '/health')
      return invia(res, 200, { ok: true, ...sintesi(L), modello: MODELLO, linee: Object.fromEntries(Object.values(linee).map((x) => [x.id, sintesi(x)])) });
    if (p === '/chats') {
      const lista = [...L.mem.chats.values()]
        .sort((a, b) => b.ts - a.ts)
        .map((c) => {
          const u = c.messaggi[c.messaggi.length - 1];
          return { jid: c.jid, nome: L.mem.nomeDi(c), ultimo: u?.testo.slice(0, 120) || '', daMe: !!u?.daMe, ts: c.ts };
        });
      return invia(res, 200, { stato: L.stato, chats: lista });
    }
    if (p === '/chat') {
      const c = L.mem.chats.get(L.mem.jidChat(url.searchParams.get('jid') || ''));
      if (!c) return invia(res, 404, { error: 'Chat non trovata (forse è vecchia: arriverà col prossimo messaggio).' });
      return invia(res, 200, { jid: c.jid, nome: L.mem.nomeDi(c), messaggi: c.messaggi });
    }
    if (p === '/ai' && req.method === 'POST') {
      const b = await corpo(req);
      if (typeof b.system !== 'string' || typeof b.prompt !== 'string') return invia(res, 400, { error: 'system e prompt' });
      const testo = await chiediIA(b.system.slice(0, 8000), b.prompt.slice(0, 30000), !!b.json);
      return invia(res, 200, { testo });
    }
    if (p === '/send' && req.method === 'POST') {
      const b = await corpo(req);
      const Ls = linee[lineaDa(b.linea || url.searchParams.get('linea'))];
      const c = Ls.mem.chats.get(Ls.mem.jidChat(b.jid || ''));
      const no = motivoBlocco({ linea: Ls.id, chat: c, testo: b.testo, stato: Ls.sock ? Ls.stato : 'spento', ultimoInvio: Ls.ultimoInvio, ora: Date.now() });
      if (no) return invia(res, no.codice, { error: no.errore });
      Ls.ultimoInvio = Date.now();
      const sent = await Ls.sock.sendMessage(c.jid, { text: String(b.testo).trim() });
      if (sent) ricordaERisolvi(Ls, sent);
      log('inviato 1 messaggio ' + Ls.id); // niente contenuto né destinatario nel registro
      return invia(res, 200, { ok: true });
    }
    if (p === '/scollega' && req.method === 'POST') {
      await scollega(L);
      return invia(res, 200, { ok: true, ...sintesi(L) });
    }
    return invia(res, 404, { error: 'boh' });
  } catch (e) {
    log('errore ' + (e?.message || e));
    return invia(res, 500, { error: e?.message || 'errore' });
  }
});

server.listen(PORT, '127.0.0.1', () => log(`in ascolto su 127.0.0.1:${PORT}`));
// Personale sempre; Business solo se era già collegato (niente QR a vuoto).
for (const L of Object.values(linee)) {
  if (L.avvioSempre || existsSync(path.join(L.session, 'creds.json'))) avvia(L).catch((e) => log('avvio fallito ' + L.id + ' ' + e.message));
}
