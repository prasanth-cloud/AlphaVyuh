import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const inter = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.alphavyuh.com"),
  title: "AlphaVyuh — Trading OS for Indian Markets",
  description: "Scan → Analyse → Trade → Journal → Improve. Built for NSE/BSE swing traders.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: "https://www.alphavyuh.com/",
    siteName: "AlphaVyuh",
    title: "AlphaVyuh — India's Trading OS",
    description: "Scan, chart, trade, and journal in one connected platform for Indian equity traders.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AlphaVyuh trading platform homepage preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AlphaVyuh — India's Trading OS",
    description: "Scan, chart, trade, and journal in one connected platform for Indian equity traders.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AlphaVyuh",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1c1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
