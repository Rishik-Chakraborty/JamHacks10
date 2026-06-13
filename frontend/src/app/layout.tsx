import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { Masthead } from "@/components/Masthead";
import { Providers } from "@/components/Providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "GymCast — Fitness Prediction Markets",
  description:
    "Back your discipline or doubt theirs. Public fitness goals, parimutuel markets, settled on Solana.",
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
        </Providers>
      </body>
    </html>
  );
}
