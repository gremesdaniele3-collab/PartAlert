import type { Seller } from "./distributors";

/**
 * Adattatori verso le API dei distributori.
 *
 * Ogni distributore restituisce un formato diverso: valute diverse, scaglioni di prezzo
 * strutturati in modo diverso, giacenze espresse in modo diverso. Qui riduciamo tutto
 * a un'unica forma, `Offer`, prima di confrontare qualsiasi cosa.
 *
 * Se manca la chiave di un provider, quel provider viene semplicemente saltato:
 * il sito continua a funzionare con i distributori configurati.
 */

export type Offer = {
  seller: Seller;
  /** Prezzo unitario in centesimi di euro, per quantità 1. */
  priceC: number | null;
  /** Scaglioni: quantità minima -> prezzo unitario in centesimi. */
  breaks: { qty: number; priceC: number }[];
  stock: number;
  currency: "EUR";
  leadWeeks?: number;
  productUrl?: string;
};

export type PartResult = {
  mpn: string;
  manufacturer?: string;
  description?: string;
  packageType?: string;
  lifecycle?: string;
  rohs?: boolean;
  datasheet?: string;
  specs: Record<string, string>;
  offers: Offer[];
};

const toC = (v: number) => Math.round(v * 100);

/** Tassi di cambio verso euro. In produzione va sostituito con una fonte aggiornata quotidianamente. */
async function toEur(amount: number, currency: string): Promise<number> {
  if (currency === "EUR") return amount;
  const rates: Record<string, number> = { USD: 0.92, GBP: 1.17 };
  return amount * (rates[currency] ?? 1);
}

/* ------------------------------------------------------------------ Mouser */
/** Documentazione: https://www.mouser.it/api-hub/ — chiave gratuita, quota giornaliera. */
export async function fetchMouser(mpn: string): Promise<PartResult | null> {
  const k = process.env.MOUSER_API_KEY;
  if (!k) return null;
  const r = await fetch(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${k}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: mpn, partSearchOptions: "Exact" } }),
    next: { revalidate: 3600 },
  });
  if (!r.ok) throw new Error(`Mouser HTTP ${r.status}`);
  const j = await r.json();
  const p = j?.SearchResults?.Parts?.[0];
  if (!p) return null;

  const breaks: Offer["breaks"] = [];
  for (const b of p.PriceBreaks ?? []) {
    const raw = parseFloat(String(b.Price).replace(/[^\d.,]/g, "").replace(",", "."));
    if (!isFinite(raw)) continue;
    breaks.push({ qty: b.Quantity, priceC: toC(await toEur(raw, b.Currency || "EUR")) });
  }
  breaks.sort((a, b) => a.qty - b.qty);

  return {
    mpn: p.ManufacturerPartNumber,
    manufacturer: p.Manufacturer,
    description: p.Description,
    datasheet: p.DataSheetUrl,
    lifecycle: p.LifecycleStatus,
    rohs: /compliant/i.test(p.ROHSStatus ?? ""),
    specs: Object.fromEntries((p.ProductAttributes ?? []).map((a: any) => [a.AttributeName, a.AttributeValue])),
    offers: [{
      seller: "Mouser",
      priceC: breaks[0]?.priceC ?? null,
      breaks,
      stock: parseInt(String(p.AvailabilityInStock ?? "0").replace(/\D/g, "")) || 0,
      currency: "EUR",
      leadWeeks: parseInt(String(p.LeadTime ?? "").replace(/\D/g, "")) || undefined,
      productUrl: p.ProductDetailUrl,
    }],
  };
}

/* ----------------------------------------------------------------- DigiKey */
/** DigiKey usa OAuth2 client credentials. Il token dura 10 minuti e viene riusato. */
let dkToken: { value: string; exp: number } | null = null;
async function digikeyToken(): Promise<string | null> {
  const id = process.env.DIGIKEY_CLIENT_ID, secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (dkToken && dkToken.exp > Date.now() + 30_000) return dkToken.value;

  const r = await fetch("https://api.digikey.com/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`DigiKey OAuth HTTP ${r.status}`);
  const j = await r.json();
  dkToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return dkToken.value;
}

export async function fetchDigiKey(mpn: string): Promise<PartResult | null> {
  const tok = await digikeyToken();
  if (!tok) return null;
  const r = await fetch(`https://api.digikey.com/products/v4/search/${encodeURIComponent(mpn)}/productdetails`, {
    headers: {
      Authorization: `Bearer ${tok}`,
      "X-DIGIKEY-Client-Id": process.env.DIGIKEY_CLIENT_ID!,
      "X-DIGIKEY-Locale-Site": "IT",
      "X-DIGIKEY-Locale-Language": "it",
      "X-DIGIKEY-Locale-Currency": "EUR",
    },
    next: { revalidate: 3600 },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`DigiKey HTTP ${r.status}`);
  const p = (await r.json())?.Product;
  if (!p) return null;

  const v = p.ProductVariations?.[0];
  const breaks = (v?.StandardPricing ?? []).map((b: any) => ({
    qty: b.BreakQuantity, priceC: toC(b.UnitPrice),
  })).sort((a: any, b: any) => a.qty - b.qty);

  return {
    mpn: p.ManufacturerProductNumber,
    manufacturer: p.Manufacturer?.Name,
    description: p.Description?.ProductDescription,
    datasheet: p.DatasheetUrl,
    lifecycle: p.ProductStatus?.Status,
    rohs: /compliant/i.test(p.Classifications?.RohsStatus ?? ""),
    packageType: v?.PackageType?.Name,
    specs: Object.fromEntries((p.Parameters ?? []).map((a: any) => [a.ParameterText, a.ValueText])),
    offers: [{
      seller: "DigiKey",
      priceC: breaks[0]?.priceC ?? null,
      breaks,
      stock: p.QuantityAvailable ?? 0,
      currency: "EUR",
      leadWeeks: p.ManufacturerLeadWeeks ? parseInt(p.ManufacturerLeadWeeks) : undefined,
      productUrl: p.ProductUrl,
    }],
  };
}

/* ----------------------------------------------------- Farnell / element14 */
/** API pubblica con chiave gratuita: https://partner.element14.com */
export async function fetchFarnell(mpn: string): Promise<PartResult | null> {
  const k = process.env.FARNELL_API_KEY;
  if (!k) return null;
  const u = new URL("https://api.element14.com/catalog/products");
  u.searchParams.set("term", `manuPartNum:${mpn}`);
  u.searchParams.set("storeInfo.id", "it.farnell.com");
  u.searchParams.set("resultsSettings.responseGroup", "large");
  u.searchParams.set("callInfo.responseDataFormat", "json");
  u.searchParams.set("callInfo.apiKey", k);
  u.searchParams.set("versionNumber", "1.4");

  const r = await fetch(u, { next: { revalidate: 3600 } });
  if (!r.ok) throw new Error(`Farnell HTTP ${r.status}`);
  const p = (await r.json())?.manufacturerPartNumberSearchReturn?.products?.[0];
  if (!p) return null;

  const breaks = (p.prices ?? []).map((b: any) => ({ qty: b.from, priceC: toC(b.cost) }))
    .sort((a: any, b: any) => a.qty - b.qty);

  return {
    mpn: p.translatedManufacturerPartNumber,
    manufacturer: p.brandName,
    description: p.displayName,
    datasheet: p.datasheets?.[0]?.url,
    rohs: p.rohsStatusCode === "1",
    specs: Object.fromEntries((p.attributes ?? []).map((a: any) => [a.attributeLabel, `${a.attributeValue} ${a.attributeUnit ?? ""}`.trim()])),
    offers: [{
      seller: "Farnell",
      priceC: breaks[0]?.priceC ?? null,
      breaks,
      stock: p.stock?.level ?? 0,
      currency: "EUR",
      leadWeeks: p.stock?.leastLeadTime ? Math.ceil(p.stock.leastLeadTime / 7) : undefined,
    }],
  };
}

/* --------------------------------------------------------------- aggregato */
const PROVIDERS = [
  { name: "Mouser", fn: fetchMouser },
  { name: "DigiKey", fn: fetchDigiKey },
  { name: "Farnell", fn: fetchFarnell },
];

/**
 * Interroga tutti i provider configurati in parallelo e unisce i risultati.
 * Il fallimento di un provider non fa fallire la richiesta: si perde quell'offerta e basta.
 */
export async function fetchPart(mpn: string): Promise<PartResult | null> {
  const results = await Promise.allSettled(PROVIDERS.map((p) => p.fn(mpn)));

  const ok: PartResult[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) ok.push(r.value);
    else if (r.status === "rejected") console.error(`[providers] ${PROVIDERS[i].name}:`, r.reason?.message);
  });
  if (!ok.length) return null;

  // Il primo risultato con i metadati più completi fa da base; le offerte si sommano.
  const base = ok.reduce((a, b) => (Object.keys(b.specs).length > Object.keys(a.specs).length ? b : a));
  return {
    ...base,
    specs: Object.assign({}, ...ok.map((r) => r.specs)),
    offers: ok.flatMap((r) => r.offers),
  };
}

/** Miglior prezzo tra i distributori che hanno effettivamente giacenza. */
export function bestOffer(offers: Offer[]): Offer | null {
  const inStock = offers.filter((o) => o.stock > 0 && o.priceC != null);
  if (!inStock.length) return null;
  return inStock.reduce((a, b) => (b.priceC! < a.priceC! ? b : a));
}
