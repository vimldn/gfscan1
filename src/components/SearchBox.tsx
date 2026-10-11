"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, ScanBarcode } from "lucide-react";
import { cleanBarcode, isPlausibleBarcode } from "@/lib/barcode";
import { pushRecent } from "./recent";

const Scanner = dynamic(() => import("./Scanner").then((m) => m.Scanner), { ssr: false });

export function SearchBox({ initial = "", size = "lg", autoFocus = false }: { initial?: string; size?: "lg" | "md"; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [scan, setScan] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const digits = cleanBarcode(v);
    if (/^[\d\s-]+$/.test(v) && isPlausibleBarcode(digits)) {
      router.push(`/product/${digits}`);
      return;
    }
    pushRecent({ kind: "query", value: v, label: v });
    router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  const big = size === "lg";
  return (
    <>
      <form onSubmit={submit} role="search" className="w-full">
        <div className={`flex items-center gap-2 bg-white border-[3px] border-ink rounded-2xl ${big ? "p-2 pl-4" : "p-1.5 pl-3"} focus-within:shadow-[6px_6px_0_0_var(--color-lime)] transition-shadow`}>
          <Search aria-hidden size={big ? 24 : 20} className="shrink-0" />
          <label htmlFor="q" className="sr-only">Search products or enter a barcode</label>
          <input
            id="q"
            name="q"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={big ? "Product, brand or barcode" : "Search products"}
            className={`w-full min-w-0 bg-transparent outline-none ${big ? "text-lg sm:text-xl py-3" : "text-base py-2"} placeholder:text-muted`}
          />
          <button
            type="button"
            onClick={() => setScan(true)}
            className={`shrink-0 inline-flex items-center gap-2 rounded-xl border-2 border-ink font-bold ${big ? "px-3 py-3" : "px-2.5 py-2"} hover:bg-lime/40`}
            aria-label="Scan barcode with camera"
          >
            <ScanBarcode size={big ? 22 : 18} aria-hidden />
            <span className="hidden sm:inline">Scan</span>
          </button>
          <button type="submit" className={`shrink-0 rounded-xl bg-lime border-2 border-ink font-extrabold ${big ? "px-5 py-3" : "px-3 py-2"}`}>
            Check
          </button>
        </div>
      </form>
      {scan && <Scanner onClose={() => setScan(false)} />}
    </>
  );
}

export function ScanButton({ className = "" }: { className?: string }) {
  const [scan, setScan] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setScan(true)}
        className={`inline-flex items-center justify-center gap-3 rounded-2xl bg-ink text-white font-extrabold text-lg px-6 py-4 hover:bg-ink/90 ${className}`}
      >
        <ScanBarcode size={26} aria-hidden /> Scan a barcode
      </button>
      {scan && <Scanner onClose={() => setScan(false)} />}
    </>
  );
}
