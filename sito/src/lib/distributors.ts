/**
 * Link ai distributori e gestione delle commissioni.
 *
 * Come funziona il guadagno:
 *  1. L'utente clicca "Vai al sito" sulla scheda di un componente.
 *  2. Il click passa da /api/go, che registra un clickRef e reindirizza.
 *  3. L'URL di destinazione include i parametri di tracciamento del network di affiliazione.
 *  4. Se l'utente compra, il network attribuisce la vendita al clickRef e accredita la commissione.
 *
 * Finché non hai gli ID di affiliazione, le variabili d'ambiente restano vuote:
 * i link funzionano lo stesso, semplicemente senza commissione. Non serve toccare il codice.
 */

export type Seller = "DigiKey" | "Mouser" | "Farnell" | "RS" | "TME" | "LCSC";

/** URL di ricerca ufficiale di ogni distributore, versione italiana dove esiste. */
const SEARCH: Record<Seller, (mpn: string) => string> = {
  DigiKey: (m) => `https://www.digikey.it/it/products/result?keywords=${encodeURIComponent(m)}`,
  Mouser:  (m) => `https://www.mouser.it/c/?q=${encodeURIComponent(m)}`,
  Farnell: (m) => `https://it.farnell.com/search?st=${encodeURIComponent(m)}`,
  RS:      (m) => `https://it.rs-online.com/web/c/?searchTerm=${encodeURIComponent(m)}`,
  TME:     (m) => `https://www.tme.eu/it/katalog/?search=${encodeURIComponent(m)}`,
  LCSC:    (m) => `https://www.lcsc.com/search?q=${encodeURIComponent(m)}`,
};

/** Rete di affiliazione usata da ciascun distributore e commissione indicativa. */
export const AFFILIATE_INFO: Record<Seller, { network: string; note: string }> = {
  RS:      { network: "awin",   note: "Awin — commissione indicativa 5%, cookie 45 giorni" },
  Farnell: { network: "awin",   note: "Awin — da verificare in fase di candidatura" },
  Mouser:  { network: "diretto", note: "Programma referral Mouser — richiesta diretta" },
  DigiKey: { network: "impact", note: "Impact — programma DigiKey" },
  TME:     { network: "diretto", note: "Da verificare con TME" },
  LCSC:    { network: "diretto", note: "Distributore indipendente, programma non garantito" },
};

/**
 * Costruisce l'URL finale, con i parametri di affiliazione se configurati.
 * clickRef viene passato al network per riconciliare la vendita con il click.
 */
export function sellerUrl(seller: Seller, mpn: string, clickRef: string): string {
  const target = SEARCH[seller](mpn);
  const net = AFFILIATE_INFO[seller].network;

  if (net === "awin") {
    const mid = process.env[`AWIN_MID_${seller.toUpperCase()}`];
    const aff = process.env.AWIN_AFFILIATE_ID;
    if (!mid || !aff) return target;
    // Formato deep link Awin: ued contiene l'URL di destinazione, clickref il nostro riferimento.
    return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${aff}` +
           `&clickref=${encodeURIComponent(clickRef)}&ued=${encodeURIComponent(target)}`;
  }

  if (net === "impact") {
    const campaign = process.env.IMPACT_CAMPAIGN_DIGIKEY;
    if (!campaign) return target;
    return `${campaign}?u=${encodeURIComponent(target)}&subId1=${encodeURIComponent(clickRef)}`;
  }

  // Programmi diretti: di solito un parametro nella query string.
  const direct = process.env[`AFF_PARAM_${seller.toUpperCase()}`]; // es. "utm_source=partalert&aff=12345"
  if (!direct) return target;
  return `${target}${target.includes("?") ? "&" : "?"}${direct}&subid=${encodeURIComponent(clickRef)}`;
}

/** Link al datasheet: Octopart aggrega i datasheet ufficiali dei produttori. */
export function datasheetUrl(mpn: string): string {
  return `https://octopart.com/search?q=${encodeURIComponent(mpn)}`;
}

export const SELLERS: Seller[] = ["DigiKey", "Mouser", "Farnell", "RS", "TME", "LCSC"];

/** Distributori autorizzati dai produttori (rilevante per il rischio di contraffazione). */
export const AUTHORIZED: Record<Seller, boolean> = {
  DigiKey: true, Mouser: true, Farnell: true, RS: true, TME: true, LCSC: false,
};
