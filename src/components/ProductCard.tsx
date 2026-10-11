import Link from "next/link";
import type { SearchResultItem } from "@/lib/service";
import { StatusBadge } from "./StatusBadge";
import { ProductImage } from "./ProductImage";
import { reasonLine } from "@/lib/present";

export function ProductCard({ item }: { item: SearchResultItem }) {
  const o = item.observation;
  const name = o.productName || "Unnamed product";
  return (
    <li>
      <Link
        href={`/product/${encodeURIComponent(item.barcode)}`}
        className="group flex gap-4 rounded-3xl border-2 border-line hover:border-ink p-3 sm:p-4 h-full transition-colors"
      >
        <ProductImage src={o.imageUrl} alt={name} className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted truncate">{o.brand || "Brand not recorded"}</p>
          <h3 className="font-extrabold leading-tight mt-0.5 line-clamp-2 group-hover:underline">{name}</h3>
          <p className="text-xs text-muted mt-1">
            {o.quantity ? `${o.quantity} · ` : ""}
            {item.barcode}
            {item.uk ? " · UK" : o.markets.length ? ` · ${o.markets.join(", ")}` : ""}
            {o.provider === "usda_fdc" ? " · USDA" : ""}
          </p>
          <div className="mt-2">
            <StatusBadge status={item.classification.status} size="sm" />
          </div>
          <p className="text-xs text-muted mt-1.5 line-clamp-2">{reasonLine(item.classification)}</p>
        </div>
      </Link>
    </li>
  );
}
