import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Nav } from '@/components/Nav';
import { Ticker } from '@/components/Ticker';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GymCast',
  description:
    'BeReal × Polymarket for fitness — set a goal, post daily, let the crowd bet on whether you crush it.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <Nav />
          <main className="flex flex-1 flex-col pb-10">{children}</main>
          <Ticker />
        </Providers>
      </body>
    </html>
  );
}
