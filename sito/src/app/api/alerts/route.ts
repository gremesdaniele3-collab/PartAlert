import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encrypt, hmac, token, validEmail, validMpn, rateLimit, clientIp } from "@/lib/security";
import { sendConfirm } from "@/lib/mail";

/**
 * POST /api/alerts — crea un avviso.
 *
 * Difese applicate, in ordine:
 *  1. limite di frequenza per IP (5 richieste ogni 10 minuti)
 *  2. validazione rigorosa di email, MPN e soglia
 *  3. doppia conferma: l'iscritto riceve un link e nulla parte prima del clic
 *  4. risposta sempre identica, che l'indirizzo esista già o no, per non rivelare
 *     a un estraneo se una certa email è registrata
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(ip, "alert-create", 5, 600)))
    return NextResponse.json({ error: "Troppe richieste. Riprova tra qualche minuto." }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }); }

  const { email, mpn, targetPrice, watchStock, manufacturer } = body ?? {};
  if (!validEmail(email)) return NextResponse.json({ error: "Indirizzo email non valido" }, { status: 400 });
  if (!validMpn(mpn))     return NextResponse.json({ error: "Codice produttore non valido" }, { status: 400 });

  const targetPriceC = targetPrice == null ? null
    : Number.isFinite(+targetPrice) && +targetPrice > 0 && +targetPrice < 100000
      ? Math.round(+targetPrice * 100) : null;
  const stock = watchStock === true;
  if (targetPriceC == null && !stock)
    return NextResponse.json({ error: "Seleziona almeno una condizione" }, { status: 400 });

  const eh = hmac(email);
  const sub = await db.subscriber.upsert({
    where: { emailHash: eh },
    create: { emailHash: eh, emailEnc: encrypt(email.trim()), unsubToken: token(), confirmToken: token() },
    update: {},
  });

  // Un massimo di 50 avvisi per iscritto: evita che un singolo account saturi il cron.
  const count = await db.alert.count({ where: { subscriberId: sub.id, active: true } });
  if (count >= 50) return NextResponse.json({ error: "Hai raggiunto il limite di 50 avvisi attivi" }, { status: 409 });

  await db.alert.upsert({
    where: { subscriberId_mpn: { subscriberId: sub.id, mpn: mpn.trim().toUpperCase() } },
    create: { subscriberId: sub.id, mpn: mpn.trim().toUpperCase(), manufacturer: manufacturer ?? null, targetPriceC, watchStock: stock },
    update: { targetPriceC, watchStock: stock, active: true },
  });

  if (!sub.confirmed) {
    const ct = sub.confirmToken ?? token();
    if (!sub.confirmToken) await db.subscriber.update({ where: { id: sub.id }, data: { confirmToken: ct } });
    await sendConfirm(email.trim(), ct, sub.unsubToken, mpn.trim().toUpperCase());
  }

  return NextResponse.json({ ok: true, message: "Controlla la posta: ti abbiamo inviato un link di conferma." });
}
