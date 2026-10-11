import "server-only";
import type { ClassificationResult, PriceObservation, ProviderError, RecallMatch, SourceObservation } from "./types";
import { classify } from "./classify/engine";
import { offGetProduct, offProductToObservation, offSearch } from "./providers/openfoodfacts";
import { fdcFoodToObservation, usdaByGtin, usdaConfigured, usdaSearch } from "./providers/usda";
import { fsaRecentAlerts } from "./providers/fsa";
import { openPricesFor } from "./providers/openprices";
import { matchRecalls } from "./recalls/match";
import { cleanBarcode, hasValidCheckDigit, isPlausibleBarcode } from "./barcode";
import { loadCachedObservations, persistLookup } from "./db/supabase";

export interface ProductView {
  barcode: string;
  checkDigitValid: boolean;
  found: boolean;
  /** Primary display observation (UK first, then most complete) */
  primary: SourceObservation | null;
  observations: SourceObservation[];
  classification: ClassificationResult;
  recalls: RecallMatch[];
  recallsChecked: boolean;
  recallsFetchedAt: string | null;
  prices: PriceObservation[];
  providerErrors: ProviderError[];
  generatedAt: string;
}

function pickPrimary(obs: SourceObservation[]): SourceObservation | null {
  if (!obs.length) return null;
  return [...obs].sort((a, b) => {
    const uk = Number(b.markets.includes("GB")) - Number(a.markets.includes("GB"));
    if (uk) return uk;
    const img = Number(!!b.imageUrl) - Number(!!a.imageUrl);
    if (img) return img;
    return (b.completenessScore ?? 0) - (a.completenessScore ?? 0);
  })[0];
}

export async function lookupBarcode(input: string): Promise<ProductView> {
  const barcode = cleanBarcode(input);
  const providerErrors: ProviderError[] = [];
  const observations: { obs: SourceObservation; raw?: unknown }[] = [];

  const [off, usda, fsa, prices] = await Promise.all([
    offGetProduct(barcode),
    usdaConfigured() ? usdaByGtin(barcode) : Promise.resolve(null),
    fsaRecentAlerts(),
    openPricesFor(barcode),
  ]);

  if (off.ok) {
    if (off.data.product) {
      observations.push({ obs: offProductToObservation(off.data.product, off.data.fetchedAt, { servedFromCache: off.data.fromCache }), raw: off.data.product });
    }
  } else providerErrors.push(off.error);

  if (usda) {
    if (usda.ok) for (const f of usda.data.foods) observations.push({ obs: fdcFoodToObservation(f, usda.data.fetchedAt), raw: f });
    else providerErrors.push(usda.error);
  }

  // Live providers failed: fall back to stored observations (shown as cached, with their fetch dates).
  if (observations.length === 0 && providerErrors.length > 0) {
    for (const o of await loadCachedObservations(barcode)) observations.push({ obs: o });
  }

  const obs = observations.map((o) => o.obs);
  const classification = classify(obs, { targetMarket: "GB", providerErrors });
  const primary = pickPrimary(obs);

  let recalls: RecallMatch[] = [];
  if (fsa.ok) {
    recalls = matchRecalls({ barcode, productName: primary?.productName, brand: primary?.brand }, fsa.data.alerts);
  } else providerErrors.push(fsa.error);
  if (!prices.ok) providerErrors.push(prices.error);

  const view: ProductView = {
    barcode,
    checkDigitValid: hasValidCheckDigit(barcode),
    found: obs.length > 0,
    primary,
    observations: obs,
    classification,
    recalls,
    recallsChecked: fsa.ok,
    recallsFetchedAt: fsa.ok ? fsa.data.fetchedAt : null,
    prices: prices.ok ? prices.data : [],
    providerErrors,
    generatedAt: new Date().toISOString(),
  };

  // Persist without blocking the response for long.
  await Promise.race([persistLookup({ barcode, observations, classification, recalls }), new Promise((r) => setTimeout(r, 1500))]);
  return view;
}

export interface SearchResultItem {
  barcode: string;
  observation: SourceObservation;
  classification: ClassificationResult;
  hasEnglishIngredients: boolean;
  uk: boolean;
}

export interface SearchResponse {
  query: string;
  kind: "barcode" | "text";
  results: SearchResultItem[];
  providerErrors: ProviderError[];
  fetchedAt: string;
}

export async function searchProducts(q: string): Promise<SearchResponse> {
  const query = q.trim().slice(0, 120);
  const digits = cleanBarcode(query);
  const now = new Date().toISOString();

  // Barcode query: exact barcode match only, ranked first by definition.
  if (/^\d[\d\s-]*$/.test(query) && isPlausibleBarcode(digits)) {
    const v = await lookupBarcode(digits);
    const results = v.observations.map((o) => toItem(o, [o]));
    return { query, kind: "barcode", results, providerErrors: v.providerErrors, fetchedAt: now };
  }

  const providerErrors: ProviderError[] = [];
  const results: SearchResultItem[] = [];
  const [off, usda] = await Promise.all([offSearch(query), usdaConfigured() ? usdaSearch(query) : Promise.resolve(null)]);
  if (off.ok) {
    for (const p of off.data.products) {
      const o = offProductToObservation(p, off.data.fetchedAt, { servedFromCache: off.data.fromCache });
      if (!o.barcode) continue;
      results.push(toItem(o, [o]));
    }
  } else providerErrors.push(off.error);
  if (usda) {
    if (usda.ok) {
      for (const f of usda.data.foods) {
        const o = fdcFoodToObservation(f, usda.data.fetchedAt);
        results.push(toItem(o, [o]));
      }
    } else if (usda.error.kind !== "config") providerErrors.push(usda.error);
  }

  // Ranking: UK market first, then useful English ingredient data, then completeness. Stable otherwise.
  const ranked = results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const uk = Number(b.r.uk) - Number(a.r.uk);
      if (uk) return uk;
      const en = Number(b.r.hasEnglishIngredients) - Number(a.r.hasEnglishIngredients);
      if (en) return en;
      const c = (b.r.observation.completenessScore ?? 0) - (a.r.observation.completenessScore ?? 0);
      if (Math.abs(c) > 0.15) return c;
      return a.i - b.i;
    })
    .map((x) => x.r);

  return { query, kind: "text", results: ranked, providerErrors, fetchedAt: now };
}

function toItem(o: SourceObservation, all: SourceObservation[]): SearchResultItem {
  return {
    barcode: o.barcode,
    observation: o,
    classification: classify(all, { targetMarket: "GB" }),
    hasEnglishIngredients: o.ingredientsLang === "en" && !!o.ingredientsText,
    uk: o.markets.includes("GB"),
  };
}
