/**
 * UK Food Standards Agency food alerts adapter.
 * Docs: https://data.food.gov.uk/food-alerts/ui/reference — Open Government Licence v3.0.
 *
 * Alert types: AA (allergy alert), PRIN (product recall information notice),
 * FAFA (food alert for action).
 */
import type { RecallAlert } from "../types";
import { fetchJson, TtlCache, type Result } from "../http";

const BASE = (process.env.FSA_BASE_URL || "https://data.food.gov.uk/food-alerts").replace(/\/$/, "");
const cache = new TtlCache<{ alerts: RecallAlert[]; fetchedAt: string }>(5);
const TTL = 60 * 60 * 1000; // 1 hour
export const RECALL_LOOKBACK_DAYS = 730;

interface FsaLabelled {
  "@id"?: string;
  label?: string;
}
interface FsaItem {
  "@id"?: string;
  notation?: string;
  title?: string;
  created?: string;
  modified?: string;
  type?: string[];
  alertURL?: string;
  reportingBusiness?: { commonName?: string };
  problem?: { riskStatement?: string; allergen?: FsaLabelled[] }[];
  productDetails?: {
    productName?: string;
    packSizeDescription?: string;
    productCode?: string;
    batchDescription?: unknown;
    [k: string]: unknown;
  }[];
}

function collectStrings(v: unknown, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === "string" || typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (typeof v === "object") Object.entries(v as Record<string, unknown>).forEach(([k, x]) => k !== "@id" && collectStrings(x, out));
  return out;
}

export function parseFsaItem(it: FsaItem): RecallAlert {
  const notation = it.notation ?? it["@id"]?.split("/").pop() ?? "unknown";
  const allergens: { id: string; label: string }[] = [];
  for (const p of it.problem ?? []) {
    for (const a of p.allergen ?? []) {
      const id = (a["@id"] ?? "").split("/").pop() ?? "";
      if (id || a.label) allergens.push({ id, label: a.label ?? id });
    }
  }
  return {
    id: notation,
    title: it.title ?? notation,
    type: (it.type ?? []).map((t) => t.split("/").pop() ?? t).filter((t) => t !== "Alert"),
    created: it.created ?? "",
    modified: it.modified ?? null,
    url: it.alertURL ?? `https://www.food.gov.uk/news-alerts/alert/${notation}`,
    reportingBusiness: it.reportingBusiness?.commonName || null,
    allergens,
    riskStatement: it.problem?.map((p) => p.riskStatement).filter(Boolean).join("\n") || null,
    products: (it.productDetails ?? []).map((pd) => {
      const batch = collectStrings(pd.batchDescription);
      const { productName, packSizeDescription, batchDescription, ...rest } = pd;
      void batchDescription;
      return {
        productName: productName ?? "",
        packSize: packSizeDescription ?? null,
        batchCodes: batch,
        otherText: collectStrings(rest),
      };
    }),
  };
}

export async function fsaRecentAlerts(now = new Date()): Promise<Result<{ alerts: RecallAlert[]; fetchedAt: string; fromCache: boolean }>> {
  const cached = cache.get("recent");
  if (cached) return { ok: true, data: { ...cached, fromCache: true } };
  const since = new Date(now.getTime() - RECALL_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const r = await fetchJson<{ items?: FsaItem[] }>("fsa_alerts", `${BASE}/id?since=${since}&_limit=1000`, {
    headers: { Accept: "application/json" },
    timeoutMs: 12000,
  });
  if (!r.ok) {
    const stale = cache.getStale("recent");
    if (stale) return { ok: true, data: { ...stale, fromCache: true } };
    return r;
  }
  const alerts = (r.data.items ?? []).map(parseFsaItem);
  const v = { alerts, fetchedAt: new Date().toISOString() };
  cache.set("recent", v, TTL);
  return { ok: true, data: { ...v, fromCache: false } };
}

/** Fetch a single alert's full record (includes batch details where published). */
export async function fsaAlertDetail(notation: string): Promise<Result<RecallAlert>> {
  const r = await fetchJson<{ items?: FsaItem | FsaItem[] }>("fsa_alerts", `${BASE}/id/${encodeURIComponent(notation)}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) return r;
  const it = Array.isArray(r.data.items) ? r.data.items[0] : r.data.items;
  if (!it) return { ok: false, error: { provider: "fsa_alerts", kind: "parse", message: "Alert not found" } };
  return { ok: true, data: parseFsaItem(it) };
}
