/**
 * Core domain types. Every piece of food information shown to a user must be
 * traceable to a SourceObservation (one provider record fetched at one time).
 */

export type ProviderId =
  | "open_food_facts"
  | "usda_fdc"
  | "fsa_alerts"
  | "open_prices"
  | "gs1"
  | "coeliac_uk"
  | "manufacturer_feed"
  | "retailer_feed";

/**
 * How much authority a source carries for a gluten-free CLAIM.
 * Only "manufacturer" and "authorised_certification" can ever support
 * VERIFIED GLUTEN-FREE. Community databases never can on their own.
 */
export type SourceType =
  | "community_database"
  | "government_database"
  | "manufacturer"
  | "authorised_certification"
  | "authorised_retailer";

export type ClaimBasis =
  | "manufacturer_claim"
  | "certification"
  | "community_label"
  | "none";

export interface GlutenFreeClaim {
  /** Where the claim came from, e.g. labels_tags */
  field: string;
  /** Exact source value, e.g. "en:gluten-free" */
  value: string;
  basis: Exclude<ClaimBasis, "none">;
  /** Date the claim was observed/asserted by the source, if the source provides one */
  assertedAt?: string | null;
}

export interface SourceObservation {
  /** Stable id: provider:recordId:lastModified */
  id: string;
  provider: ProviderId;
  providerName: string;
  sourceType: SourceType;
  providerRecordId: string;
  sourceUrl: string;
  licence: string;
  attribution: string;
  /** Normalised GTIN (digits only, as returned by source) */
  barcode: string;
  productName?: string | null;
  brand?: string | null;
  quantity?: string | null;
  imageUrl?: string | null;
  /** Raw country tags from the source, e.g. ["en:united-kingdom"] */
  countries: string[];
  /** ISO 3166-1 alpha-2 markets derived deterministically from countries */
  markets: string[];
  /** Ingredient declaration text, exactly as supplied */
  ingredientsText?: string | null;
  /** Language of ingredientsText ("en" etc.), null if unknown */
  ingredientsLang?: string | null;
  /** true if the source says the ingredient list is complete, false if it says incomplete, null if unknown */
  ingredientsComplete?: boolean | null;
  /** Declared allergen tags. null = field absent (unknown). [] = field present but empty. */
  allergens: string[] | null;
  /** Precautionary / trace tags. null = unknown. */
  traces: string[] | null;
  /** Label / claim tags. null = unknown. */
  labels: string[] | null;
  gfClaims: GlutenFreeClaim[];
  /** Source-provided completeness score 0..1 when available */
  completenessScore?: number | null;
  /** When the SOURCE last modified this record (ISO), null if unknown */
  sourceLastModified?: string | null;
  /** When THIS APP fetched the record (ISO) */
  fetchedAt: string;
  /** True when served from cache after a failed live fetch */
  servedFromCache?: boolean;
}

export type GlutenStatus = "VERIFIED_GLUTEN_FREE" | "CONTAINS_GLUTEN" | "UNVERIFIED";

export interface EvidenceRef {
  observationId: string;
  provider: ProviderId;
  field: string;
  value: string;
}

export type RuleOutcome = "contains" | "verified" | "unverified" | "warning" | "info";

export interface RuleHit {
  ruleId: string;
  outcome: RuleOutcome;
  message: string;
  evidence: EvidenceRef[];
}

export interface ClassificationResult {
  status: GlutenStatus;
  ruleVersion: string;
  targetMarket: string;
  claimBasis: ClaimBasis;
  /** Rule ids that determined the primary status */
  decidedBy: string[];
  /** All rule hits (primary, info and warnings) */
  hits: RuleHit[];
  /** Precautionary "may contain" warnings, separate from status */
  precautionary: RuleHit[];
  /** Observations considered, by id */
  observationIds: string[];
  classifiedAt: string;
}

export type RecallMatchLevel = "confirmed" | "possible";

export interface RecallAlert {
  id: string; // notation e.g. FSA-AA-12-2024
  title: string;
  type: string[]; // e.g. ["AA"]
  created: string;
  modified?: string | null;
  url: string;
  reportingBusiness?: string | null;
  allergens: { id: string; label: string }[];
  products: {
    productName: string;
    packSize?: string | null;
    batchCodes?: string[];
    bestBefore?: string[];
    /** Any other text fields, kept for exact identifier matching */
    otherText?: string[];
  }[];
  riskStatement?: string | null;
}

export interface RecallMatch {
  level: RecallMatchLevel;
  alert: RecallAlert;
  concernsGluten: boolean;
  reason: string;
  matchedProductName?: string;
}

export interface PriceObservation {
  price: number;
  currency: string;
  date: string;
  retailer?: string | null;
  location?: string | null;
  sourceUrl: string;
}

export interface ProviderError {
  provider: ProviderId;
  message: string;
  kind: "timeout" | "http" | "network" | "rate_limited" | "config" | "parse";
}
