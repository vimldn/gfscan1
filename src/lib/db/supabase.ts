import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ClassificationResult, RecallMatch, SourceObservation } from "../types";
import { RULE_VERSION, RULES } from "../classify/rules";

let client: SupabaseClient | null | undefined;

/** Server-side client using the service role. Returns null when not configured. */
export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export function dbConfigured(): boolean {
  return db() !== null;
}

function obsRow(o: SourceObservation, raw?: unknown) {
  return {
    id: o.id,
    barcode: o.barcode,
    provider: o.provider,
    provider_record_id: o.providerRecordId,
    source_type: o.sourceType,
    source_url: o.sourceUrl,
    licence: o.licence,
    product_name: o.productName,
    brand: o.brand,
    quantity: o.quantity,
    image_url: o.imageUrl,
    countries: o.countries,
    markets: o.markets,
    ingredients_text: o.ingredientsText,
    ingredients_lang: o.ingredientsLang,
    ingredients_complete: o.ingredientsComplete,
    allergens: o.allergens,
    traces: o.traces,
    labels: o.labels,
    gf_claims: o.gfClaims,
    completeness_score: o.completenessScore,
    source_last_modified: o.sourceLastModified,
    fetched_at: o.fetchedAt,
    raw: raw ?? null,
  };
}

function rowToObs(r: Record<string, unknown>): SourceObservation {
  const provider = r.provider as SourceObservation["provider"];
  return {
    id: r.id as string,
    provider,
    providerName: provider === "open_food_facts" ? "Open Food Facts" : provider === "usda_fdc" ? "USDA FoodData Central" : String(provider),
    sourceType: r.source_type as SourceObservation["sourceType"],
    providerRecordId: r.provider_record_id as string,
    sourceUrl: r.source_url as string,
    licence: r.licence as string,
    attribution: provider === "open_food_facts" ? "Data from Open Food Facts contributors, openfoodfacts.org" : "U.S. Department of Agriculture, FoodData Central",
    barcode: r.barcode as string,
    productName: r.product_name as string | null,
    brand: r.brand as string | null,
    quantity: r.quantity as string | null,
    imageUrl: r.image_url as string | null,
    countries: (r.countries as string[]) ?? [],
    markets: (r.markets as string[]) ?? [],
    ingredientsText: r.ingredients_text as string | null,
    ingredientsLang: r.ingredients_lang as string | null,
    ingredientsComplete: r.ingredients_complete as boolean | null,
    allergens: r.allergens as string[] | null,
    traces: r.traces as string[] | null,
    labels: r.labels as string[] | null,
    gfClaims: (r.gf_claims as SourceObservation["gfClaims"]) ?? [],
    completenessScore: r.completeness_score as number | null,
    sourceLastModified: r.source_last_modified as string | null,
    fetchedAt: r.fetched_at as string,
    servedFromCache: true,
  };
}

/** Latest stored observation per provider for a barcode (used when live providers fail). */
export async function loadCachedObservations(barcode: string): Promise<SourceObservation[]> {
  const c = db();
  if (!c) return [];
  const { data, error } = await c
    .from("source_observations")
    .select("*")
    .eq("barcode", barcode)
    .order("fetched_at", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  const seen = new Set<string>();
  return data.filter((r) => (seen.has(r.provider) ? false : (seen.add(r.provider), true))).map(rowToObs);
}

let ruleVersionSaved = false;

/** Best-effort persistence of a lookup. Never throws. */
export async function persistLookup(args: {
  barcode: string;
  observations: { obs: SourceObservation; raw?: unknown }[];
  classification: ClassificationResult;
  recalls: RecallMatch[];
}): Promise<void> {
  const c = db();
  if (!c) return;
  try {
    if (!ruleVersionSaved) {
      await c.from("rule_versions").upsert({ version: RULE_VERSION, rules: RULES }, { onConflict: "version", ignoreDuplicates: true });
      ruleVersionSaved = true;
    }
    const first = args.observations.find((o) => !o.obs.servedFromCache)?.obs;
    if (first) {
      await c.from("products").upsert(
        { barcode: args.barcode, product_name: first.productName, brand: first.brand, image_url: first.imageUrl, last_fetched_at: first.fetchedAt },
        { onConflict: "barcode" },
      );
    }
    const fresh = args.observations.filter((o) => !o.obs.servedFromCache);
    if (fresh.length) {
      await c.from("source_observations").upsert(fresh.map((o) => obsRow(o.obs, o.raw)), { onConflict: "id" });
    }
    await c.from("classifications").insert({
      barcode: args.barcode,
      rule_version: args.classification.ruleVersion,
      status: args.classification.status,
      claim_basis: args.classification.claimBasis,
      target_market: args.classification.targetMarket,
      decided_by: args.classification.decidedBy,
      hits: args.classification.hits,
      precautionary: args.classification.precautionary,
      observation_ids: args.classification.observationIds,
      classified_at: args.classification.classifiedAt,
    });
    if (args.recalls.length) {
      await c.from("recall_alerts").upsert(
        args.recalls.map((m) => ({
          id: m.alert.id,
          title: m.alert.title,
          type: m.alert.type,
          created: m.alert.created || null,
          url: m.alert.url,
          reporting_business: m.alert.reportingBusiness,
          allergens: m.alert.allergens,
          products: m.alert.products,
        })),
        { onConflict: "id" },
      );
      await c.from("recall_matches").upsert(
        args.recalls.map((m) => ({ barcode: args.barcode, alert_id: m.alert.id, level: m.level, concerns_gluten: m.concernsGluten, reason: m.reason })),
        { onConflict: "barcode,alert_id" },
      );
    }
  } catch (e) {
    console.error("[supabase] persistLookup failed", e);
  }
}

export async function saveReport(r: {
  barcode: string;
  issueType: string;
  details: string;
  contactEmail?: string | null;
  classificationStatus?: string | null;
  observationIds?: string[];
}): Promise<{ ok: boolean; stored: boolean; error?: string }> {
  const c = db();
  if (!c) return { ok: true, stored: false };
  const { error } = await c.from("user_reports").insert({
    barcode: r.barcode,
    issue_type: r.issueType,
    details: r.details,
    contact_email: r.contactEmail || null,
    classification_status: r.classificationStatus || null,
    observation_ids: r.observationIds ?? [],
  });
  return error ? { ok: false, stored: false, error: error.message } : { ok: true, stored: true };
}
