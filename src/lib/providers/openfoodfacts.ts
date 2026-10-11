/**
 * Open Food Facts adapter.
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 * Licence: database ODbL 1.0, images CC BY-SA. Attribution is displayed in the UI.
 *
 * OFF rate limits (per IP): 100 req/min product reads, 10 req/min search.
 * We enforce slightly lower limits in-process and cache aggressively.
 */
import type { GlutenFreeClaim, SourceObservation } from "../types";
import { fetchJson, RateLimiter, TtlCache, type Result } from "../http";
import { marketsFromCountryTags } from "../markets";
import { barcodeVariants } from "../barcode";

export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "image_front_url",
  "image_front_small_url",
  "image_url",
  "lang",
  "ingredients_lang",
  "ingredients_text",
  "ingredients_text_en",
  "allergens_tags",
  "traces_tags",
  "labels_tags",
  "countries_tags",
  "states_tags",
  "completeness",
  "last_modified_t",
].join(",");

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  image_url?: string;
  lang?: string;
  ingredients_lang?: string;
  ingredients_text?: string;
  ingredients_text_en?: string;
  allergens_tags?: string[];
  traces_tags?: string[];
  labels_tags?: string[];
  countries_tags?: string[];
  states_tags?: string[];
  completeness?: number;
  last_modified_t?: number;
}

const base = () => (process.env.OFF_BASE_URL || "https://world.openfoodfacts.org").replace(/\/$/, "");
const userAgent = () => process.env.OFF_USER_AGENT || "CanIEatThat/0.1 (https://github.com/; contact: set OFF_USER_AGENT)";

const productLimiter = new RateLimiter(90, 60_000);
const searchLimiter = new RateLimiter(8, 60_000);
const productCache = new TtlCache<{ product: OffProduct | null; fetchedAt: string }>(1000);
const searchCache = new TtlCache<{ products: OffProduct[]; fetchedAt: string }>(300);

const PRODUCT_TTL = 6 * 60 * 60 * 1000; // 6h
const SEARCH_TTL = 6 * 60 * 60 * 1000;

/** Label tags that record a gluten-free claim on pack. All are COMMUNITY-reported in OFF. */
export function glutenFreeLabelTags(labels: string[] | undefined | null): string[] {
  return (labels ?? []).filter((t) =>
    /(^|:)(gluten-free|no-gluten|sans-gluten|senza-glutine|sin-gluten|glutenfrei|crossed-grain-symbol|gluten-free-certified)/.test(t),
  );
}

export function offProductToObservation(p: OffProduct, fetchedAt: string, opts: { servedFromCache?: boolean } = {}): SourceObservation {
  const code = String(p.code ?? "");
  const lastMod = p.last_modified_t ? new Date(p.last_modified_t * 1000).toISOString() : null;

  let ingredientsText: string | null = null;
  let ingredientsLang: string | null = null;
  if (p.ingredients_text_en && p.ingredients_text_en.trim()) {
    ingredientsText = p.ingredients_text_en;
    ingredientsLang = "en";
  } else if (p.ingredients_text && p.ingredients_text.trim()) {
    ingredientsText = p.ingredients_text;
    ingredientsLang = p.ingredients_lang || p.lang || null;
  }

  const states = p.states_tags ?? [];
  const ingredientsComplete = states.includes("en:ingredients-completed")
    ? true
    : states.includes("en:ingredients-to-be-completed")
      ? false
      : null;

  const gfClaims: GlutenFreeClaim[] = glutenFreeLabelTags(p.labels_tags).map((t) => ({
    field: "labels_tags",
    value: t,
    basis: "community_label",
    assertedAt: lastMod,
  }));

  return {
    id: `open_food_facts:${code}:${p.last_modified_t ?? "na"}`,
    provider: "open_food_facts",
    providerName: "Open Food Facts",
    sourceType: "community_database",
    providerRecordId: code,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    licence: "ODbL 1.0 (database), CC BY-SA 3.0 (images)",
    attribution: "Data from Open Food Facts contributors, openfoodfacts.org",
    barcode: code,
    productName: p.product_name_en || p.product_name || null,
    brand: p.brands ? p.brands.split(",")[0].trim() : null,
    quantity: p.quantity || null,
    imageUrl: p.image_front_url || p.image_url || null,
    countries: p.countries_tags ?? [],
    markets: marketsFromCountryTags(p.countries_tags),
    ingredientsText,
    ingredientsLang,
    ingredientsComplete,
    allergens: Array.isArray(p.allergens_tags) ? p.allergens_tags : null,
    traces: Array.isArray(p.traces_tags) ? p.traces_tags : null,
    labels: Array.isArray(p.labels_tags) ? p.labels_tags : null,
    gfClaims,
    completenessScore: typeof p.completeness === "number" ? p.completeness : null,
    sourceLastModified: lastMod,
    fetchedAt,
    servedFromCache: opts.servedFromCache,
  };
}

const headers = () => ({ "User-Agent": userAgent(), Accept: "application/json" });

/** Look up a barcode, trying UPC/EAN variants. Returns null data when not found. */
export async function offGetProduct(barcode: string): Promise<Result<{ product: OffProduct | null; fetchedAt: string; fromCache: boolean }>> {
  const cached = productCache.get(barcode);
  if (cached) return { ok: true, data: { ...cached, fromCache: true } };

  for (const code of barcodeVariants(barcode)) {
    if (!productLimiter.tryTake()) {
      const stale = productCache.getStale(barcode);
      if (stale) return { ok: true, data: { ...stale, fromCache: true } };
      return { ok: false, error: { provider: "open_food_facts", kind: "rate_limited", message: "Local rate limit reached; try again shortly" } };
    }
    const r = await fetchJson<{ status: number; product?: OffProduct }>(
      "open_food_facts",
      `${base()}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`,
      { headers: headers() },
    );
    if (!r.ok) {
      // v2 returns 404 with status 0 for unknown products
      if (r.error.kind === "http" && r.error.message === "HTTP 404") continue;
      const stale = productCache.getStale(barcode);
      if (stale) return { ok: true, data: { ...stale, fromCache: true } };
      return r;
    }
    if (r.data.status === 1 && r.data.product) {
      const v = { product: r.data.product, fetchedAt: new Date().toISOString() };
      productCache.set(barcode, v, PRODUCT_TTL);
      return { ok: true, data: { ...v, fromCache: false } };
    }
  }
  const v = { product: null, fetchedAt: new Date().toISOString() };
  productCache.set(barcode, v, 30 * 60 * 1000);
  return { ok: true, data: { ...v, fromCache: false } };
}

/**
 * Full-text product search. Runs a UK-filtered query first, then a worldwide
 * query, and returns the union (UK first). Never substitutes products.
 */
export async function offSearch(query: string, pageSize = 24): Promise<Result<{ products: OffProduct[]; fetchedAt: string; fromCache: boolean }>> {
  const key = `${query.toLowerCase().trim()}|${pageSize}`;
  const cached = searchCache.get(key);
  if (cached) return { ok: true, data: { ...cached, fromCache: true } };

  const mk = (uk: boolean) => {
    const u = new URL(`${base()}/cgi/search.pl`);
    u.searchParams.set("search_terms", query);
    u.searchParams.set("search_simple", "1");
    u.searchParams.set("action", "process");
    u.searchParams.set("json", "1");
    u.searchParams.set("page_size", String(pageSize));
    u.searchParams.set("fields", OFF_FIELDS);
    u.searchParams.set("sort_by", "unique_scans_n");
    if (uk) {
      u.searchParams.set("tagtype_0", "countries");
      u.searchParams.set("tag_contains_0", "contains");
      u.searchParams.set("tag_0", "united-kingdom");
    }
    return u.toString();
  };

  const results: OffProduct[] = [];
  let lastError: Result<never> | null = null;
  for (const uk of [true, false]) {
    if (!searchLimiter.tryTake()) {
      lastError = { ok: false, error: { provider: "open_food_facts", kind: "rate_limited", message: "Search rate limit reached; try again in a minute" } };
      break;
    }
    const r = await fetchJson<{ products?: OffProduct[] }>("open_food_facts", mk(uk), { headers: headers(), timeoutMs: 12000 });
    if (!r.ok) {
      lastError = r;
      continue;
    }
    for (const p of r.data.products ?? []) {
      if (p.code && !results.some((x) => x.code === p.code)) results.push(p);
    }
    if (uk && results.length >= Math.min(12, pageSize)) break; // enough UK results
  }

  if (results.length === 0 && lastError) {
    const stale = searchCache.getStale(key);
    if (stale) return { ok: true, data: { ...stale, fromCache: true } };
    return lastError;
  }
  const v = { products: results, fetchedAt: new Date().toISOString() };
  searchCache.set(key, v, SEARCH_TTL);
  return { ok: true, data: { ...v, fromCache: false } };
}
