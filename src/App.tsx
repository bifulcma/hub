import { useEffect, useRef, useState } from 'react';
import { askBridge, provaPonte } from './ponte';
import {
  AZIONI,
  askConRiprova,
  erroreSemplice,
  leggiRisposte,
  NOMI_LINGUA,
  promptRispondi,
  promptScrivi,
  pulisciTesto,
  type AzioneScrivi,
} from './ai';
import { demoRispondi, demoScrivi } from './demo';
import { condividi, copia } from './invio';
import { carica, esporta, importa, nuovoId, ordinaPronti, ponteValido, salva, type Lingua, type ProfiloId, type Stato } from './store';

type Pagina = 'rispondi' | 'scrivi' | 'pronti' | 'impostazioni';

/** Messaggio arrivato da un Comando rapido: #/rispondi?t=<testo>&p=business */
function leggiArrivo(): { testo: string; profilo?: ProfiloId } {
  if (typeof location === 'undefined') return { testo: '' };
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const p = q.get('p');
  return { testo: q.get('t') || '', profilo: p === 'business' || p === 'personale' ? p : undefined };
}
const PAGINE: Pagina[] = ['rispondi', 'scrivi', 'pronti', 'impostazioni'];

function paginaDaHash(): Pagina {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '').split('?')[0];
  return (PAGINE as string[]).includes(h) ? (h as Pagina) : 'rispondi';
}

const Icona = ({ nome }: { nome: Pagina }) => {
  const d: Record<Pagina, string> = {
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

const ETICHETTE: Record<Pagina, string> = { rispondi: 'Rispondi', scrivi: 'Scrivi', pronti: 'Pronti', impostazioni: 'Impostazioni' };

export default function App() {
  const [stato, setStato] = useState<Stato>(() => {
    const s = carica();
    const q = leggiArrivo();
    return q.profilo ? { ...s, attivo: q.profilo } : s;
  });
  const [pagina, setPagina] = useState<Pagina>(paginaDaHash);
  const [toast, setToast] = useState('');
  const [nuovaVersione, setNuovaVersione] = useState<null | (() => void)>(null);
  const [bozza, setBozza] = useState<string | null>(null); // anteprima con azioni finali

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
  const demo = !stato.impostazioni.token.trim();
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
            Modalità prova: le risposte sono esempi finti. <a href="#/impostazioni">Collega Claude</a>
          </div>
        )}
      </header>

      <main className="contenuto">
        {pagina === 'rispondi' && <Rispondi stato={stato} demo={demo} apri={setBozza} avvisa={avvisa} />}
        {pagina === 'scrivi' && <Scrivi stato={stato} setStato={setStato} demo={demo} apri={setBozza} avvisa={avvisa} />}
        {pagina === 'pronti' && <Pronti stato={stato} setStato={setStato} apri={setBozza} />}
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
          chiudi={() => setBozza(null)}
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
        const raw = await askConRiprova({ bridgeUrl: stato.impostazioni.ponte, token: stato.impostazioni.token, provider: 'claude', system, prompt, signal: c.signal });
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
        r = pulisciTesto(await askConRiprova({ bridgeUrl: stato.impostazioni.ponte, token: stato.impostazioni.token, provider: 'claude', system, prompt, signal: c.signal }));
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
      r === 'ok' ? '✅ Collegato a Claude sullo Studio' : r === 'token' ? '❌ Token sbagliato' : r === 'irraggiungibile' ? '❌ Non raggiungo il ponte: Tailscale è acceso?' : '❌ Il ponte risponde con un errore',
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

      <h2>IA: Claude sul Mac Studio</h2>
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

// ---------------------------------------------------------------- Anteprima con azioni finali
function Anteprima(props: { testo: string; app: string; nomeProfilo: string; firma: string; chiudi: () => void; salvaPronto: (t: string) => void; avvisa: (t: string) => void }) {
  const [testo, setTesto] = useState(props.testo);
  const [conFirma, setConFirma] = useState(!!props.firma.trim());
  const finale = conFirma && props.firma.trim() ? `${testo.trim()}\n${props.firma.trim()}` : testo.trim();

  const invia = async () => {
    const r = await condividi(finale);
    if (r === 'copiato') props.avvisa('Copiato: incollalo in ' + props.app);
    else if (r === 'errore') props.avvisa('Non riesco a condividere né a copiare');
    else if (r === 'annullato') props.avvisa('Foglio chiuso: il messaggio NON è stato inviato');
    if (r === 'condiviso') props.chiudi();
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
        <button className="primario largo grande" data-testid="condividi" disabled={!testo.trim()} onClick={invia}>Condividi</button>
        <p className="ricorda">Profilo {props.nomeProfilo} → nel foglio scegli <strong style={{ whiteSpace: 'nowrap' }}>{props.app}</strong></p>
        <div className="riga">
          <button className="secondario" disabled={!testo.trim()} onClick={soloCopia}>Copia</button>
          <button className="secondario" disabled={!testo.trim()} onClick={() => props.salvaPronto(testo)}>Salva nei Pronti</button>
          <button className="secondario" onClick={props.chiudi}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
