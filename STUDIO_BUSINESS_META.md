# Studio: HUB e WhatsApp Business con la strada ufficiale di Meta

15/11/2026 — solo analisi, niente codice. Da decidere con Marco.

## La domanda
Marco ha sullo stesso telefono WhatsApp (Personale) e WhatsApp Business. Il Business, collegato per sbaglio con lo stesso metodo del Personale (Baileys), **funzionava**. Perché non tenerlo così?

## Risposta breve
- **Baileys sul Business funziona**, tecnicamente. Il limite è il **rischio di blocco del numero**: Baileys è un collegamento non ufficiale (imita WhatsApp Web) e va contro le regole di WhatsApp. Il rischio con pochi invii manuali è basso ma non misurabile, e c'è anche sul Personale. Per il Business un blocco costa di più: i clienti, il numero stampato su sito e biglietti.
- **La strada ufficiale esiste e si può tenere l'app sul telefono** («Coexistence»): stesso numero sia nell'app WhatsApp Business sia nell'API di Meta. Però serve un **intermediario** (fornitore ufficiale), costa circa **50 € al mese**, e i messaggi passano in chiaro dai server di Meta e del fornitore.

## Strada ufficiale: come funziona («Coexistence»)
Fonte: documentazione Meta «Onboarding WhatsApp Business app users (aka Coexistence)», aggiornata 20/04/2026.
- Il numero resta nell'**app WhatsApp Business** sul telefono: Marco può continuare a scrivere da lì. I messaggi dell'app non hanno il limite delle 24 ore.
- Lo stesso numero viene collegato alla **Cloud API** di Meta. HUB riceve i messaggi tramite webhook e invia tramite API.
- **Chi può attivarlo:** solo un *Solution Partner* o *Tech Provider* di Meta, tramite la procedura «Embedded Signup». Per Marco vuol dire usare un fornitore (es. 360dialog) oppure diventare lui Tech Provider, con verifica dell'azienda e revisione dell'app da parte di Meta: settimane di burocrazia.
- **Storico:** si possono importare i messaggi degli ultimi **180 giorni** (solo chat singole) entro 24 ore dall'attivazione.
- **Cosa si perde o cambia:**
  - i dispositivi collegati vengono scollegati (vanno ricollegati; WhatsApp per Windows e per WearOS non sono supportati);
  - i gruppi non passano dall'API;
  - messaggi effimeri spenti; «visualizza una volta» non disponibile;
  - liste broadcast disattivate;
  - secondo alcuni fornitori: nome dell'azienda non più modificabile, possibile perdita della spunta Meta Verified, backup della chat che cambiano;
  - è a senso unico: tornare indietro non è garantito.
- App WhatsApp Business: versione 2.24.17 o successiva.

## Costi (verificare prima di firmare)
- **Fornitore:** 360dialog, piano base ~**49 € al mese per numero** (prezzi letti su pagine di confronto, 2026; altri fornitori sono simili o più cari).
- **Meta, a messaggio consegnato** (dal 1/10/2026):
  - risposte ai clienti entro 24 ore dal loro messaggio («service»): **1.000 al mese gratis per numero**, poi a pagamento (Italia ~0,025 € l'una; dipende dal paese del destinatario);
  - messaggi che inizi tu dopo 24 ore: servono modelli approvati, Italia ~0,025 € (utilità) o ~0,066 € (marketing).
- **Stima per Marco** (poche decine di risposte al giorno, quasi tutte entro 24 ore): **circa 50 € al mese**, quasi tutto canone del fornitore.

## Privacy e regole di HUB
- Oggi (Baileys) i messaggi restano cifrati fino al Mac mini e stanno solo in RAM.
- Con la Cloud API i messaggi del Business vengono **decifrati sui server di Meta** e passano dal fornitore: va contro l'idea «nessun server di terzi». Serve l'ok esplicito di Marco (regola 2).
- Serve un **indirizzo pubblico** per il webhook: sul Mac mini con Tailscale Funnel, oppure ospitato dal fornitore. È una porta aperta su internet, da proteggere bene.

## Le tre strade, a confronto
| | Rischio blocco | Costo | Privacy | Lavoro |
|---|---|---|---|---|
| 1. Come adesso (Rispondi + Condividi) | nessuno | 0 | massima | nessuno |
| 2. Ufficiale (Coexistence + fornitore) | nessuno per il metodo | ~50 €/mese | i messaggi passano da Meta e dal fornitore | medio: account fornitore, webhook, adattare hub-wa |
| 3. Baileys anche sul Business | basso ma non misurabile; un blocco costa caro | 0 | come il Personale | piccolo: secondo collegamento sul Mini |

## Se Marco sceglie la 3: protezioni minime
Solo invii a mano dopo «Sì, invia» (già così); pausa tra invii più lunga per il Business; mai scrivere a chi non ha scritto prima; nessun invio a molte persone; un interruttore in HUB per scollegare il Business con un tocco.
