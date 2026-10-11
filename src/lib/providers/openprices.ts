/**
 * Open Prices adapter (optional). Docs: https://prices.openfoodfacts.org/api/docs
 * Licence: ODbL. Each price is a crowd-sourced observation with a date and location.
 */
import type { PriceObservation } from "../types";
import { fetchJson, TtlCache, type Result } from "../http";

interface OpItem {
  id?: number;
  price?: number;
  currency?: string;
  date?: string;
  location?: { osm_name?: string; osm_display_name?: string; osm_address_city?: string; osm_address_country?: string } | null;
}

const cache = new TtlCache<PriceObservation[]>(500);

export function openPricesEnabled(): boolean {
  return (process.env.ENABLE_OPEN_PRICES ?? "true") !== "false";
}

export function parseOpenPrices(items: OpItem[], barcode: string): PriceObservation[] {
  return items
    .filter((i) => typeof i.price === "number" && i.currency && i.date)
    .map((i) => ({
      price: i.price!,
      currency: i.currency!,
      date: i.date!,
      retailer: i.location?.osm_name ?? null,
      location: [i.location?.osm_address_city, i.location?.osm_address_country].filter(Boolean).join(", ") || null,
      sourceUrl: `https://prices.openfoodfacts.org/products/${encodeURIComponent(barcode)}`,
    }));
}

export async function openPricesFor(barcode: string): Promise<Result<PriceObservation[]>> {
  if (!openPricesEnabled()) return { ok: true, data: [] };
  const c = cache.get(barcode);
  if (c) return { ok: true, data: c };
  const r = await fetchJson<{ items?: OpItem[] }>(
    "open_prices",
    `${(process.env.OPEN_PRICES_BASE_URL || "https://prices.openfoodfacts.org").replace(/\/$/, "")}/api/v1/prices?product_code=${encodeURIComponent(barcode)}&order_by=-date&size=10`,
    { headers: { "User-Agent": process.env.OFF_USER_AGENT || "CanIEatThat/0.1" }, timeoutMs: 6000 },
  );
  if (!r.ok) return r;
  const prices = parseOpenPrices(r.data.items ?? [], barcode);
  cache.set(barcode, prices, 12 * 60 * 60 * 1000);
  return { ok: true, data: prices };
}
