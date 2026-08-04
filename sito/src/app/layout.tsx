import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "PartAlert — Confronto prezzi componenti elettronici",
  description: "Confronta prezzi e disponibilità di componenti elettronici su 6 distributori. Avvisi automatici su calo prezzo e rientro in stock.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="it"><body>{children}</body></html>;
}
