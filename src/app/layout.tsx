import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { APP_NAME } from "@/lib/examples";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });


const DESCRIPTION = "Find the podcasts, creators, neighbourhoods and collab brands your customers already love, ranked by value for small brands. Built on Qloo taste data.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://sponsor-scout.vercel.app"),
  title: APP_NAME,
  description: DESCRIPTION,
  openGraph: { title: APP_NAME, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: APP_NAME, description: DESCRIPTION },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased min-h-screen`}>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-display text-xl font-semibold tracking-tight">
              {APP_NAME}
            </Link>
            <span className="text-xs text-muted">Taste data by Qloo</span>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted">
          Affinity, popularity, demographics and heatmaps come from the Qloo Insights API. The language model only plans the steps and writes text; it never supplies numbers.
        </footer>
      </body>
    </html>
  );
}
