// hub-wa — WhatsApp per HUB (dispositivo collegato a parte da Hermes): numero Personale e, su scelta di Marco, Business.
// Tiene in MEMORIA (mai su disco) gli ultimi messaggi delle chat singole, propone risposte con
// Nemotron LOCALE sul Mac Studio (Ollama) e manda un messaggio SOLO quando Marco tocca «Invia» in HUB.
// Ascolta su 127.0.0.1; fuori casa si raggiunge solo via Tailscale Serve (https, tailnet).
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, downloadMediaMessage, BufferJSON } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import http from 'node:http';
import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
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
        // Senza versione salvata WhatsApp rimanda la rubrica intera (istantanea), non solo le novità.
        Promise.resolve(state.keys.set({ 'app-state-sync-version': { critical_unblock_low: null } }))
          .then(() => sock.resyncAppState?.(['critical_unblock_low'], true))
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
    for (const ch of cs) {
      if (!ch.name) continue;
      if (String(ch.id).endsWith('@g.us')) L.mem.nomeGruppo(ch.id, ch.name);
      else imparaDaContatto({ id: ch.id, notify: ch.name });
    }
  });
  sock.ev.on('contacts.upsert', (cs) => { for (const k of cs) imparaDaContatto(k); log('contatti ricevuti ' + L.id + ': ' + cs.length + ' (con nome in rubrica ' + L.mem.nomiInRubrica() + ')'); });
  sock.ev.on('contacts.update', (cs) => { for (const k of cs) imparaDaContatto(k); });
  // Nomi dei gruppi: solo da quello che WhatsApp manda da sé (niente richieste in più).
  const nomiGruppi = (lista) => { for (const g of lista || []) L.mem.nomeGruppo(g.id, g.subject || g.name); };
  sock.ev.on('groups.upsert', nomiGruppi);
  sock.ev.on('groups.update', nomiGruppi);
  sock.ev.on('chats.upsert', nomiGruppi);
  sock.ev.on('chats.update', nomiGruppi);
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

function corpo(req, massimo = 200000) {
  return new Promise((ok, ko) => {
    let s = '';
    req.on('data', (d) => {
      s += d;
      if (s.length > massimo) {
        ko(new Error('troppo grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { ok(s ? JSON.parse(s, BufferJSON.reviver) : {}); } catch { ko(new Error('JSON non valido')); }
    });
  });
}


// ------------------------------------------------------------------ Allegati (foto, documenti) a richiesta
// Si scaricano da WhatsApp SOLO quando Marco li tocca in HUB (come WhatsApp Web), restano in RAM 10 minuti
// e mai su disco. Indirizzo firmato (HMAC con il token), valido almeno 30 minuti e solo per quell'allegato.
const MAX_ALLEGATO = 25 * 1024 * 1024;
const MAX_CACHE = 80 * 1024 * 1024;
const VITA_CACHE_MS = 10 * 60 * 1000;
const MAX_ALL_ORA = 40; // per linea: restare discreti
const cacheAllegati = new Map(); // linea|id -> { buf, mime, t }
const scaricatiOra = { personale: [], business: [] };

const firma = (linea, jid, id, e) => createHmac('sha256', TOKEN).update(`${linea}|${jid}|${id}|${e}`).digest('base64url').slice(0, 32);
function indirizzoAllegato(linea, jid, id) {
  const e = (Math.floor(Date.now() / 600000) + 4) * 600000; // stabile per 10 minuti, valido 30–40 minuti
  const q = new URLSearchParams({ l: linea, j: jid, i: id, e: String(e), s: firma(linea, jid, id, e) });
  return '/allegato?' + q.toString();
}
function firmaValida(q) {
  const l = q.get('l'), j = q.get('j') || '', i = q.get('i') || '', e = Number(q.get('e')), s = q.get('s') || '';
  if ((l !== 'personale' && l !== 'business') || !j || !i || !(e > Date.now())) return false;
  const a = Buffer.from(s), b = Buffer.from(firma(l, j, i, e));
  return a.length === b.length && timingSafeEqual(a, b);
}
function pulisciCache() {
  const ora = Date.now();
  let tot = 0;
  for (const [k, v] of [...cacheAllegati].sort((x, y) => y[1].t - x[1].t)) {
    if (ora - v.t > VITA_CACHE_MS || tot + v.buf.length > MAX_CACHE) cacheAllegati.delete(k);
    else tot += v.buf.length;
  }
}
async function scaricaAllegato(L, jid, id) {
  pulisciCache();
  const chiave = L.id + '|' + id;
  const c = cacheAllegati.get(chiave);
  if (c) return c;
  const m = L.mem.grezzo(jid, id);
  const info = L.mem.chats.get(L.mem.jidChat(jid))?.messaggi.find((x) => x.id === id)?.allegato;
  if (!m || !info) throw Object.assign(new Error('Allegato non più in memoria: guardalo sul telefono.'), { codice: 404 });
  if (info.byte > MAX_ALLEGATO) throw Object.assign(new Error('File troppo grande per HUB (più di 25 MB): aprilo sul telefono.'), { codice: 413 });
  if (L.stato !== 'collegato' || !L.sock) throw Object.assign(new Error('WhatsApp ' + L.etichetta + ' non è collegato.'), { codice: 503 });
  const ora = Date.now();
  scaricatiOra[L.id] = scaricatiOra[L.id].filter((t) => ora - t < 3600000);
  if (scaricatiOra[L.id].length >= MAX_ALL_ORA) throw Object.assign(new Error('Troppi allegati aperti in un\'ora: riprova più tardi o guardali sul telefono.'), { codice: 429 });
  scaricatiOra[L.id].push(ora);
  let buf;
  try {
    buf = await Promise.race([
      downloadMediaMessage(m, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: L.sock.updateMediaMessage }),
      new Promise((_, ko) => setTimeout(() => ko(new Error('tempo scaduto')), 60000)),
    ]);
  } catch (e) {
    log('allegato non scaricato ' + L.id + ': ' + (e?.message || e));
    throw Object.assign(new Error('WhatsApp non ha più questo allegato (o non risponde): guardalo sul telefono.'), { codice: 410 });
  }
  if (buf.length > MAX_ALLEGATO) throw Object.assign(new Error('File troppo grande per HUB: aprilo sul telefono.'), { codice: 413 });
  const v = { buf, mime: info.mime, nome: info.nome, t: Date.now() };
  cacheAllegati.set(chiave, v);
  log('allegato aperto ' + L.id + ' (' + info.tipo + ', ' + Math.round(buf.length / 1024) + ' KB)'); // mai nomi né contenuti
  return v;
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

    if (p === '/allegato') {
      if (!firmaValida(url.searchParams)) return invia(res, 403, { error: 'Indirizzo scaduto: riapri la chat in HUB.' });
      const La = linee[url.searchParams.get('l')];
      try {
        const a = await scaricaAllegato(La, url.searchParams.get('j'), url.searchParams.get('i'));
        res.writeHead(200, {
          'Content-Type': a.mime,
          'Content-Length': a.buf.length,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.nome || (a.mime.startsWith('image/') ? 'foto.jpg' : 'documento'))}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Access-Control-Allow-Origin': ORIGINE,
        });
        return res.end(a.buf);
      } catch (e) {
        return invia(res, e.codice || 500, { error: e.message });
      }
    }

    if (!autorizzato(req)) return invia(res, 401, { error: 'token' });

    // Aggiornamento senza perdere le chat: il servizio vecchio consegna la memoria, il nuovo la riprende.
    // Passa da RAM a RAM (in una variabile della shell sul Mini), mai su disco.
    if (p === '/_memoria' && req.method === 'GET') {
      const d = Object.fromEntries(Object.values(linee).map((x) => [x.id, x.mem.esporta()]));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(d, BufferJSON.replacer));
    }
    if (p === '/_memoria' && req.method === 'POST') {
      const d = await corpo(req, 200 * 1024 * 1024);
      const n = Object.fromEntries(Object.values(linee).map((x) => [x.id, x.mem.importa(d[x.id])]));
      log('memoria ripresa dal servizio precedente: ' + JSON.stringify(n));
      return invia(res, 200, { ok: true, chat: n });
    }

    if (p === '/health')
      return invia(res, 200, { ok: true, ...sintesi(L), modello: MODELLO, linee: Object.fromEntries(Object.values(linee).map((x) => [x.id, sintesi(x)])) });
    if (p === '/chats') {
      const lista = [...L.mem.chats.values()]
        .sort((a, b) => b.ts - a.ts)
        .map((c) => {
          const u = c.messaggi[c.messaggi.length - 1];
          const gr = c.jid.endsWith('@g.us');
          const chi = gr && u && !u.daMe ? L.mem.nomePersona(u.autore, u.autoreNome) + ': ' : '';
          return { jid: c.jid, nome: L.mem.nomeDi(c), ultimo: (chi + (u?.testo || '')).slice(0, 120), daMe: !!u?.daMe, ts: c.ts, ...(gr ? { gruppo: true } : {}) };
        });
      return invia(res, 200, { stato: L.stato, chats: lista });
    }
    if (p === '/chat') {
      const c = L.mem.chats.get(L.mem.jidChat(url.searchParams.get('jid') || ''));
      if (!c) return invia(res, 404, { error: 'Chat non trovata (forse è vecchia: arriverà col prossimo messaggio).' });
      const gr = c.jid.endsWith('@g.us');
      const messaggi = c.messaggi.map((m) => {
        const { autoreNome, ...x } = m;
        if (m.allegato) x.allegato = { ...m.allegato, url: indirizzoAllegato(L.id, c.jid, m.id) };
        if (gr && !m.daMe) x.autore = L.mem.nomePersona(m.autore, autoreNome);
        else delete x.autore;
        return x;
      });
      return invia(res, 200, { jid: c.jid, nome: L.mem.nomeDi(c), messaggi, ...(gr ? { gruppo: true } : {}) });
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
