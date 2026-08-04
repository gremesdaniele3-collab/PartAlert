import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/alerts/confirm?t=... — attiva l'iscritto e consuma il token. */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.redirect(new URL("/avvisi?stato=errore", req.url));

  const sub = await db.subscriber.findUnique({ where: { confirmToken: t } });
  if (!sub) return NextResponse.redirect(new URL("/avvisi?stato=scaduto", req.url));

  // Il token è monouso.
  await db.subscriber.update({ where: { id: sub.id }, data: { confirmed: true, confirmToken: null } });
  return NextResponse.redirect(new URL("/avvisi?stato=confermato", req.url));
}
