import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registrazione Assemblea dei Soci 27/11/2026",
  description: "Gruppo Scout Cologno Monzese 1",
  robots: { index: false, follow: false },
  icons: { icon: "/logo.png", apple: "/logo.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1e293b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
