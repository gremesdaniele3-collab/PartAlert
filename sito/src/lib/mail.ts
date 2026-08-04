/**
 * Invio email tramite Resend (https://resend.com — 3.000 email al mese sul piano gratuito).
 *
 * Regole:
 *  - solo email transazionali: conferma iscrizione e notifiche richieste dall'utente
 *  - nessuna newsletter, nessuna promozione, nessun riepilogo periodico
 *  - link di cancellazione in ogni messaggio, più intestazione List-Unsubscribe
 */

const FROM = process.env.MAIL_FROM || "PartAlert <avvisi@partalert.it>";
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://partalert.vercel.app";

async function send(to: string, subject: string, html: string, unsubToken: string) {
  const k = process.env.RESEND_API_KEY;
  if (!k) { console.warn("[mail] RESEND_API_KEY assente, invio saltato"); return; }

  const unsub = `${BASE}/api/alerts/unsubscribe?t=${unsubToken}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM, to, subject,
      html: layout(html, unsub),
      headers: {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!r.ok) throw new Error(`Resend HTTP ${r.status}: ${await r.text()}`);
}

const eur = (c: number) => "€ " + (c / 100).toFixed(2).replace(".", ",");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function layout(body: string, unsub: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f5f6f7;
    font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#202124">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="font-size:19px;font-weight:700;margin-bottom:16px">Part<span style="color:#0B4F9E">Alert</span></div>
    <div style="background:#fff;border:1px solid #dadce0;border-radius:4px;padding:24px">${body}</div>
    <p style="font-size:12px;color:#80868b;line-height:1.6;margin-top:18px">
      Ricevi questo messaggio perché hai attivato un avviso su PartAlert.<br>
      <a href="${unsub}" style="color:#5f6368">Disattiva tutti i miei avvisi</a>
    </p>
  </div></body></html>`;
}

/** Passaggio obbligatorio: nessuna email viene inviata prima della conferma. */
export function sendConfirm(to: string, confirmToken: string, unsubToken: string, mpn: string) {
  return send(to, "Conferma il tuo avviso su PartAlert", `
    <h2 style="margin:0 0 12px;font-size:19px">Conferma l'avviso su ${esc(mpn)}</h2>
    <p style="font-size:14px;line-height:1.6;color:#5f6368;margin:0 0 20px">
      Clicca il pulsante per attivare l'avviso. Senza questa conferma non ti invieremo nulla
      e l'indirizzo verrà cancellato entro 48 ore.</p>
    <a href="${BASE}/api/alerts/confirm?t=${confirmToken}"
       style="display:inline-block;background:#0B4F9E;color:#fff;padding:12px 24px;
              border-radius:3px;font-weight:600;font-size:14px;text-decoration:none">Attiva l'avviso</a>
    <p style="font-size:12px;color:#80868b;margin:20px 0 0">
      Se non hai richiesto tu questo avviso, ignora il messaggio: non succederà nulla.</p>`, unsubToken);
}

/** Notifica di calo prezzo. */
export function sendPriceDrop(to: string, mpn: string, seller: string, priceC: number, prevC: number, targetC: number, unsubToken: string) {
  const pct = Math.round((1 - priceC / prevC) * 100);
  return send(to, `${mpn}: ${eur(priceC)} da ${seller}`, `
    <h2 style="margin:0 0 4px;font-size:19px">${esc(mpn)} è sceso a ${eur(priceC)}</h2>
    <p style="font-size:14px;color:#5f6368;margin:0 0 18px">
      Da ${esc(seller)}, ${pct}% in meno rispetto a ${eur(prevC)}. La tua soglia era ${eur(targetC)}.</p>
    <a href="${BASE}/part/${encodeURIComponent(mpn)}?utm_source=alert"
       style="display:inline-block;background:#0B4F9E;color:#fff;padding:12px 24px;
              border-radius:3px;font-weight:600;font-size:14px;text-decoration:none">Vedi tutte le offerte</a>
    <p style="font-size:12px;color:#80868b;margin:18px 0 0">
      Le giacenze cambiano in fretta: verifica il prezzo sul sito del distributore prima di ordinare.</p>`, unsubToken);
}

/** Notifica di rientro a magazzino. */
export function sendBackInStock(to: string, mpn: string, seller: string, qty: number, priceC: number | null, unsubToken: string) {
  return send(to, `${mpn} è di nuovo disponibile da ${seller}`, `
    <h2 style="margin:0 0 4px;font-size:19px">${esc(mpn)} è tornato disponibile</h2>
    <p style="font-size:14px;color:#5f6368;margin:0 0 18px">
      ${esc(seller)} ha ${qty.toLocaleString("it-IT")} pezzi a magazzino${priceC ? `, a partire da ${eur(priceC)}` : ""}.</p>
    <a href="${BASE}/part/${encodeURIComponent(mpn)}?utm_source=alert"
       style="display:inline-block;background:#0B4F9E;color:#fff;padding:12px 24px;
              border-radius:3px;font-weight:600;font-size:14px;text-decoration:none">Vedi tutte le offerte</a>
    <p style="font-size:12px;color:#80868b;margin:18px 0 0">
      Dopo una lunga carenza le scorte si esauriscono in fretta.</p>`, unsubToken);
}
