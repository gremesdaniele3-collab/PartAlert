import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { token, validMpn } from "@/lib/security";
import { sellerUrl, AFFILIATE_INFO, SELLERS, type Seller } from "@/lib/distributors";

/**
 * GET /api/go?mpn=...&seller=...&src=... — reindirizzamento tracciato verso il distributore.
 *
 * È il punto in cui si genera la commissione:
 *  - creiamo un clickRef casuale e lo salviamo
 *  - lo passiamo al network di affiliazione dentro l'URL
 *  - quando il network riporta una vendita con quel clickRef, sai da quale codice è arrivata
 *
 * Non registriamo IP, user agent né identificativi dell'utente: solo codice, distributore e origine.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const mpn = q.get("mpn") ?? "", seller = q.get("seller") ?? "";

  if (!validMpn(mpn) || !SELLERS.includes(seller as Seller))
    return NextResponse.redirect(new URL("/", req.url));

  const clickRef = token().slice(0, 24);
  const src = (q.get("src") ?? "part").slice(0, 24);

  // Il tracciamento non deve mai impedire il reindirizzamento.
  try {
    await db.outboundClick.create({
      data: {
        mpn: mpn.toUpperCase(), seller, clickRef, source: src,
        network: AFFILIATE_INFO[seller as Seller].network,
        country: req.headers.get("x-vercel-ip-country") ?? null,
      },
    });
  } catch (e) { console.error("[go] tracciamento fallito:", e); }

  const res = NextResponse.redirect(sellerUrl(seller as Seller, mpn.toUpperCase(), clickRef), 302);
  // Il distributore non deve vedere da quale pagina interna arriva il click.
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
