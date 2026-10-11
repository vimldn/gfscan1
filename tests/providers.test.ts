import { afterEach, describe, expect, it, vi } from "vitest";
import { offProductToObservation, glutenFreeLabelTags } from "@/lib/providers/openfoodfacts";
import { fdcFoodToObservation } from "@/lib/providers/usda";
import { parseFsaItem } from "@/lib/providers/fsa";
import { parseOpenPrices } from "@/lib/providers/openprices";
import { matchRecalls } from "@/lib/recalls/match";
import { fetchJson, RateLimiter } from "@/lib/http";
import { barcodeVariants, hasValidCheckDigit, sameGtin } from "@/lib/barcode";
import { classify } from "@/lib/classify/engine";
import { NOW } from "./fixtures/builders";

// FIXTURE: shape mirrors the OFF v2 product API; values are synthetic.
const OFF_FIXTURE = {
  code: "5000000000017",
  product_name: "FIXTURE Crisps",
  brands: "FixtureBrand, Other",
  quantity: "150 g",
  lang: "en",
  ingredients_text_en: "Potatoes, Sunflower Oil, Salt",
  allergens_tags: [],
  traces_tags: ["en:gluten"],
  labels_tags: ["en:vegetarian", "en:gluten-free"],
  countries_tags: ["en:united-kingdom", "en:ireland"],
  states_tags: ["en:ingredients-completed"],
  completeness: 0.875,
  last_modified_t: 1767225600, // 2026-01-01
};

describe("Open Food Facts mapping", () => {
  const o = offProductToObservation(OFF_FIXTURE, NOW.toISOString());

  it("maps fields and provenance", () => {
    expect(o.provider).toBe("open_food_facts");
    expect(o.sourceType).toBe("community_database");
    expect(o.brand).toBe("FixtureBrand");
    expect(o.markets).toEqual(["GB", "IE"]);
    expect(o.ingredientsLang).toBe("en");
    expect(o.ingredientsComplete).toBe(true);
    expect(o.sourceLastModified).toBe("2026-01-01T00:00:00.000Z");
    expect(o.fetchedAt).toBe(NOW.toISOString());
    expect(o.sourceUrl).toContain("5000000000017");
  });

  it("records the gluten-free label as community-reported only", () => {
    expect(o.gfClaims).toEqual([{ field: "labels_tags", value: "en:gluten-free", basis: "community_label", assertedAt: o.sourceLastModified }]);
    expect(classify([o], { now: NOW }).status).toBe("UNVERIFIED");
  });

  it("absent allergen field maps to null, not []", () => {
    const { allergens_tags, ...rest } = OFF_FIXTURE;
    void allergens_tags;
    expect(offProductToObservation(rest, NOW.toISOString()).allergens).toBeNull();
  });

  it("non-English ingredients keep their language", () => {
    const x = offProductToObservation({ ...OFF_FIXTURE, ingredients_text_en: "", ingredients_text: "Pommes de terre", lang: "fr" }, NOW.toISOString());
    expect(x.ingredientsLang).toBe("fr");
  });

  it("detects gluten-free label variants", () => {
    expect(glutenFreeLabelTags(["en:no-gluten", "fr:sans-gluten", "en:crossed-grain-symbol", "en:organic"])).toHaveLength(3);
  });
});

describe("USDA mapping", () => {
  it("maps a branded food and never claims gluten-free", () => {
    const o = fdcFoodToObservation(
      { fdcId: 1, description: "FIXTURE", gtinUpc: "012345678905", ingredients: "WHEAT FLOUR, WATER", modifiedDate: "2025-05-01", marketCountry: "United States" },
      NOW.toISOString(),
    );
    expect(o.markets).toEqual(["US"]);
    expect(o.gfClaims).toEqual([]);
    expect(o.allergens).toBeNull();
    expect(classify([o], { now: NOW }).status).toBe("CONTAINS_GLUTEN");
  });
});

// FIXTURE: shape mirrors data.food.gov.uk/food-alerts items; values are synthetic.
const FSA_FIXTURE = {
  "@id": "http://data.food.gov.uk/food-alerts/id/FSA-AA-99-2099",
  notation: "FSA-AA-99-2099",
  title: "FIXTURE recalls Fixture Crisps because of undeclared gluten",
  created: "2026-09-01",
  type: ["http://data.food.gov.uk/food-alerts/def/AA", "http://data.food.gov.uk/food-alerts/def/Alert"],
  alertURL: "https://www.food.gov.uk/news-alerts/alert/FSA-AA-99-2099",
  reportingBusiness: { commonName: "FixtureBrand" },
  problem: [{ riskStatement: "Contains gluten", allergen: [{ "@id": "http://data.food.gov.uk/codes/alerts/def/allergen/gluten", label: "Gluten" }] }],
  productDetails: [{ productName: "FixtureBrand Sea Salt Crisps", packSizeDescription: "150g", batchDescription: { batchCode: "L123", bestBeforeDescription: "01 Dec 2026" } }],
};

describe("FSA recalls", () => {
  const alert = parseFsaItem(FSA_FIXTURE);

  it("parses alert fields", () => {
    expect(alert.id).toBe("FSA-AA-99-2099");
    expect(alert.type).toEqual(["AA"]);
    expect(alert.allergens).toEqual([{ id: "gluten", label: "Gluten" }]);
    expect(alert.products[0].batchCodes).toEqual(["L123", "01 Dec 2026"]);
  });

  it("possible match on brand + name, shown as possible not confirmed", () => {
    const m = matchRecalls({ barcode: "5000000000017", brand: "FixtureBrand", productName: "Sea Salt Crisps" }, [alert]);
    expect(m).toHaveLength(1);
    expect(m[0].level).toBe("possible");
    expect(m[0].concernsGluten).toBe(true);
  });

  it("confirmed match only when the exact barcode appears", () => {
    const withCode = parseFsaItem({ ...FSA_FIXTURE, productDetails: [{ productName: "Something", productCode: "5000000000017" }] });
    const m = matchRecalls({ barcode: "5000000000017", brand: "Unrelated", productName: "Other" }, [withCode]);
    expect(m[0].level).toBe("confirmed");
  });

  it("no match when brand differs, even if name is similar", () => {
    const m = matchRecalls({ barcode: "5000000000017", brand: "AnotherBrand", productName: "Sea Salt Crisps" }, [alert]);
    expect(m).toHaveLength(0);
  });

  it("no match when name words do not overlap enough", () => {
    const m = matchRecalls({ barcode: "5000000000017", brand: "FixtureBrand", productName: "Chocolate Fudge Brownie Ice Cream" }, [alert]);
    expect(m).toHaveLength(0);
  });

  it("no brand -> no fuzzy match at all", () => {
    expect(matchRecalls({ barcode: "1", brand: null, productName: "Sea Salt Crisps" }, [alert])).toHaveLength(0);
  });
});

describe("Open Prices", () => {
  it("parses observations with date and retailer", () => {
    const p = parseOpenPrices([{ price: 1.25, currency: "GBP", date: "2026-09-30", location: { osm_name: "FIXTURE Shop", osm_address_city: "London" } }, { price: 2 }], "5000000000017");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ price: 1.25, currency: "GBP", date: "2026-09-30", retailer: "FIXTURE Shop", location: "London" });
  });
});

describe("HTTP errors and timeouts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("timeout is reported, not thrown", async () => {
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    );
    const r = await fetchJson("open_food_facts", "https://x.invalid", { timeoutMs: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("timeout");
  });

  it("HTTP 500 and 429 are reported", async () => {
    vi.stubGlobal("fetch", async () => new Response("err", { status: 500 }));
    const a = await fetchJson("fsa_alerts", "https://x.invalid");
    expect(!a.ok && a.error.kind).toBe("http");
    vi.stubGlobal("fetch", async () => new Response("slow down", { status: 429 }));
    const b = await fetchJson("fsa_alerts", "https://x.invalid");
    expect(!b.ok && b.error.kind).toBe("rate_limited");
  });

  it("invalid JSON is reported", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200 }));
    const r = await fetchJson("open_food_facts", "https://x.invalid");
    expect(!r.ok && r.error.kind).toBe("parse");
  });

  it("rate limiter blocks over budget", () => {
    const l = new RateLimiter(2, 1000);
    expect([l.tryTake(0), l.tryTake(1), l.tryTake(2), l.tryTake(1500)]).toEqual([true, true, false, true]);
  });
});

describe("barcodes", () => {
  it("validates GS1 check digits", () => {
    expect(hasValidCheckDigit("3017620422003")).toBe(true); // real public example from OFF docs
    expect(hasValidCheckDigit("3017620422004")).toBe(false);
    expect(hasValidCheckDigit("012345678905")).toBe(true);
    expect(hasValidCheckDigit("96385074")).toBe(true);
  });
  it("UPC/EAN variants and equality", () => {
    expect(barcodeVariants("012345678905")).toContain("0012345678905");
    expect(sameGtin("012345678905", "0012345678905")).toBe(true);
  });
});
