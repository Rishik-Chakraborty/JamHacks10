import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Masthead } from "@/components/Masthead";
import { Ticker } from "@/components/Ticker";
import { MobileTabBar } from "@/components/MobileTabBar";
import { PWARegister } from "@/components/PWARegister";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Archivo family at black weights — the "Archivo Black" headline look, with a
// usable weight range so buttons/labels render properly (no synthetic bold).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "the gainsXchange — Bet on the grind",
  description:
    "Challenge fitness influencers and bet on whether they deliver. An Instagram-style feed, parimutuel lines, settled on Solana.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "gainsXchange" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#17150f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable}`}
    >
      <body className="min-h-screen flex flex-col bg-paper text-ink">
        <Providers>
          <Masthead />
          <main className="flex-1 w-full pb-24 md:pb-16">{children}</main>
          {/* Activity ticker on desktop; the bottom tab bar replaces it on mobile. */}
          <div className="hidden md:block">
            <Ticker />
          </div>
          <MobileTabBar />
          <PWARegister />
        </Providers>
      </body>
    </html>
  );
}
