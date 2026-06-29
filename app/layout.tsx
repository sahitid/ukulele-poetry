import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["300", "400"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ukulele-poetry.vercel.app";
const description =
  "play a ukulele and a few lines of a poem show up, written live as it listens. nothing here is meant to be finished.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "ukulele poetry — the instrument that writes",
  description,
  openGraph: {
    type: "website",
    siteName: "ukulele poetry",
    title: "ukulele poetry",
    description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "ukulele poetry",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jetbrains.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
