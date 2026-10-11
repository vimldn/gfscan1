/**
 * Deterministic recall matching.
 *
 *  CONFIRMED: the alert text contains this product's exact GTIN.
 *  POSSIBLE:  brand matches AND product-name tokens overlap strongly.
 *
 * A name match never proves a recall applies to a barcode, so POSSIBLE matches
 * are displayed separately. No match never means "safe".
 */
import type { RecallAlert, RecallMatch } from "../types";
import { cleanBarcode, sameGtin } from "../barcode";

export const GLUTEN_ALERT_ALLERGENS = new Set(["gluten", "wheat", "barley", "rye", "oats", "spelt", "kamut", "cereals-containing-gluten"]);

const STOP = new Set([
  "the", "and", "with", "of", "in", "a", "an", "for", "x", "pack", "packs", "g", "kg", "ml", "l", "cl", "multipack",
  "all", "flavours", "flavour", "sold", "by", "range", "products", "product", "size", "sizes",
]);

export function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));
}

export interface RecallProductInput {
  barcode: string;
  productName?: string | null;
  brand?: string | null;
}

export function alertConcernsGluten(a: RecallAlert): boolean {
  return a.allergens.some((x) => GLUTEN_ALERT_ALLERGENS.has(x.id.toLowerCase()) || /gluten|wheat|barley|rye|oat/i.test(x.label));
}

export function matchRecalls(product: RecallProductInput, alerts: RecallAlert[]): RecallMatch[] {
  const out: RecallMatch[] = [];
  const code = cleanBarcode(product.barcode);
  const brandTokens = tokens(product.brand);
  const nameTokens = tokens(product.productName).filter((t) => !brandTokens.includes(t));

  for (const alert of alerts) {
    const concernsGluten = alertConcernsGluten(alert);

    // 1. Exact identifier in any product-detail field -> confirmed
    const idHit =
      code.length >= 8 &&
      alert.products.some((p) =>
        [p.productName, ...(p.otherText ?? []), ...(p.batchCodes ?? [])].some((s) =>
          (s.match(/\d{8,14}/g) ?? []).some((d) => sameGtin(d, code)),
        ),
      );
    if (idHit) {
      out.push({ level: "confirmed", alert, concernsGluten, reason: `Alert lists barcode ${code}` });
      continue;
    }

    // 2. Brand + name overlap -> possible
    if (brandTokens.length === 0 || nameTokens.length === 0) continue;
    const bizTokens = tokens(alert.reportingBusiness);
    for (const p of alert.products) {
      const pt = tokens(p.productName);
      const brandOk = brandTokens.every((b) => pt.includes(b) || bizTokens.includes(b));
      if (!brandOk) continue;
      const pNameTokens = pt.filter((t) => !brandTokens.includes(t));
      if (pNameTokens.length === 0) continue;
      const shared = nameTokens.filter((t) => pNameTokens.includes(t));
      const overlap = shared.length / Math.min(nameTokens.length, pNameTokens.length);
      if (shared.length >= 1 && overlap >= 0.6) {
        out.push({
          level: "possible",
          alert,
          concernsGluten,
          matchedProductName: p.productName,
          reason: `Brand “${product.brand}” and name words (${shared.join(", ")}) match “${p.productName}”. Check the batch codes and dates on your pack.`,
        });
        break;
      }
    }
  }
  // Confirmed first, then newest
  return out.sort((a, b) => (a.level === b.level ? b.alert.created.localeCompare(a.alert.created) : a.level === "confirmed" ? -1 : 1));
}
