// Condividi (foglio iOS: si sceglie WhatsApp o WhatsApp Business) con ripiego su Copia.

export type EsitoInvio = 'condiviso' | 'copiato' | 'annullato' | 'errore';

interface Nav {
  share?: (d: { text: string }) => Promise<void>;
  clipboard?: { writeText: (t: string) => Promise<void> };
}

export async function copia(testo: string, nav: Nav = navigator as unknown as Nav): Promise<EsitoInvio> {
  try {
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(testo);
      return 'copiato';
    }
  } catch {
    /* ripiego sotto */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = testo;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? 'copiato' : 'errore';
  } catch {
    return 'errore';
  }
}

export async function condividi(testo: string, nav: Nav = navigator as unknown as Nav): Promise<EsitoInvio> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text: testo });
      return 'condiviso';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'annullato';
    }
  }
  return copia(testo, nav);
}
