"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { clearRecent, readRecent, type RecentItem } from "./recent";

export function RecentSearches() {
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => setItems(readRecent()), []);
  if (!items.length) return null;
  return (
    <section aria-labelledby="recent-h" className="mt-10">
      <div className="flex items-center justify-between">
        <h2 id="recent-h" className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-2">
          <History size={16} aria-hidden /> Recently searched
        </h2>
        <button className="text-sm underline text-muted" onClick={() => (clearRecent(), setItems([]))}>Clear</button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((r) => (
          <li key={`${r.kind}:${r.value}`}>
            <Link
              href={r.kind === "product" ? `/product/${r.value}` : `/search?q=${encodeURIComponent(r.value)}`}
              className="inline-block rounded-full border-2 border-line hover:border-ink px-4 py-2 text-sm font-semibold max-w-[16rem] truncate"
            >
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RememberProduct({ barcode, label }: { barcode: string; label: string }) {
  useEffect(() => {
    import("./recent").then((m) => m.pushRecent({ kind: "product", value: barcode, label }));
  }, [barcode, label]);
  return null;
}
