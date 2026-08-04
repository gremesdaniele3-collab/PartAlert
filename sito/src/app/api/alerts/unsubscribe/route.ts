import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Cancellazione completa. Non disattiviamo soltanto: eliminiamo l'iscritto,
 * e per effetto a cascata tutti i suoi avvisi. Nessun dato residuo.
 * Funziona sia in GET (clic sul link) sia in POST (List-Unsubscribe one-click).
 */
async function handle(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (t) await db.subscriber.deleteMany({ where: { unsubToken: t } });
  return NextResponse.redirect(new URL("/avvisi?stato=cancellato", req.url));
}
export const GET = handle;
export const POST = handle;
