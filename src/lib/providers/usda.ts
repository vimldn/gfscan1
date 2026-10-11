/**
 * USDA FoodData Central adapter (Branded Foods).
 * Docs: https://fdc.nal.usda.gov/api-guide/  — public domain (CC0) data.
 * Requires USDA_FDC_API_KEY (server-side only).
 *
 * Only EXACT GTIN matches are accepted. Products sharing a brand or name are
 * never merged.
 */
import type { SourceObservation } from "../types";
import { fetchJson, TtlCache, type Result } from "../http";
import { sameGtin } from "../barcode";

export interface FdcFood {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  ingredients?: string;
  marketCountry?: string;
  packageWeight?: string;
  householdServingFullText?: string;
  publishedDate?: string;
  modifiedDate?: string;
  dataSource?: string;
  dataType?: string;
}

const cache = new TtlCache<{ foods: FdcFood[]; fetchedAt: string }>(500);
const TTL = 24 * 60 * 60 * 1000;

export function usdaConfigured(): boolean {
  return !!process.env.USDA_FDC_API_KEY;
}

function parseUsDate(s?: string): string | null {
  if (!s) return null;
  // FDC uses YYYY-MM-DD or MM/DD/YYYY depending on endpoint
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function fdcFoodToObservation(f: FdcFood, fetchedAt: string): SourceObservation {
  const market = (f.marketCountry ?? "United States").toLowerCase();
  const markets = market.includes("united states") ? ["US"] : [];
  const lastMod = parseUsDate(f.modifiedDate) ?? parseUsDate(f.publishedDate);
  return {
    id: `usda_fdc:${f.fdcId}:${f.modifiedDate ?? f.publishedDate ?? "na"}`,
    provider: "usda_fdc",
    providerName: "USDA FoodData Central",
    sourceType: "government_database",
    providerRecordId: String(f.fdcId),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients`,
    licence: "CC0 1.0 (public domain)",
    attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.",
    barcode: f.gtinUpc ?? "",
    productName: f.description ?? null,
    brand: f.brandName || f.brandOwner || null,
    quantity: f.packageWeight ?? null,
    imageUrl: null,
    countries: f.marketCountry ? [f.marketCountry] : ["United States"],
    markets,
    ingredientsText: f.ingredients ?? null,
    ingredientsLang: f.ingredients ? "en" : null,
    // FDC has no completeness flag and no structured allergen/claim fields.
    ingredientsComplete: null,
    allergens: null,
    traces: null,
    labels: null,
    gfClaims: [],
    completenessScore: null,
    sourceLastModified: lastMod,
    fetchedAt,
  };
}

export async function usdaByGtin(barcode: string): Promise<Result<{ foods: FdcFood[]; fetchedAt: string }>> {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) return { ok: false, error: { provider: "usda_fdc", kind: "config", message: "USDA_FDC_API_KEY not set" } };
  const cached = cache.get(barcode);
  if (cached) return { ok: true, data: cached };

  const r = await fetchJson<{ foods?: FdcFood[] }>("usda_fdc", `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: barcode, dataType: ["Branded"], pageSize: 10 }),
  });
  if (!r.ok) return r;
  const foods = (r.data.foods ?? []).filter((f) => f.gtinUpc && sameGtin(f.gtinUpc, barcode));
  const v = { foods, fetchedAt: new Date().toISOString() };
  cache.set(barcode, v, TTL);
  return { ok: true, data: v };
}

export async function usdaSearch(query: string, pageSize = 6): Promise<Result<{ foods: FdcFood[]; fetchedAt: string }>> {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) return { ok: false, error: { provider: "usda_fdc", kind: "config", message: "USDA_FDC_API_KEY not set" } };
  const ck = `q:${query.toLowerCase()}`;
  const cached = cache.get(ck);
  if (cached) return { ok: true, data: cached };
  const r = await fetchJson<{ foods?: FdcFood[] }>("usda_fdc", `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType: ["Branded"], pageSize }),
  });
  if (!r.ok) return r;
  const foods = (r.data.foods ?? []).filter((f) => !!f.gtinUpc);
  const v = { foods, fetchedAt: new Date().toISOString() };
  cache.set(ck, v, TTL);
  return { ok: true, data: v };
}
