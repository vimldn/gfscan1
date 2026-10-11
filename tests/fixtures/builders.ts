/**
 * TEST FIXTURES ONLY. These synthetic records are never imported by app code
 * and are never displayed as live product information.
 */
import type { SourceObservation } from "@/lib/types";

export const NOW = new Date("2026-10-11T12:00:00Z");

export function obs(over: Partial<SourceObservation> = {}): SourceObservation {
  return {
    id: over.id ?? `open_food_facts:FIXTURE-${Math.random().toString(36).slice(2)}:1`,
    provider: "open_food_facts",
    providerName: "Open Food Facts",
    sourceType: "community_database",
    providerRecordId: "0000000000000",
    sourceUrl: "https://example.invalid/fixture",
    licence: "fixture",
    attribution: "fixture",
    barcode: "0000000000000",
    productName: "FIXTURE product",
    brand: "FIXTURE",
    countries: ["en:united-kingdom"],
    markets: ["GB"],
    ingredientsText: "Potatoes, sunflower oil, salt.",
    ingredientsLang: "en",
    ingredientsComplete: true,
    allergens: [],
    traces: [],
    labels: [],
    gfClaims: [],
    completenessScore: 0.8,
    sourceLastModified: "2026-06-01T00:00:00Z",
    fetchedAt: NOW.toISOString(),
    ...over,
  };
}

export function manufacturerObs(over: Partial<SourceObservation> = {}): SourceObservation {
  return obs({
    id: `manufacturer_feed:FIXTURE-${Math.random().toString(36).slice(2)}:1`,
    provider: "manufacturer_feed",
    providerName: "FIXTURE manufacturer feed",
    sourceType: "manufacturer",
    providerRecordId: "mf-1",
    gfClaims: [{ field: "claims.glutenFree", value: "true", basis: "manufacturer_claim", assertedAt: "2026-09-01T00:00:00Z" }],
    ...over,
  });
}
