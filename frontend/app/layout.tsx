import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ThemeController from "@/components/ThemeController";

const interSans = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://alphavyuh.com"),
  title: "AlphaVyuh — Indian Equity Workflow Software",
  description: "Scan, chart, trade, and journal in one connected platform for Indian equity traders.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "AlphaVyuh — Indian Equity Workflow Software",
    description: "Scan, chart, trade, and journal in one connected platform for Indian equity traders.",
    url: "https://alphavyuh.com",
    siteName: "AlphaVyuh",
    images: [
      {
        url: "https://alphavyuh.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "AlphaVyuh Trading Platform",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlphaVyuh — Indian Equity Workflow Software",
    description: "Scan, chart, trade, and journal in one connected platform for Indian equity traders.",
    images: ["https://alphavyuh.com/og-image.png"],
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
    <html lang="en" data-theme="dark" className={`${interSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: "try{document.documentElement.dataset.theme=localStorage.getItem('alphavyuh-theme')==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans antialiased">
        <ThemeController />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
