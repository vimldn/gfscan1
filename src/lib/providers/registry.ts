/**
 * Provider registry and the interface future data providers must implement.
 *
 * Future providers are listed with status "not_integrated". They are NOT
 * called, and the app never claims to have data from them. Adding one means
 * implementing ProductProvider with a documented, licensed API — no scraping.
 */
import type { ProviderId, SourceObservation, SourceType } from "../types";
import type { Result } from "../http";

export interface ProductProvider {
  id: ProviderId;
  name: string;
  sourceType: SourceType;
  /** Look up a single GTIN. Must only return exact-GTIN matches. */
  getByBarcode(barcode: string): Promise<Result<SourceObservation[]>>;
  /** Optional name search. */
  search?(query: string): Promise<Result<SourceObservation[]>>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  status: "live" | "optional" | "not_integrated";
  sourceType?: SourceType;
  role: string;
  docs: string;
  licence: string;
  notes?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "open_food_facts",
    name: "Open Food Facts",
    status: "live",
    sourceType: "community_database",
    role: "Barcode lookup and product search: ingredients, allergens, traces, labels, countries, images.",
    docs: "https://openfoodfacts.github.io/openfoodfacts-server/api/",
    licence: "ODbL 1.0 (database), DbCL (contents), CC BY-SA 3.0 (images)",
    notes: "Community-maintained. Gluten-free labels are treated as community-reported, never as verified manufacturer claims.",
  },
  {
    id: "fsa_alerts",
    name: "UK Food Standards Agency — Food Alerts",
    status: "live",
    sourceType: "government_database",
    role: "Allergy alerts and product recalls, matched as confirmed (exact barcode) or possible (brand + name).",
    docs: "https://data.food.gov.uk/food-alerts/ui/reference",
    licence: "Open Government Licence v3.0",
  },
  {
    id: "usda_fdc",
    name: "USDA FoodData Central (Branded Foods)",
    status: "optional",
    sourceType: "government_database",
    role: "US branded product ingredient declarations, exact GTIN matches only. Enabled when USDA_FDC_API_KEY is set.",
    docs: "https://fdc.nal.usda.gov/api-guide/",
    licence: "CC0 1.0",
  },
  {
    id: "open_prices",
    name: "Open Prices",
    status: "optional",
    sourceType: "community_database",
    role: "Crowd-sourced price observations with date and shop.",
    docs: "https://prices.openfoodfacts.org/api/docs",
    licence: "ODbL 1.0",
  },
  { id: "gs1", name: "GS1 UK / Verified by GS1", status: "not_integrated", role: "Authoritative GTIN ownership and core product attributes.", docs: "https://www.gs1uk.org/", licence: "Commercial agreement required" },
  { id: "coeliac_uk", name: "Coeliac UK", status: "not_integrated", role: "Crossed Grain licensing / Food & Drink Information.", docs: "https://www.coeliac.org.uk/", licence: "Requires permission and licence" },
  { id: "manufacturer_feed", name: "Manufacturer product feeds", status: "not_integrated", sourceType: "manufacturer", role: "Manufacturer-supplied structured data incl. gluten-free claims — the only route to VERIFIED status.", docs: "—", licence: "Per-manufacturer agreement" },
  { id: "tesco", name: "Tesco", status: "not_integrated", sourceType: "authorised_retailer", role: "Authorised retailer feed.", docs: "—", licence: "Requires authorised access; no scraping" },
  { id: "sainsburys", name: "Sainsbury's", status: "not_integrated", sourceType: "authorised_retailer", role: "Authorised retailer feed.", docs: "—", licence: "Requires authorised access; no scraping" },
  { id: "asda", name: "Asda", status: "not_integrated", sourceType: "authorised_retailer", role: "Authorised retailer feed.", docs: "—", licence: "Requires authorised access; no scraping" },
  { id: "morrisons", name: "Morrisons", status: "not_integrated", sourceType: "authorised_retailer", role: "Authorised retailer feed.", docs: "—", licence: "Requires authorised access; no scraping" },
  { id: "waitrose", name: "Waitrose", status: "not_integrated", sourceType: "authorised_retailer", role: "Authorised retailer feed.", docs: "—", licence: "Requires authorised access; no scraping" },
  { id: "ocado", name: "Ocado", status: "not_integrated", sourceType: "authorised_retailer", role: "Authorised retailer feed.", docs: "—", licence: "Requires authorised access; no scraping" },
];
