import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Can I Eat That? — Gluten-free product checker", template: "%s · Can I Eat That?" },
  description:
    "Search or scan UK packaged food and see what the food data actually says about gluten — with sources, dates and uncertainty shown.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 bg-lime px-3 py-2 rounded-lg z-50">
          Skip to content
        </a>
        <header className="border-b border-line">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-black tracking-tight text-lg">
              CAN I EAT THAT<span className="text-lime-deep">?</span>
            </Link>
            <nav className="flex gap-4 text-sm font-semibold">
              <Link href="/sources" className="hover:underline">Sources &amp; rules</Link>
              <Link href="/api-docs" className="hover:underline hidden sm:inline">API</Link>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="border-t border-line mt-16">
          <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted space-y-2">
            <p>
              <strong className="text-ink">Not medical advice.</strong> Results show what source data says. Always read the packaging — recipes change.
              No AI or probabilistic model decides any result.
            </p>
            <p>
              Product data from{" "}
              <a className="underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>{" "}
              (ODbL). Alerts from the{" "}
              <a className="underline" href="https://www.food.gov.uk/news-alerts/search/alerts" target="_blank" rel="noreferrer">Food Standards Agency</a>{" "}
              (OGL v3). <Link href="/sources" className="underline">Full attribution</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
