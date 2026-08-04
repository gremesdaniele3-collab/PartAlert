import crypto from "crypto";
import { db } from "./db";

/**
 * Sicurezza dei dati personali.
 *
 * L'unico dato personale che PartAlert tratta è l'indirizzo email.
 * Regole applicate qui:
 *  - a riposo l'email è cifrata con AES-256-GCM (chiave in variabile d'ambiente, mai nel codice)
 *  - per cercare un iscritto si usa un HMAC-SHA256, che è deterministico ma non reversibile
 *  - i token (conferma, cancellazione, click) sono casuali a 256 bit
 *  - i confronti fra token usano timingSafeEqual per evitare attacchi a tempo
 */

function key(name: "ENCRYPTION_KEY" | "HMAC_KEY"): Buffer {
  const v = process.env[name];
  if (!v) throw new Error(`Variabile d'ambiente ${name} mancante`);
  const b = Buffer.from(v, "base64");
  if (b.length !== 32) throw new Error(`${name} deve essere 32 byte in base64`);
  return b;
}

/** Cifra un testo. Restituisce iv:tag:ciphertext in base64. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key("ENCRYPTION_KEY"), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(":");
}

/** Decifra un valore prodotto da encrypt(). */
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(":").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key("ENCRYPTION_KEY"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** Impronta deterministica per le ricerche. Non permette di risalire all'email. */
export function hmac(value: string): string {
  return crypto.createHmac("sha256", key("HMAC_KEY")).update(value.trim().toLowerCase()).digest("hex");
}

/** Token casuale a 256 bit, sicuro per link in email. */
export function token(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Confronto a tempo costante fra due token. */
export function tokenEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Validazione email conservativa: sintassi corretta e lunghezza limitata. */
export function validEmail(e: string): boolean {
  return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e.trim());
}

/** Un MPN è alfanumerico con separatori. Blocca tentativi di injection nei parametri di ricerca. */
export function validMpn(m: string): boolean {
  return typeof m === "string" && m.length >= 2 && m.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9._/+-]*$/.test(m.trim());
}

/**
 * Limite di frequenza per indirizzo IP.
 * L'IP non viene mai salvato in chiaro: la chiave è un HMAC dell'IP e della finestra temporale.
 */
export async function rateLimit(ip: string, bucket: string, max: number, windowSec: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const k = hmac(`${bucket}:${ip}:${window}`);
  const expiresAt = new Date((window + 1) * windowSec * 1000);

  const row = await db.rateLimit.upsert({
    where: { key: k },
    create: { key: k, hits: 1, expiresAt },
    update: { hits: { increment: 1 } },
  });
  return row.hits <= max;
}

/** Estrae l'IP del chiamante dagli header dell'edge di Vercel. */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "0.0.0.0";
}

/** Intestazioni di sicurezza applicate a tutte le risposte (vedi next.config.js). */
export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};
