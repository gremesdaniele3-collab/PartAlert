import { PrismaClient } from "@prisma/client";

// In sviluppo Next ricarica i moduli a ogni modifica: senza questo si aprirebbero
// decine di connessioni al database.
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient({ log: ["warn", "error"] });
if (process.env.NODE_ENV !== "production") g.prisma = db;
