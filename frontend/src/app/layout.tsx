import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Masthead } from "@/components/Masthead";
import { Ticker } from "@/components/Ticker";
import { OnboardingGate } from "@/components/OnboardingGate";

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
          <main className="flex-1 w-full pb-16">{children}</main>
          <Ticker />
          <OnboardingGate />
        </Providers>
      </body>
    </html>
  );
}
