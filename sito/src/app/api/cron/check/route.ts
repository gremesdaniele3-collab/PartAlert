import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/security";
import { sendPriceDrop, sendBackInStock } from "@/lib/mail";

/**
 * GET /api/cron/check — eseguito ogni ora da Vercel Cron.
 *
 * Logica:
 *  1. Prende tutti i codici produttore che hanno almeno un avviso attivo
 *  2. Per ogni codice interroga le API dei distributori
 *  3. Confronta il risultato con lo stato salvato (PartState)
 *  4. Se c'è una transizione (prezzo sceso sotto soglia, o stock 0→N), invia le email
 *  5. Aggiorna PartState e PriceSnapshot
 *
 * In produzione con le API key reali: i dati arrivano dai distributori.
 * Senza API key: usa i dati del catalogo locale come fallback.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const alerts = await db.alert.findMany({
    where: { active: true, subscriber: { confirmed: true } },
    include: { subscriber: true },
  });

  const byMpn = new Map<string, typeof alerts>();
  for (const a of alerts) {
    const list = byMpn.get(a.mpn) ?? [];
    list.push(a);
    byMpn.set(a.mpn, list);
  }

  let fired = 0;
  for (const [mpn, mpnAlerts] of byMpn) {
    try {
      // Leggi stato precedente
      const prev = await db.partState.findUnique({ where: { mpn } });

      // In produzione qui chiami fetchPart(mpn) — vedi src/lib/providers.ts
      // Per ora usiamo i dati del catalogo locale come simulazione
      const catalog = await import("@/../data/catalog.json");
      const part = (catalog as any).parts.find((p: any) => p.mpn === mpn);
      if (!part) continue;

      const offers = part.of as [string, number, number, number][];
      const inStock = offers.filter(o => o[2] > 0);
      const bestPrice = inStock.length
        ? Math.min(...inStock.map(o => Math.round(o[1] * 100))) : null;
      const bestSeller = inStock.length
        ? inStock.reduce((a, b) => b[1] < a[1] ? b : a)[0] : null;
      const totalStock = offers.reduce((s, o) => s + o[2], 0);
      const stockByDist = Object.fromEntries(offers.map(o => [o[0], o[2]]));

      // Salva snapshot
      await db.priceSnapshot.create({
        data: { mpn, seller: bestSeller ?? "n/d", priceC: bestPrice ?? 0, stock: totalStock },
      });

      // Controlla transizioni e notifica
      for (const alert of mpnAlerts) {
        const email = decrypt(alert.subscriber.emailEnc);

        // Avviso prezzo
        if (alert.targetPriceC != null && bestPrice != null) {
          const prevPrice = prev?.bestPriceC ?? null;
          if (bestPrice <= alert.targetPriceC && (prevPrice == null || prevPrice > alert.targetPriceC)) {
            await sendPriceDrop(email, mpn, bestSeller!, bestPrice, prevPrice ?? bestPrice + 1, alert.targetPriceC, alert.subscriber.unsubToken);
            await db.alert.update({ where: { id: alert.id }, data: { lastFiredAt: new Date(), fireCount: { increment: 1 } } });
            fired++;
          }
        }

        // Avviso stock
        if (alert.watchStock) {
          const prevStock = (prev?.stockByDist as Record<string, number>) ?? {};
          for (const offer of offers) {
            const [seller, price, qty] = offer;
            const wasZero = (prevStock[seller] ?? 0) === 0;
            if (wasZero && qty > 0) {
              await sendBackInStock(email, mpn, seller, qty, Math.round(price * 100), alert.subscriber.unsubToken);
              await db.alert.update({ where: { id: alert.id }, data: { lastFiredAt: new Date(), fireCount: { increment: 1 } } });
              fired++;
              break;
            }
          }
        }
      }

      // Aggiorna stato
      await db.partState.upsert({
        where: { mpn },
        create: { mpn, bestPriceC: bestPrice, bestSeller, totalStock, stockByDist, checkedAt: new Date() },
        update: { bestPriceC: bestPrice, bestSeller, totalStock, stockByDist, checkedAt: new Date(), failCount: 0 },
      });

    } catch (e) {
      console.error(`[cron] errore su ${mpn}:`, e);
      await db.partState.upsert({
        where: { mpn },
        create: { mpn, stockByDist: {}, checkedAt: new Date(), failCount: 1 },
        update: { failCount: { increment: 1 }, checkedAt: new Date() },
      });
    }
  }

  return NextResponse.json({ ok: true, codiciscontrollati: byMpn.size, notificheinviate: fired });
}
