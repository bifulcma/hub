// hub-wa — WhatsApp per HUB (dispositivo collegato a parte da Hermes).
// Tiene in MEMORIA (mai su disco) gli ultimi messaggi delle chat singole, propone risposte con
// Nemotron LOCALE sul Mac Studio (Ollama) e manda un messaggio SOLO quando Marco tocca «Invia» in HUB.
// Ascolta su 127.0.0.1; fuori casa si raggiunge solo via Tailscale Serve (https, tailnet).
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = path.join(os.homedir(), '.hermes', 'hub-wa');
const SESSION = path.join(BASE, 'session');
const TOKEN_FILE = path.join(BASE, 'token');
const LOG = path.join(BASE, 'hub-wa.log');
const PORT = Number(process.env.HUB_WA_PORT || 8791);
const ORIGINE = 'https://bifulcma.github.io';
const URL_PUBBLICO = process.env.HUB_WA_URL || 'https://mac-mini-von-marco.tail623d1f.ts.net:8445';
const OLLAMA = process.env.HUB_WA_OLLAMA || 'http://100.87.233.111:11434';
const MODELLO = process.env.HUB_WA_MODEL || 'nemotron35:latest';
const MAX_CHAT = 150;
const MAX_MSG = 40;
const PAUSA_INVIO_MS = 4000;

mkdirSync(BASE, { recursive: true, mode: 0o700 });
if (!existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, randomBytes(24).toString('hex'), { mode: 0o600 });
const TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim();

const log = (s) => {
  try { appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`); } catch {}
};

// ------------------------------------------------------------------ memoria delle chat (solo RAM)
const chats = new Map(); // jid -> { jid, nome, messaggi: [{id, daMe, testo, ts}], ts }

const chatSingola = (jid) => !!jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));

function testoDi(m) {
  const c = m?.message;
  if (!c) return '';
  const x = c.ephemeralMessage?.message || c.viewOnceMessage?.message || c;
  if (x.conversation) return x.conversation;
  if (x.extendedTextMessage?.text) return x.extendedTextMessage.text;
  if (x.imageMessage) return '[foto]' + (x.imageMessage.caption ? ' ' + x.imageMessage.caption : '');
  if (x.videoMessage) return '[video]' + (x.videoMessage.caption ? ' ' + x.videoMessage.caption : '');
  if (x.audioMessage) return '[messaggio vocale]';
  if (x.documentMessage) return '[documento] ' + (x.documentMessage.fileName || '');
  if (x.stickerMessage) return '[sticker]';
  if (x.locationMessage) return '[posizione]';
  if (x.contactMessage) return '[contatto] ' + (x.contactMessage.displayName || '');
  return '';
}

function ricorda(m) {
  const jid = m?.key?.remoteJid;
  if (!chatSingola(jid)) return;
  const testo = testoDi(m).trim();
  if (!testo) return;
  const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? Date.now() / 1000) * 1000;
  let c = chats.get(jid);
  if (!c) {
    c = { jid, nome: '', messaggi: [], ts: 0 };
    chats.set(jid, c);
  }
  if (!m.key.fromMe && m.pushName) c.nome = m.pushName;
  if (c.messaggi.some((x) => x.id === m.key.id)) return;
  c.messaggi.push({ id: m.key.id, daMe: !!m.key.fromMe, testo: testo.slice(0, 4000), ts });
  c.messaggi.sort((a, b) => a.ts - b.ts);
  if (c.messaggi.length > MAX_MSG) c.messaggi.splice(0, c.messaggi.length - MAX_MSG);
  c.ts = Math.max(c.ts, ts);
  if (chats.size > MAX_CHAT) {
    const vecchie = [...chats.values()].sort((a, b) => a.ts - b.ts).slice(0, chats.size - MAX_CHAT);
    for (const v of vecchie) chats.delete(v.jid);
  }
}

// ------------------------------------------------------------------ WhatsApp
let sock = null;
let stato = 'avvio'; // avvio | qr | collegato | scollegato | uscito
let qrAttuale = '';
let numero = '';
let ultimoInvio = 0;

async function versione() {
  try {
    const r = await Promise.race([fetchLatestBaileysVersion(), new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), 10000))]);
    return r.version;
  } catch {
    return undefined;
  }
}

async function avvia() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION);
  const version = await versione();
  sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['HUB', 'Safari', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    getMessage: async () => ({ conversation: '' }),
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.qr) {
      qrAttuale = u.qr;
      stato = 'qr';
    }
    if (u.connection === 'open') {
      stato = 'collegato';
      qrAttuale = '';
      numero = (sock.user?.id || '').replace(/:.*@/, '@').replace(/@.*/, '');
      log('collegato');
    }
    if (u.connection === 'close') {
      const motivo = new Boom(u.lastDisconnect?.error)?.output?.statusCode;
      if (motivo === DisconnectReason.loggedOut) {
        stato = 'uscito';
        log('uscito (logged out): serve un nuovo QR');
        return; // niente riprova a vuoto: si ricollega dalla pagina /collega
      }
      stato = 'scollegato';
      setTimeout(() => avvia().catch((e) => log('avvio fallito ' + e.message)), motivo === 515 ? 1000 : 5000);
    }
  });
  sock.ev.on('messaging-history.set', ({ chats: cs = [], contacts = [], messages = [] }) => {
    for (const m of messages) ricorda(m);
    for (const k of contacts) {
      const c = chats.get(k.id);
      if (c && !c.nome) c.nome = k.notify || k.name || '';
    }
    for (const ch of cs) {
      const c = chats.get(ch.id);
      if (c && !c.nome && ch.name) c.nome = ch.name;
    }
  });
  sock.ev.on('contacts.upsert', (cs) => {
    for (const k of cs) {
      const c = chats.get(k.id);
      if (c && (k.name || k.notify)) c.nome = k.name || k.notify;
    }
  });
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) ricorda(m);
  });
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

const nomeChat = (c) => c.nome || '+' + c.jid.replace(/@.*/, '');

const PAGINA_COLLEGA = () => `<!doctype html><html lang=it><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>HUB — collega WhatsApp</title><style>body{font-family:-apple-system,sans-serif;background:#faf7f2;color:#2b2723;text-align:center;padding:24px;max-width:560px;margin:auto}
img{width:min(80vw,400px);background:#fff;padding:12px;border-radius:12px}a.b{display:inline-block;background:#c96442;color:#fff;border-radius:12px;padding:14px 22px;font-size:19px;text-decoration:none;margin-top:12px}</style>
<h1>HUB ↔ WhatsApp</h1><div id=c><p>Carico…</p></div>
<script>
// Attenzione: questo testo sta dentro un template literal di Node: niente apici escapati, usa addEventListener.
// Percorsi assoluti, niente cache, e la pagina riprova sempre: un errore di rete non la lascia bianca.
let ultimo='';
function mostra(chiave,html){if(chiave!==ultimo){ultimo=chiave;document.getElementById('c').innerHTML=html}}
function nuovoQr(){const i=document.getElementById('qr');if(!i)return;const n=new Image();n.onload=()=>{i.src=n.src};n.src='/collega/qr.png?'+Date.now()}
document.addEventListener('click',(e)=>{if(e.target&&e.target.id==='nuovo'){e.preventDefault();fetch('/collega/nuovo',{method:'POST'})}});
async function giro(){
try{const x=await fetch('/collega/stato',{cache:'no-store'});if(!x.ok)throw new Error('HTTP '+x.status);const r=await x.json();
if(r.stato==='qr'){mostra('qr','<p>Sul <b>telefono Personale</b>: WhatsApp → Impostazioni → <b>Dispositivi collegati</b> → <b>Collega un dispositivo</b>, poi inquadra:</p><img id=qr alt="QR">');nuovoQr()}
else if(r.stato==='collegato'){mostra('ok'+r.numero,'<p>✅ WhatsApp collegato a HUB ('+r.numero+').</p><p>Ultimo passo, sul dispositivo dove userai HUB (iPad o iPhone):</p><a class=b href="'+r.link+'">Apri HUB e collega</a><p style="font-size:14px;color:#6b6259">Il link porta la password solo dentro HUB su questo dispositivo.</p>')}
else if(r.stato==='uscito'){mostra('uscito','<p>WhatsApp ha scollegato HUB.</p><a class=b id=nuovo href="#">Nuovo QR</a>')}
else mostra('st'+r.stato,'<p>Attendo WhatsApp… ('+r.stato+')</p>')}
catch(e){mostra('err','<p>Non riesco a raggiungere il Mac mini. Controlla che Tailscale sia acceso: riprovo da solo…</p>')}
setTimeout(giro,2500)}
giro();
</script></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'OPTIONS') return invia(res, 204, '');
    // Pagina di collegamento: raggiungibile solo dalla rete Tailscale (Serve) o dal Mini.
    if (p === '/collega') return invia(res, 200, PAGINA_COLLEGA(), 'text/html; charset=utf-8');
    if (p === '/collega/stato') {
      const link = stato === 'collegato' ? `${ORIGINE}/hub/#/impostazioni?wa=${encodeURIComponent(URL_PUBBLICO)}&watoken=${TOKEN}` : '';
      return invia(res, 200, { stato, numero: numero ? '+' + numero : '', link });
    }
    if (p === '/collega/qr.png') {
      if (stato !== 'qr' || !qrAttuale) return invia(res, 404, '');
      return invia(res, 200, await QRCode.toBuffer(qrAttuale, { width: 420, margin: 1 }), 'image/png');
    }
    if (p === '/collega/nuovo' && req.method === 'POST') {
      if (stato === 'uscito') {
        try { renameSync(SESSION, SESSION + '.uscita-' + Date.now()); } catch {}
        stato = 'avvio';
        avvia().catch((e) => log('avvio ' + e.message));
      }
      return invia(res, 200, { ok: true });
    }

    if (!autorizzato(req)) return invia(res, 401, { error: 'token' });

    if (p === '/health') return invia(res, 200, { ok: true, stato, numero: numero ? '+' + numero : '', modello: MODELLO });
    if (p === '/chats') {
      const lista = [...chats.values()]
        .sort((a, b) => b.ts - a.ts)
        .map((c) => {
          const u = c.messaggi[c.messaggi.length - 1];
          return { jid: c.jid, nome: nomeChat(c), ultimo: u?.testo.slice(0, 120) || '', daMe: !!u?.daMe, ts: c.ts };
        });
      return invia(res, 200, { stato, chats: lista });
    }
    if (p === '/chat') {
      const c = chats.get(url.searchParams.get('jid') || '');
      if (!c) return invia(res, 404, { error: 'Chat non trovata (forse è vecchia: arriverà col prossimo messaggio).' });
      return invia(res, 200, { jid: c.jid, nome: nomeChat(c), messaggi: c.messaggi });
    }
    if (p === '/ai' && req.method === 'POST') {
      const b = await corpo(req);
      if (typeof b.system !== 'string' || typeof b.prompt !== 'string') return invia(res, 400, { error: 'system e prompt' });
      const testo = await chiediIA(b.system.slice(0, 8000), b.prompt.slice(0, 30000), !!b.json);
      return invia(res, 200, { testo });
    }
    if (p === '/send' && req.method === 'POST') {
      const b = await corpo(req);
      const c = chats.get(b.jid || '');
      if (!c) return invia(res, 400, { error: 'Posso scrivere solo nelle chat già presenti in HUB.' });
      const testo = String(b.testo || '').trim();
      if (!testo) return invia(res, 400, { error: 'Messaggio vuoto' });
      if (testo.length > 4000) return invia(res, 400, { error: 'Messaggio troppo lungo' });
      if (stato !== 'collegato' || !sock) return invia(res, 503, { error: 'WhatsApp non è collegato.' });
      const attesa = ultimoInvio + PAUSA_INVIO_MS - Date.now();
      if (attesa > 0) return invia(res, 429, { error: `Aspetta ${Math.ceil(attesa / 1000)} secondi tra un invio e l'altro.` });
      ultimoInvio = Date.now();
      const sent = await sock.sendMessage(c.jid, { text: testo });
      if (sent) ricorda(sent);
      log('inviato 1 messaggio'); // niente contenuto né destinatario nel registro
      return invia(res, 200, { ok: true });
    }
    return invia(res, 404, { error: 'boh' });
  } catch (e) {
    log('errore ' + (e?.message || e));
    return invia(res, 500, { error: e?.message || 'errore' });
  }
});

server.listen(PORT, '127.0.0.1', () => log(`in ascolto su 127.0.0.1:${PORT}`));
avvia().catch((e) => log('avvio fallito ' + e.message));
