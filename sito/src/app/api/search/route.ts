import { NextRequest, NextResponse } from "next/server";
import { validMpn, rateLimit, clientIp } from "@/lib/security";

export async function GET(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(ip, "search", 30, 60)))
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const cat = req.nextUrl.searchParams.get("cat") ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const catalog = await import("@/../data/catalog.json");
  const results = (catalog as any).parts
    .filter((p: any) =>
      (!cat || p.cat === cat) &&
      (p.mpn.toLowerCase().includes(q) ||
       p.mfr.toLowerCase().includes(q) ||
       p.desc.toLowerCase().includes(q)))
    .slice(0, 10)
    .map((p: any) => ({
      mpn: p.mpn, mfr: p.mfr, desc: p.desc, pkg: p.pkg, cat: p.cat,
      bestPrice: (() => {
        const inStock = p.of.filter((o: any) => o[2] > 0);
        return inStock.length ? Math.min(...inStock.map((o: any) => o[1])) : null;
      })(),
    }));

  return NextResponse.json(results);
}
