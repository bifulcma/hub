import { useEffect, useRef, useState } from 'react';
import { provaPonte } from './ponte';
import { chiediIA, contesto, iaPronta, collegaDalMini, leggiCollegamento, leggiCollegamentoDaTesto, nomeIA, paginaCollega, usaNemotron, waChat, waChats, waConfigurato, waInvia, waSalute, waScollega, type ChatBreve, type Conversazione, type Linea } from './wa';
import {
  AZIONI,
  erroreSemplice,
  leggiRisposte,
  NOMI_LINGUA,
  promptChat,
  promptRispondi,
  promptScrivi,
  pulisciTesto,
  type AzioneScrivi,
} from './ai';
import { demoRispondi, demoScrivi } from './demo';
import { condividi, copia } from './invio';
import { carica, esporta, importa, nuovoId, ordinaPronti, ponteValido, salva, type Lingua, type ProfiloId, type Stato } from './store';

type Pagina = 'chat' | 'rispondi' | 'scrivi' | 'pronti' | 'impostazioni';

/** Messaggio arrivato da un Comando rapido: #/rispondi?t=<testo>&p=business */
function leggiArrivo(): { testo: string; profilo?: ProfiloId } {
  if (typeof location === 'undefined') return { testo: '' };
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const p = q.get('p');
  return { testo: q.get('t') || '', profilo: p === 'business' || p === 'personale' ? p : undefined };
}
const PAGINE: Pagina[] = ['chat', 'rispondi', 'scrivi', 'pronti', 'impostazioni'];

function paginaDaHash(): Pagina {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '').split('?')[0];
  return (PAGINE as string[]).includes(h) ? (h as Pagina) : 'rispondi';
}

const Icona = ({ nome }: { nome: Pagina }) => {
  const d: Record<Pagina, string> = {
    chat: 'M3 6h12v8H7l-4 3zM9 17h8l4 3V9h-3',
    rispondi: 'M4 5h16v10H8l-4 4z',
    scrivi: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    pronti: 'M6 4h12v16l-6-4-6 4z',
    impostazioni: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  };
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d[nome]} />
    </svg>
  );
};

let appenaCollegato = false;

const ETICHETTE: Record<Pagina, string> = { chat: 'Chat', rispondi: 'Rispondi', scrivi: 'Scrivi', pronti: 'Pronti', impostazioni: 'Impostazioni' };

export default function App() {
  const [stato, setStato] = useState<Stato>(() => {
    let s = carica();
    const q = leggiArrivo();
    if (q.profilo) s = { ...s, attivo: q.profilo };
    const wa = typeof location !== 'undefined' ? leggiCollegamento(location.hash) : null;
    if (wa) {
      s = { ...s, attivo: 'personale', impostazioni: { ...s.impostazioni, ...wa, ia: 'nemotron' } };
      history.replaceState(null, '', '#/chat');
      appenaCollegato = true;
    }
    return s;
  });
  const [pagina, setPagina] = useState<Pagina>(paginaDaHash);
  const [toast, setToast] = useState('');
  const [nuovaVersione, setNuovaVersione] = useState<null | (() => void)>(null);
  const [bozza, setBozza] = useState<string | null>(null); // anteprima con azioni finali
  const [destinatario, setDestinatario] = useState<Destinatario | null>(null);
  useEffect(() => {
    if (appenaCollegato) {
      appenaCollegato = false;
      avvisa('✅ WhatsApp collegato a HUB');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => salva(stato), [stato]);
  useEffect(() => {
    const f = () => setPagina(paginaDaHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    const f = (e: Event) => setNuovaVersione(() => (e as CustomEvent).detail as () => void);
    window.addEventListener('hub-aggiorna', f);
    return () => window.removeEventListener('hub-aggiorna', f);
  }, []);

  const timerToast = useRef<number | undefined>(undefined);
  const avvisa = (t: string) => {
    setToast(t);
    window.clearTimeout(timerToast.current);
    timerToast.current = window.setTimeout(() => setToast(''), 2600);
  };
  const vai = (p: Pagina) => {
    location.hash = '#/' + p;
    setPagina(p);
  };

  const profilo = stato.profili[stato.attivo];
  const demo = !iaPronta(stato.impostazioni);
  const apriBozza = (t: string, a?: Destinatario) => {
    setDestinatario(a || null);
    setBozza(t);
  };
  const cambiaProfilo = (id: ProfiloId) => setStato((s) => ({ ...s, attivo: id }));
  const salvaPronto = (testo: string) => {
    if (!testo.trim()) return;
    setStato((s) => ({ ...s, pronti: { ...s.pronti, [s.attivo]: [{ id: nuovoId(), testo: testo.trim(), preferito: false }, ...s.pronti[s.attivo]] } }));
    avvisa('Salvato nei Pronti');
  };

  return (
    <div className={`app profilo-${stato.attivo}`}>
      <header className="testata">
        <div className="segmento" role="tablist" aria-label="Profilo">
          {(['personale', 'business'] as ProfiloId[]).map((id) => (
            <button key={id} role="tab" aria-selected={stato.attivo === id} className={`seg seg-${id} ${stato.attivo === id ? 'attivo' : ''}`} onClick={() => cambiaProfilo(id)}>
              {stato.profili[id].nome}
            </button>
          ))}
        </div>
        {demo && (
          <div className="banner" data-testid="banner-demo">
            Modalità prova: le risposte sono esempi finti. <a href="#/impostazioni">Collega l'IA</a>
          </div>
        )}
      </header>

      <main className="contenuto">
        {pagina === 'chat' && <Chat stato={stato} setStato={setStato} avvisa={avvisa} demo={demo} apri={apriBozza} />}
        {pagina === 'rispondi' && <Rispondi stato={stato} demo={demo} apri={(t) => apriBozza(t)} avvisa={avvisa} />}
        {pagina === 'scrivi' && <Scrivi stato={stato} setStato={setStato} demo={demo} apri={(t) => apriBozza(t)} avvisa={avvisa} />}
        {pagina === 'pronti' && <Pronti stato={stato} setStato={setStato} apri={(t) => apriBozza(t)} />}
        {pagina === 'impostazioni' && <Impostazioni stato={stato} setStato={setStato} avvisa={avvisa} />}
      </main>

      <nav className="schede" aria-label="Sezioni">
        {PAGINE.map((p) => (
          <button key={p} className={pagina === p ? 'attiva' : ''} onClick={() => vai(p)} aria-current={pagina === p ? 'page' : undefined}>
            <Icona nome={p} />
            <span>{ETICHETTE[p]}</span>
          </button>
        ))}
      </nav>

      {bozza !== null && (
        <Anteprima
          testo={bozza}
          app={profilo.app}
          nomeProfilo={profilo.nome}
          firma={profilo.firma}
          chiudi={() => { setBozza(null); setDestinatario(null); }}
          destinatario={destinatario && stato.attivo === destinatario.linea ? destinatario : null}
          inviaDiretto={async (t) => {
            if (!destinatario) return;
            await waInvia(stato.impostazioni, destinatario.jid, t, destinatario.linea);
            avvisa('✅ Inviato a ' + destinatario.nome);
            window.dispatchEvent(new Event('hub-inviato'));
          }}
          salvaPronto={salvaPronto}
          avvisa={avvisa}
        />
      )}

      {nuovaVersione && (
        <div className="toast toast-azione">
          Nuova versione di HUB <button onClick={() => nuovaVersione()}>Aggiorna</button>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Chat (WhatsApp Personale e Business via Mac mini)
type Destinatario = { jid: string; nome: string; linea: Linea };
function oraBreve(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const oggi = new Date();
  return d.toDateString() === oggi.toDateString()
    ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function Chat({ stato, setStato, avvisa, demo, apri }: { stato: Stato; setStato: React.Dispatch<React.SetStateAction<Stato>>; avvisa: (t: string) => void; demo: boolean; apri: (t: string, a?: Destinatario) => void }) {
  const imp = stato.impostazioni;
  const linea: Linea = stato.attivo;
  const [statoLinea, setStatoLinea] = useState('');
  const [lista, setLista] = useState<ChatBreve[]>([]);
  const [aperta, setAperta] = useState<Conversazione | null>(null);
  const [errore, setErrore] = useState('');
  const [cerca, setCerca] = useState('');
  const [intenzione, setIntenzione] = useState('');
  const [risposte, setRisposte] = useState<string[]>([]);
  const [lavoro, setLavoro] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const jidAperto = useRef<string>('');
  const profilo = stato.profili[stato.attivo];

  const aggiornaLista = async () => {
    if (!waConfigurato(imp)) return;
    try {
      const r = await waChats(imp, linea);
      if (linea !== stato.attivo) return;
      setLista(r.chats);
      setStatoLinea(r.stato);
      setErrore(
        r.stato === 'collegato' || r.stato === 'spento'
          ? ''
          : r.stato === 'uscito'
            ? 'WhatsApp ha scollegato HUB: ricollegalo dalla pagina «collega» sul Mini.'
            : r.stato === 'qr'
              ? 'Aspetto che inquadri il QR sulla pagina «collega» del Mac mini.'
              : 'WhatsApp si sta collegando…',
      );
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    }
  };
  const aggiornaAperta = async (jid = jidAperto.current) => {
    if (!jid) return;
    try {
      const c = await waChat(imp, jid, linea);
      if (jidAperto.current === jid) setAperta(c);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    setLista([]);
    setAperta(null);
    setStatoLinea('');
    setErrore('');
    jidAperto.current = '';
    aggiornaLista();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        aggiornaLista();
        aggiornaAperta();
      }
    }, 10000);
    const f = () => { aggiornaAperta(); aggiornaLista(); setRisposte([]); setIntenzione(''); };
    window.addEventListener('hub-inviato', f);
    return () => { window.clearInterval(t); window.removeEventListener('hub-inviato', f); ctrl.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp.waUrl, imp.waToken, linea]);

  if (!waConfigurato(imp))
    return (
      <section className="pannello">
        <h1>Chat</h1>
        <p>Qui vedrai i messaggi del tuo WhatsApp <b>Personale</b> e potrai rispondere senza copiare e incollare.</p>
        <CollegaIncolla setStato={setStato} avvisa={avvisa} />
      </section>
    );
  if (linea === 'business' && (statoLinea === 'spento' || statoLinea === 'uscito'))
    return (
      <section className="pannello">
        <h1>Chat <span className="sotto">· WhatsApp Business</span></h1>
        <p>Il <b>Business</b> non è collegato a HUB. Puoi sempre usare <a href="#/rispondi">Rispondi</a> e poi Condividi → WhatsApp Business.</p>
        <p className="nota">Per collegarlo: apri la pagina qui sotto su un <b>altro schermo</b> (iPad o Mac) e inquadra il QR con <b>WhatsApp Business</b> sul telefono → Dispositivi collegati.</p>
        <a className="bottone primario" href={paginaCollega(imp, 'business')} target="_blank" rel="noreferrer">Apri la pagina del QR Business</a>
        <p className="nota">Collegamento non ufficiale: WhatsApp potrebbe bloccare il numero. HUB invia solo dopo «Sì, invia», solo a chi ti ha già scritto, con almeno 15 secondi tra un invio e l’altro.</p>
      </section>
    );

  const apriChat = (c: ChatBreve) => {
    jidAperto.current = c.jid;
    setAperta({ jid: c.jid, nome: c.nome, messaggi: [] });
    setRisposte([]);
    setIntenzione('');
    aggiornaAperta(c.jid);
  };
  const chiudiChat = () => {
    ctrl.current?.abort();
    jidAperto.current = '';
    setAperta(null);
    setRisposte([]);
  };

  const proponi = async () => {
    if (!aperta || !aperta.messaggi.length) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLavoro(true);
    setErrore('');
    setRisposte([]);
    try {
      let l: string[];
      if (demo) l = await demoRispondi(linea, intenzione, c.signal);
      else {
        const { system, prompt } = promptChat(profilo, aperta.nome, contesto(aperta), intenzione);
        l = leggiRisposte(await chiediIA(imp, { system, prompt, json: true, signal: c.signal }));
      }
      if (!c.signal.aborted) setRisposte(l);
    } catch (e) {
      if (!c.signal.aborted) setErrore(erroreSemplice(e));
    } finally {
      if (ctrl.current === c) setLavoro(false);
    }
  };

  if (aperta)
    return (
      <section className="pannello conversazione">
        <div className="riga testa-chat">
          <button className="secondario piccolo" onClick={chiudiChat}>‹ Chat</button>
          <h1>{aperta.nome}</h1>
        </div>
        <div className="bolle" data-testid="bolle">
          {aperta.messaggi.length === 0 && <p className="vuoto">Carico i messaggi…</p>}
          {aperta.messaggi.slice(-15).map((m) => (
            <div key={m.id} className={`bolla ${m.daMe ? 'mia' : 'sua'}`}>
              {m.testo}
              <span className="ora">{oraBreve(m.ts)}</span>
            </div>
          ))}
        </div>
        <label className="etichetta" htmlFor="intenzione-chat">Cosa vuoi rispondere? <span className="facoltativo">(facoltativo)</span></label>
        <input id="intenzione-chat" type="text" placeholder="es. di' che va bene giovedì" value={intenzione} onChange={(e) => setIntenzione(e.target.value)} />
        <button className="primario largo" data-testid="proponi-chat" disabled={lavoro || !aperta.messaggi.length} onClick={proponi}>
          Proponi risposte · {nomeIA(imp)}
        </button>
        {lavoro && (
          <div className="pensa">
            Sto pensando… <button className="secondario piccolo" onClick={() => { ctrl.current?.abort(); setLavoro(false); }}>Annulla</button>
          </div>
        )}
        {errore && <div className="errore">{errore}</div>}
        {risposte.length > 0 && <p className="suggerimento">Tocca una risposta per rivederla e inviarla a {aperta.nome}.</p>}
        <ul className="lista-risposte">
          {risposte.map((r, i) => (
            <li key={i}>
              <button className="scheda" data-testid="risposta-chat" onClick={() => apri(r, { jid: aperta.jid, nome: aperta.nome, linea })}>{r}</button>
            </li>
          ))}
        </ul>
        <button className="secondario largo" onClick={() => apri('', { jid: aperta.jid, nome: aperta.nome, linea })}>Scrivi tu la risposta</button>
      </section>
    );

  const q = cerca.trim().toLowerCase();
  const filtrate = q ? lista.filter((c) => c.nome.toLowerCase().includes(q) || c.ultimo.toLowerCase().includes(q)) : lista;
  return (
    <section className="pannello">
      <h1>Chat <span className="sotto">· WhatsApp {linea === 'business' ? 'Business' : 'Personale'}</span></h1>
      {errore && <div className="errore">{errore}</div>}
      {linea === 'business' && <p className="nota">Business: HUB risponde solo a chi ti ha già scritto, con almeno 15 secondi tra un invio e l’altro.</p>}
      <input type="search" placeholder="Cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      {filtrate.length === 0 && !errore && <p className="vuoto">Ancora nessun messaggio: compariranno qui appena arrivano.</p>}
      <ul className="lista-chat">
        {filtrate.map((c) => (
          <li key={c.jid}>
            <button className="riga-chat" data-testid="riga-chat" onClick={() => apriChat(c)}>
              <span className="avatar">{(c.nome.replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase()}</span>
              <span className="corpo-chat">
                <span className="nome-chat">{c.nome}</span>
                <span className="ultimo">{c.daMe ? 'Tu: ' : ''}{c.ultimo}</span>
              </span>
              <span className="ora">{oraBreve(c.ts)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Rispondi
function Rispondi({ stato, demo, apri, avvisa }: { stato: Stato; demo: boolean; apri: (t: string) => void; avvisa: (t: string) => void }) {
  const [ricevuto, setRicevuto] = useState(() => leggiArrivo().testo);
  const [intenzione, setIntenzione] = useState('');
  const [risposte, setRisposte] = useState<string[]>([]);
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState('');
  const ctrl = useRef<AbortController | null>(null);
  const profilo = stato.profili[stato.attivo];

  // Cambio profilo o uscita dalla pagina: si annulla la richiesta e si tolgono le proposte del profilo vecchio.
  useEffect(() => {
    ctrl.current?.abort();
    setLavoro(false);
    setRisposte([]);
    setErrore('');
  }, [stato.attivo]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const incolla = async (eProponi = false) => {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) {
        setRicevuto(t);
        if (eProponi) proponi(t);
      } else avvisa('Gli appunti sono vuoti: copia prima il messaggio in WhatsApp');
    } catch {
      setErrore('Non posso leggere gli appunti: tieni premuto nella casella e scegli «Incolla».');
    }
  };

  // Arrivo da Comando rapido: propone subito e pulisce l'indirizzo.
  useEffect(() => {
    const a = leggiArrivo();
    if (a.testo.trim()) {
      history.replaceState(null, '', '#/rispondi');
      proponi(a.testo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proponi = async (testoForzato?: string) => {
    const daUsare = typeof testoForzato === 'string' ? testoForzato : ricevuto;
    if (!daUsare.trim()) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLavoro(true);
    setErrore('');
    setRisposte([]);
    try {
      let lista: string[];
      if (demo) lista = await demoRispondi(stato.attivo, intenzione, c.signal);
      else {
        const { system, prompt } = promptRispondi(profilo, daUsare, intenzione);
        const raw = await chiediIA(stato.impostazioni, { system, prompt, json: true, signal: c.signal });
        lista = leggiRisposte(raw);
      }
      if (!c.signal.aborted) setRisposte(lista);
    } catch (e) {
      if (!c.signal.aborted) setErrore(erroreSemplice(e));
    } finally {
      if (ctrl.current === c) setLavoro(false);
    }
  };

  const annulla = () => {
    ctrl.current?.abort();
    setLavoro(false);
  };

  return (
    <section className="griglia-rispondi">
      <div className="pannello">
        <h1>Rispondi</h1>
        <button className="primario largo grande" data-testid="incolla-proponi" disabled={lavoro} onClick={() => incolla(true)}>
          📋 Incolla e proponi
        </button>
        <p className="suggerimento">In WhatsApp tieni premuto il messaggio → Copia, poi torna qui e tocca il pulsante.</p>
        <label className="etichetta" htmlFor="ricevuto">Messaggio ricevuto</label>
        <textarea id="ricevuto" data-testid="ricevuto" rows={6} placeholder="Incolla qui il messaggio ricevuto" value={ricevuto} onChange={(e) => setRicevuto(e.target.value)} />
        <div className="riga">
          <button className="secondario" onClick={() => incolla(false)}>Solo incolla</button>
          {ricevuto && <button className="secondario" onClick={() => { setRicevuto(''); setRisposte([]); }}>Svuota</button>}
        </div>
        <label className="etichetta" htmlFor="intenzione">Cosa vuoi rispondere? <span className="facoltativo">(facoltativo)</span></label>
        <input id="intenzione" type="text" placeholder={stato.attivo === 'business' ? "es. conferma l'appuntamento di venerdì" : "es. di' che va bene giovedì"} value={intenzione} onChange={(e) => setIntenzione(e.target.value)} />
        <button className="primario largo" data-testid="proponi" disabled={!ricevuto.trim() || lavoro} onClick={() => proponi()}>
          Proponi risposte
        </button>
        {!ricevuto.trim() && <p className="suggerimento">Prima incolla il messaggio che hai ricevuto.</p>}
        {ricevuto.length > 4000 && <p className="suggerimento">Messaggio molto lungo: Claude potrebbe metterci di più.</p>}
      </div>
      <div className="pannello">
        <h2>Proposte <span className="sotto">· {profilo.nome}, {NOMI_LINGUA[profilo.lingua]}</span></h2>
        {lavoro && (
          <div className="pensa">
            Sto pensando… <button className="secondario piccolo" onClick={annulla}>Annulla</button>
          </div>
        )}
        {errore && (
          <div className="errore">
            {errore} <button className="secondario piccolo" onClick={() => proponi()}>Riprova</button>
          </div>
        )}
        {!lavoro && !errore && risposte.length === 0 && <p className="vuoto">Incolla un messaggio e premi «Proponi risposte».</p>}
        {risposte.length > 0 && <p className="suggerimento">Tocca una risposta per rivederla e inviarla.</p>}
        <ul className="lista-risposte">
          {risposte.map((r, i) => (
            <li key={i}>
              <button className="scheda" data-testid="risposta" onClick={() => apri(r)}>{r}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Scrivi
function Scrivi({ stato, setStato, demo, apri, avvisa }: { stato: Stato; setStato: React.Dispatch<React.SetStateAction<Stato>>; demo: boolean; apri: (t: string) => void; avvisa: (t: string) => void }) {
  const [testo, setTesto] = useState('');
  const [risultato, setRisultato] = useState('');
  const [precedente, setPrecedente] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState<AzioneScrivi | null>(null);
  const [errore, setErrore] = useState('');
  const lingua: Lingua = stato.impostazioni.linguaTraduzione || 'de';
  const setLingua = (l: Lingua) => setStato((s) => ({ ...s, impostazioni: { ...s.impostazioni, linguaTraduzione: l } }));
  const ctrl = useRef<AbortController | null>(null);
  const profilo = stato.profili[stato.attivo];

  useEffect(() => {
    ctrl.current?.abort();
    setLavoro(null);
    setRisultato('');
  }, [stato.attivo]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const esegui = async (azione: AzioneScrivi) => {
    if (!testo.trim()) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLavoro(azione);
    setErrore('');
    setRisultato('');
    try {
      let r: string;
      if (demo) r = await demoScrivi(testo, azione, c.signal);
      else {
        const { system, prompt } = promptScrivi(profilo, testo, azione, lingua);
        r = pulisciTesto(await chiediIA(stato.impostazioni, { system, prompt, signal: c.signal }));
      }
      if (!c.signal.aborted) setRisultato(r);
    } catch (e) {
      if (!c.signal.aborted) setErrore(erroreSemplice(e));
    } finally {
      if (ctrl.current === c) setLavoro(null);
    }
  };

  return (
    <section className="pannello">
      <h1>Scrivi</h1>
      <textarea data-testid="testo-scrivi" rows={7} placeholder="Scrivi o incolla il tuo messaggio" value={testo} onChange={(e) => setTesto(e.target.value)} />
      <div className="azioni-ia" role="toolbar" aria-label="Azioni IA">
        {AZIONI.map((a) => (
          <button key={a.id} className="chip" disabled={!testo.trim() || !!lavoro} onClick={() => esegui(a.id)} data-testid={`azione-${a.id}`}>
            {a.id === 'traduci' ? `Traduci in ${NOMI_LINGUA[lingua]}` : a.etichetta}
          </button>
        ))}
      </div>
      <label className="lingua-traduci">
        Lingua per «Traduci»:
        <select value={lingua} onChange={(e) => setLingua(e.target.value as Lingua)}>
          {(Object.keys(NOMI_LINGUA) as Lingua[]).map((l) => (
            <option key={l} value={l}>{NOMI_LINGUA[l]}</option>
          ))}
        </select>
      </label>
      {lavoro && (
        <div className="pensa">
          Sto pensando… <button className="secondario piccolo" onClick={() => { ctrl.current?.abort(); setLavoro(null); }}>Annulla</button>
        </div>
      )}
      {errore && <div className="errore">{errore}</div>}
      {risultato && (
        <div className="risultato" data-testid="risultato">
          <div className="etichetta">Risultato</div>
          <p className="testo-risultato">{risultato}</p>
          <div className="riga">
            <button className="primario" onClick={() => { setPrecedente(testo); setTesto(risultato); setRisultato(''); avvisa('Testo aggiornato'); }}>Usa questo</button>
            <button className="secondario" onClick={() => setRisultato('')}>Scarta</button>
          </div>
        </div>
      )}
      <div className="riga">
        <button className="primario largo" disabled={!testo.trim()} onClick={() => apri(testo)}>Pronto, invia…</button>
        {precedente !== null && <button className="secondario" onClick={() => { setTesto(precedente); setPrecedente(null); }}>Annulla modifica</button>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Pronti
function Pronti({ stato, setStato, apri }: { stato: Stato; setStato: React.Dispatch<React.SetStateAction<Stato>>; apri: (t: string) => void }) {
  const [cerca, setCerca] = useState('');
  const [nuovo, setNuovo] = useState('');
  const [modifica, setModifica] = useState<{ id: string; testo: string } | null>(null);
  const lista = ordinaPronti(stato.pronti[stato.attivo], cerca);
  const aggiorna = (f: (l: Stato['pronti'][ProfiloId]) => Stato['pronti'][ProfiloId]) =>
    setStato((s) => ({ ...s, pronti: { ...s.pronti, [s.attivo]: f(s.pronti[s.attivo]) } }));

  return (
    <section className="pannello">
      <h1>Pronti <span className="sotto">· {stato.profili[stato.attivo].nome}</span></h1>
      <input type="search" placeholder="Cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} />
      <ul className="lista-pronti">
        {lista.map((p) => (
          <li key={p.id} className="pronto">
            {modifica?.id === p.id ? (
              <div className="modifica">
                <textarea rows={3} value={modifica.testo} onChange={(e) => setModifica({ ...modifica, testo: e.target.value })} />
                <div className="riga">
                  <button className="primario" disabled={!modifica.testo.trim()} onClick={() => { aggiorna((l) => l.map((x) => (x.id === p.id ? { ...x, testo: modifica.testo.trim() } : x))); setModifica(null); }}>Salva</button>
                  <button className="secondario" onClick={() => setModifica(null)}>Annulla</button>
                </div>
              </div>
            ) : (
              <>
                <button className="stella" aria-label={p.preferito ? 'Togli dai preferiti' : 'Metti nei preferiti'} onClick={() => aggiorna((l) => l.map((x) => (x.id === p.id ? { ...x, preferito: !x.preferito } : x)))}>
                  {p.preferito ? '★' : '☆'}
                </button>
                <button className="testo-pronto" data-testid="pronto" onClick={() => apri(p.testo)}>{p.testo}</button>
                <button className="piccolo secondario" aria-label="Modifica" title="Modifica" onClick={() => setModifica({ id: p.id, testo: p.testo })}>✎</button>
                <button className="piccolo secondario" aria-label="Elimina" onClick={() => { if (confirm('Eliminare questo messaggio pronto?')) aggiorna((l) => l.filter((x) => x.id !== p.id)); }}>✕</button>
              </>
            )}
          </li>
        ))}
        {lista.length === 0 && <li className="vuoto">Nessun messaggio trovato.</li>}
      </ul>
      <label className="etichetta" htmlFor="nuovo">Nuovo messaggio pronto</label>
      <textarea id="nuovo" rows={2} value={nuovo} onChange={(e) => setNuovo(e.target.value)} placeholder="Scrivi un messaggio da riusare" />
      <button className="primario" disabled={!nuovo.trim()} onClick={() => { aggiorna((l) => [{ id: nuovoId(), testo: nuovo.trim(), preferito: false }, ...l]); setNuovo(''); }}>Aggiungi</button>
    </section>
  );
}

// ---------------------------------------------------------------- Impostazioni
function Impostazioni({ stato, setStato, avvisa }: { stato: Stato; setStato: React.Dispatch<React.SetStateAction<Stato>>; avvisa: (t: string) => void }) {
  const [prova, setProva] = useState('');
  const p = stato.profili[stato.attivo];
  const setProfilo = (campo: string, valore: string) =>
    setStato((s) => ({ ...s, profili: { ...s.profili, [s.attivo]: { ...s.profili[s.attivo], [campo]: valore } } }));
  const setImp = (campo: 'ponte' | 'token', valore: string) => setStato((s) => ({ ...s, impostazioni: { ...s.impostazioni, [campo]: valore } }));

  const [provando, setProvando] = useState(false);
  const provaConnessione = async () => {
    if (!ponteValido(stato.impostazioni.ponte)) {
      setProva('❌ L’indirizzo deve iniziare con https://');
      return;
    }
    setProvando(true);
    setProva('Provo…');
    const r = await provaPonte(stato.impostazioni.ponte, stato.impostazioni.token);
    setProva(
      r === 'ok' ? '✅ Collegato a Claude sullo Studio' : r === 'token' ? '❌ Token sbagliato' : r === 'irraggiungibile' ? '❌ Non raggiungo il ponte: Tailscale è acceso? (Dall’icona serve anche il Relay privato di iCloud spento.)' : '❌ Il ponte risponde con un errore',
    );
    setProvando(false);
  };

  const scarica = () => {
    const blob = new Blob([esporta(stato)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hub-salvataggio.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const carica = (f: File | undefined) => {
    if (!f) return;
    if (!confirm('Il file sostituisce tutti i messaggi pronti e i profili attuali. Continuare?')) return;
    f.text().then((t) => {
      try {
        setStato((s) => importa(t, s));
        avvisa('Salvataggio caricato');
      } catch (e) {
        avvisa(e instanceof Error ? e.message : 'File non valido');
      }
    });
  };

  return (
    <section className="pannello">
      <h1>Impostazioni</h1>
      <h2>Profilo {p.nome}</h2>
      <label className="etichetta">Nome<input value={p.nome} onChange={(e) => setProfilo('nome', e.target.value)} /></label>
      <label className="etichetta">Tono<input value={p.tono} onChange={(e) => setProfilo('tono', e.target.value)} /></label>
      <label className="etichetta">Lingua dei messaggi
        <select value={p.lingua} onChange={(e) => setProfilo('lingua', e.target.value)}>
          {(Object.keys(NOMI_LINGUA) as Lingua[]).map((l) => <option key={l} value={l}>{NOMI_LINGUA[l]}</option>)}
        </select>
      </label>
      <label className="etichetta">Firma (facoltativa)<input value={p.firma} placeholder="es. Marco Bifulco" onChange={(e) => setProfilo('firma', e.target.value)} /></label>

      <h2>IA</h2>
      <div className="segmento scelta-ia" role="radiogroup" aria-label="IA">
        <button role="radio" aria-checked={(stato.impostazioni.ia || 'nemotron') === 'nemotron'} className={`seg ${(stato.impostazioni.ia || 'nemotron') === 'nemotron' ? 'attivo scelta' : ''}`} onClick={() => setStato((s) => ({ ...s, impostazioni: { ...s.impostazioni, ia: 'nemotron' } }))}>Nemotron locale</button>
        <button role="radio" aria-checked={stato.impostazioni.ia === 'claude'} className={`seg ${stato.impostazioni.ia === 'claude' ? 'attivo scelta' : ''}`} onClick={() => setStato((s) => ({ ...s, impostazioni: { ...s.impostazioni, ia: 'claude' } }))}>Claude</button>
      </div>
      <p className="nota">
        {(stato.impostazioni.ia || 'nemotron') === 'nemotron'
          ? waConfigurato(stato.impostazioni)
            ? 'Nemotron gira sul tuo Mac Studio: i messaggi non escono di casa.'
            : 'Nemotron passa dal Mac mini: collega prima WhatsApp qui sotto (oppure scegli Claude).'
          : 'Claude risponde dai server di Anthropic, tramite il ponte del Mac Studio.'}
      </p>

      <h2>WhatsApp Personale (Mac mini)</h2>
      <StatoWa stato={stato} setStato={setStato} avvisa={avvisa} />

      <h2>WhatsApp Business (Mac mini)</h2>
      <StatoBusiness stato={stato} avvisa={avvisa} />

      <h2>Claude (ponte del Mac Studio)</h2>
      <label className="etichetta">Indirizzo del ponte<input value={stato.impostazioni.ponte} inputMode="url" autoCapitalize="off" autoCorrect="off" onChange={(e) => setImp('ponte', e.target.value)} /></label>
      <label className="etichetta">Token<input type="password" value={stato.impostazioni.token} placeholder="lo stesso di Penna e Tubo" autoComplete="off" onChange={(e) => setImp('token', e.target.value)} /></label>
      <p className="nota">Serve Tailscale acceso su questo dispositivo. Il token resta salvato solo qui.</p>
      <div className="riga">
        <button className="primario" disabled={provando} onClick={provaConnessione}>Prova connessione</button>
        <span data-testid="esito-prova">{prova}</span>
      </div>

      <h2>Salvataggio</h2>
      <p className="nota">Messaggi pronti e profili, senza il token.</p>
      <div className="riga">
        <button className="secondario" onClick={scarica}>Esporta</button>
        <label className="secondario bottone-file">Importa<input type="file" accept="application/json,.json" onChange={(e) => { carica(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>
      <p className="nota">HUB non legge le tue chat e non manda niente al posto tuo. Messaggi pronti e profili restano solo su questo iPad o iPhone. Versione {__VERSIONE__}.</p>
    </section>
  );
}

function StatoWa({ stato, setStato, avvisa }: { stato: Stato; setStato: React.Dispatch<React.SetStateAction<Stato>>; avvisa: (t: string) => void }) {
  const [esito, setEsito] = useState('');
  const imp = stato.impostazioni;
  if (!waConfigurato(imp)) return <CollegaIncolla setStato={setStato} avvisa={avvisa} />;
  const prova = async () => {
    setEsito('Provo…');
    try {
      const r = await waSalute(imp);
      setEsito(r.stato === 'collegato' ? `✅ Collegato (${r.numero}) · IA ${r.modello.replace(/:latest$/, '')}` : `⚠️ WhatsApp: ${r.stato}`);
    } catch (e) {
      setEsito('❌ ' + (e instanceof Error ? e.message : String(e)));
    }
  };
  return (
    <>
      <p className="nota">Indirizzo: {imp.waUrl}</p>
      <div className="riga">
        <button className="primario" onClick={prova}>Prova WhatsApp</button>
        <button className="secondario" onClick={() => { if (confirm('Scollegare WhatsApp da HUB su questo dispositivo?')) { setStato((s) => ({ ...s, impostazioni: { ...s.impostazioni, waUrl: '', waToken: '' } })); avvisa('Scollegato'); } }}>Scollega</button>
        <span data-testid="esito-wa">{esito}</span>
      </div>
    </>
  );
}

// Business: collegato su scelta di Marco (15/11/2026), sapendo del rischio di blocco del numero.
function StatoBusiness({ stato, avvisa }: { stato: Stato; avvisa: (t: string) => void }) {
  const imp = stato.impostazioni;
  const [st, setSt] = useState<{ stato: string; numero: string } | null>(null);
  const [errore, setErrore] = useState('');
  const [lavoro, setLavoro] = useState(false);
  const leggi = async () => {
    try {
      const r = await waSalute(imp, 'business');
      setSt({ stato: r.stato, numero: r.numero });
      setErrore('');
    } catch (e) {
      setErrore('❌ ' + (e instanceof Error ? e.message : String(e)));
    }
  };
  useEffect(() => {
    if (waConfigurato(imp)) leggi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp.waUrl, imp.waToken]);
  if (!waConfigurato(imp)) return <p className="nota">Collega prima il WhatsApp Personale qui sopra.</p>;
  const scollega = async () => {
    if (!confirm('Scollegare il WhatsApp Business da HUB? Sparisce anche da «Dispositivi collegati» sul telefono.')) return;
    setLavoro(true);
    try {
      await waScollega(imp, 'business');
      avvisa('Business scollegato da HUB');
      await leggi();
    } catch (e) {
      setErrore('❌ ' + (e instanceof Error ? e.message : String(e)));
    }
    setLavoro(false);
  };
  const collegato = st?.stato === 'collegato';
  return (
    <>
      <p className="nota">
        {st === null ? 'Controllo…' : collegato ? `✅ Collegato (${st.numero})` : st.stato === 'qr' ? 'In attesa del QR.' : 'Non collegato.'}
      </p>
      <p className="nota">Collegamento non ufficiale: WhatsApp potrebbe bloccare il numero. HUB invia solo dopo «Sì, invia», solo a chi ti ha già scritto, con almeno 15 secondi tra un invio e l’altro.</p>
      <div className="riga">
        {collegato ? (
          <button className="secondario" disabled={lavoro} onClick={scollega}>Scollega Business</button>
        ) : (
          <a className="bottone primario" href={paginaCollega(imp, 'business')} target="_blank" rel="noreferrer">Collega Business (QR)</a>
        )}
        <button className="secondario" onClick={leggi}>Aggiorna</button>
      </div>
      {errore && <p className="nota" role="alert">{errore}</p>}
    </>
  );
}

// Sull'iPhone/iPad l'icona sulla schermata Home ha una memoria sua, separata da Safari e Chrome:
// il link aperto nel browser non arriva all'icona. Qui lo si incolla a mano.
function CollegaIncolla({ setStato, avvisa }: { setStato: React.Dispatch<React.SetStateAction<Stato>>; avvisa: (t: string) => void }) {
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState('');
  const collega = (t: string) => {
    const wa = leggiCollegamentoDaTesto(t);
    if (!wa) {
      setErrore('Questo non è il link di collegamento. Sulla pagina «collega» del Mac mini tocca «Copia link» e riprova.');
      return;
    }
    setErrore('');
    setTesto('');
    setStato((s) => ({ ...s, attivo: 'personale', impostazioni: { ...s.impostazioni, ...wa, ia: 'nemotron' } }));
    avvisa('✅ WhatsApp collegato a HUB');
  };
  const [provo, setProvo] = useState(false);
  const unTocco = async () => {
    setProvo(true);
    setErrore('');
    try {
      const wa = await collegaDalMini();
      setStato((s) => ({ ...s, attivo: 'personale', impostazioni: { ...s.impostazioni, ...wa, ia: 'nemotron' } }));
      avvisa('✅ WhatsApp collegato a HUB');
    } catch (e) {
      setErrore('❌ ' + (e instanceof Error ? e.message : String(e)));
    }
    setProvo(false);
  };
  return (
    <>
      <p className="nota">Non collegato. Accendi Tailscale e tocca qui:</p>
      <div className="riga">
        <button className="primario" disabled={provo} onClick={unTocco}>{provo ? 'Collego…' : 'Collega WhatsApp'}</button>
      </div>
      {errore && <p className="nota" role="alert">{errore}</p>}
      <details>
        <summary className="nota">Non funziona? Incolla il link a mano</summary>
        <label className="etichetta">
          Link dalla pagina «collega» del Mac mini («Copia link»)
          <input value={testo} inputMode="url" autoCapitalize="off" autoCorrect="off" autoComplete="off" placeholder="https://bifulcma.github.io/hub/#/impostazioni?wa=…" onChange={(e) => setTesto(e.target.value)} />
        </label>
        <div className="riga">
          <button className="secondario" disabled={!testo.trim()} onClick={() => collega(testo)}>Collega</button>
        </div>
      </details>
    </>
  );
}

// ---------------------------------------------------------------- Anteprima con azioni finali
function Anteprima(props: {
  testo: string;
  app: string;
  nomeProfilo: string;
  firma: string;
  chiudi: () => void;
  salvaPronto: (t: string) => void;
  avvisa: (t: string) => void;
  destinatario?: { jid: string; nome: string } | null;
  inviaDiretto?: (t: string) => Promise<void>;
}) {
  const [testo, setTesto] = useState(props.testo);
  const [conFirma, setConFirma] = useState(!!props.firma.trim());
  const [conferma, setConferma] = useState(false);
  const [invio, setInvio] = useState(false);
  const [erroreInvio, setErroreInvio] = useState('');
  const dest = props.destinatario;
  const finale = conFirma && props.firma.trim() ? `${testo.trim()}\n${props.firma.trim()}` : testo.trim();

  const invia = async () => {
    const r = await condividi(finale);
    if (r === 'copiato') props.avvisa('Copiato: incollalo in ' + props.app);
    else if (r === 'errore') props.avvisa('Non riesco a condividere né a copiare');
    else if (r === 'annullato') props.avvisa('Foglio chiuso: il messaggio NON è stato inviato');
    if (r === 'condiviso') props.chiudi();
  };
  const inviaOra = async () => {
    if (!props.inviaDiretto) return;
    setInvio(true);
    setErroreInvio('');
    try {
      await props.inviaDiretto(finale);
      props.chiudi();
    } catch (e) {
      setErroreInvio(e instanceof Error ? e.message : String(e));
      setConferma(false);
    } finally {
      setInvio(false);
    }
  };
  const soloCopia = async () => {
    const r = await copia(finale);
    props.avvisa(r === 'copiato' ? 'Copiato' : 'Non riesco a copiare');
  };

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-label="Messaggio pronto da inviare" onClick={props.chiudi}>
      <div className="foglio" onClick={(e) => e.stopPropagation()} data-testid="anteprima">
        <div className="maniglia" />
        <h2>Il tuo messaggio</h2>
        <textarea rows={5} value={testo} onChange={(e) => setTesto(e.target.value)} />
        {props.firma.trim() && (
          <label className="interruttore">
            <input type="checkbox" checked={conFirma} onChange={(e) => setConFirma(e.target.checked)} /> Aggiungi firma
          </label>
        )}
        {dest ? (
          <>
            {!conferma ? (
              <button className="primario largo grande" data-testid="invia-wa" disabled={!testo.trim()} onClick={() => setConferma(true)}>
                Invia a {dest.nome}
              </button>
            ) : (
              <div className="conferma" data-testid="conferma-invio">
                <p>Mando questo messaggio a <b>{dest.nome}</b> dal tuo WhatsApp?</p>
                <div className="riga">
                  <button className="primario grande" disabled={invio} onClick={inviaOra} data-testid="conferma-si">{invio ? 'Invio…' : 'Sì, invia'}</button>
                  <button className="secondario" disabled={invio} onClick={() => setConferma(false)}>No</button>
                </div>
              </div>
            )}
            {erroreInvio && <div className="errore">{erroreInvio}</div>}
            <p className="ricorda">Parte dal tuo WhatsApp Personale, solo quando confermi.</p>
          </>
        ) : (
          <>
            <button className="primario largo grande" data-testid="condividi" disabled={!testo.trim()} onClick={invia}>Condividi</button>
            <p className="ricorda">Profilo {props.nomeProfilo} → nel foglio scegli <strong style={{ whiteSpace: 'nowrap' }}>{props.app}</strong></p>
          </>
        )}
        <div className="riga">
          <button className="secondario" disabled={!testo.trim()} onClick={soloCopia}>Copia</button>
          <button className="secondario" disabled={!testo.trim()} onClick={() => props.salvaPronto(testo)}>Salva nei Pronti</button>
          <button className="secondario" onClick={props.chiudi}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
