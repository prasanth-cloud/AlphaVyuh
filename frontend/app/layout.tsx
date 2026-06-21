import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Toaster } from "sonner";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ThemeController from "@/components/ThemeController";

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
  themeColor: "#0A0E13",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
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
      <body className={`${GeistSans.className} font-sans antialiased`}>
        <ThemeController />
        {children}
        <Toaster position="bottom-right" theme="dark" />
        <ServiceWorkerRegistrar />
        {process.env.NEXT_PUBLIC_DATA_MODE !== "mock" && <Analytics />}
      </body>
    </html>
  );
}
