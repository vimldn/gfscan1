import { describe, expect, it } from "vitest";
import { classify } from "@/lib/classify/engine";
import { analyseIngredients } from "@/lib/classify/ingredients";
import { RULES } from "@/lib/classify/rules";
import { manufacturerObs, NOW, obs } from "./fixtures/builders";

const run = (o: Parameters<typeof classify>[0], extra = {}) => classify(o, { now: NOW, ...extra });
const ruleIds = (r: ReturnType<typeof classify>) => r.hits.map((h) => h.ruleId);

describe("explicit gluten-free claims", () => {
  it("manufacturer claim, fresh, UK, no contradictions -> VERIFIED", () => {
    const r = run([manufacturerObs()]);
    expect(r.status).toBe("VERIFIED_GLUTEN_FREE");
    expect(r.decidedBy).toEqual(["R-VF-CLAIM"]);
    expect(r.claimBasis).toBe("manufacturer_claim");
  });

  it("certification source -> VERIFIED with certification basis", () => {
    const r = run([
      manufacturerObs({
        sourceType: "authorised_certification",
        gfClaims: [{ field: "licence", value: "crossed-grain", basis: "certification", assertedAt: "2026-08-01T00:00:00Z" }],
      }),
    ]);
    expect(r.status).toBe("VERIFIED_GLUTEN_FREE");
    expect(r.claimBasis).toBe("certification");
  });

  it("community gluten-free label alone is NOT verified", () => {
    const r = run([obs({ labels: ["en:gluten-free"], gfClaims: [{ field: "labels_tags", value: "en:gluten-free", basis: "community_label" }] })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-COMMUNITY-CLAIM");
    expect(r.claimBasis).toBe("community_label");
  });

  it("a manufacturer-basis claim from a community source is downgraded, never upgraded", () => {
    const r = run([obs({ gfClaims: [{ field: "x", value: "gf", basis: "manufacturer_claim" }] })]);
    expect(r.status).toBe("UNVERIFIED");
  });

  it("every hit references a known rule id and decisions carry evidence", () => {
    const r = run([manufacturerObs()]);
    for (const h of r.hits) expect(RULES[h.ruleId]).toBeDefined();
    const decisive = r.hits.find((h) => h.ruleId === "R-VF-CLAIM")!;
    expect(decisive.evidence[0].field).toBe("claims.glutenFree");
  });
});

describe("confirmed gluten ingredients", () => {
  it("wheat flour -> CONTAINS", () => {
    const r = run([obs({ ingredientsText: "Wheat flour, sugar, cocoa butter, milk powder." })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
    expect(r.decidedBy).toContain("R-CG-WHEAT");
  });

  it("declared gluten allergen with no text -> CONTAINS (structured field)", () => {
    const r = run([obs({ ingredientsText: null, ingredientsLang: null, allergens: ["en:gluten"] })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
    expect(r.decidedBy).toContain("R-CG-ALLERGEN");
  });

  it.each([
    ["Rye flour, water, salt", "R-CG-RYE"],
    ["Spelt flour, water", "R-CG-SPELT"],
    ["Triticale flakes", "R-CG-TRITICALE"],
    ["Durum wheat semolina", "R-CG-WHEAT"],
    ["Couscous, peppers", "R-CG-WHEAT-TYPES"],
    ["Vital gluten, water", "R-CG-GLUTEN-WORD"],
  ])("%s -> %s", (text, rule) => {
    const r = run([obs({ ingredientsText: text })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
    expect(r.decidedBy).toContain(rule);
  });

  it("buckwheat is not wheat", () => {
    const r = run([obs({ ingredientsText: "Buckwheat flour, water, salt." })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).not.toContain("R-CG-WHEAT");
  });

  it("OFF underscore emphasis is handled", () => {
    const r = run([obs({ ingredientsText: "Fortified _wheat_ flour, sugar" })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
  });

  it("'gluten-free' wording does not count as gluten ingredient", () => {
    const a = analyseIngredients("Rice flour, gluten-free baking powder, salt");
    expect(a.glutenMatches).toHaveLength(0);
  });

  it("allergen boilerplate mentioning gluten does not count", () => {
    const a = analyseIngredients("Potatoes, oil, salt. For allergens, including cereals containing gluten, see ingredients in bold.");
    expect(a.glutenMatches).toHaveLength(0);
    expect(a.precautionaryGluten).toHaveLength(0);
  });
});

describe("missing information fails safe", () => {
  it("no ingredients at all -> UNVERIFIED", () => {
    const r = run([obs({ ingredientsText: null, ingredientsLang: null })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-NO-INGREDIENTS");
  });

  it("allergen field absent is never treated as allergen-free", () => {
    const r = run([obs({ allergens: null })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-ALLERGENS-UNKNOWN");
  });

  it("empty allergen list with gluten-free-looking ingredients is still UNVERIFIED", () => {
    const r = run([obs({ allergens: [], ingredientsText: "Potatoes, sunflower oil, salt." })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-NO-CLAIM");
  });

  it("source-flagged incomplete ingredients -> UNVERIFIED", () => {
    const r = run([obs({ ingredientsComplete: false })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-INCOMPLETE");
  });

  it("non-English declaration is not analysed", () => {
    const r = run([obs({ ingredientsText: "Farine de blé, sucre", ingredientsLang: "fr" })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-NOT-ENGLISH");
  });

  it("no observations -> UNVERIFIED", () => {
    const r = run([]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toEqual(["R-UV-NO-DATA"]);
  });
});

describe("conflicts", () => {
  it("gluten-free label plus wheat ingredient -> UNVERIFIED conflict", () => {
    const r = run([
      obs({ ingredientsText: "Wheat flour, sugar", gfClaims: [{ field: "labels_tags", value: "en:gluten-free", basis: "community_label" }] }),
    ]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toEqual(["R-CONFLICT-CLAIM"]);
  });

  it("two same-market sources disagree -> UNVERIFIED", () => {
    const r = run([
      obs({ id: "a", providerRecordId: "a", ingredientsText: "Wheat flour, salt" }),
      obs({ id: "b", provider: "usda_fdc", providerRecordId: "b", ingredientsText: "Rice flour, salt" }),
    ]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toEqual(["R-CONFLICT-SOURCES"]);
  });

  it("manufacturer claim plus may-contain gluten -> UNVERIFIED", () => {
    const r = run([manufacturerObs({ traces: ["en:gluten"] })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toEqual(["R-UV-CLAIM-WITH-PAL"]);
  });
});

describe("products from different countries", () => {
  it("fresh manufacturer claim for a non-UK listing cannot be VERIFIED for GB", () => {
    const r = run([manufacturerObs({ countries: ["en:france"], markets: ["FR"] })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(ruleIds(r)).toContain("R-MKT-OTHER");
  });

  it("UK observation is used in preference to another market's formulation", () => {
    const r = run([
      obs({ id: "uk", providerRecordId: "uk", ingredientsText: "Maize, oil, salt" }),
      obs({ id: "us", provider: "usda_fdc", providerRecordId: "us", markets: ["US"], countries: ["United States"], ingredientsText: "Wheat flour, oil" }),
    ]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.observationIds).toContain("uk");
    expect(r.decidedBy).not.toContain("R-CG-WHEAT");
  });

  it("non-UK data that lists wheat still reports CONTAINS, with a market note", () => {
    const r = run([obs({ markets: ["US"], countries: ["United States"], ingredientsText: "Enriched wheat flour" })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
    expect(ruleIds(r)).toContain("R-MKT-OTHER");
  });
});

describe("UK special cases", () => {
  it("gluten-free wheat starch in a manufacturer GF product stays VERIFIED", () => {
    const r = run([manufacturerObs({ ingredientsText: "Gluten-free wheat starch, rice flour, sugar, yeast" })]);
    expect(r.status).toBe("VERIFIED_GLUTEN_FREE");
    expect(ruleIds(r)).toContain("R-EX-WHEAT-STARCH");
  });

  it("wheat starch (gluten free) is recognised", () => {
    const a = analyseIngredients("Wheat starch (gluten free), water");
    expect(a.glutenMatches).toHaveLength(0);
    expect(a.exemptMatches[0].ruleId).toBe("R-EX-WHEAT-STARCH");
  });

  it("plain wheat starch is NOT exempt", () => {
    const r = run([obs({ ingredientsText: "Wheat starch, sugar" })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
  });

  it("plain oats -> CONTAINS (UK law treats oats as gluten cereal)", () => {
    const r = run([obs({ ingredientsText: "Rolled oats, honey" })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
    expect(r.decidedBy).toContain("R-CG-OATS");
  });

  it("gluten-free oats are not counted as gluten", () => {
    const r = run([obs({ ingredientsText: "Gluten free oats (85%), honey" })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(ruleIds(r)).toContain("R-EX-GF-OATS");
    expect(r.decidedBy).not.toContain("R-CG-OATS");
  });

  it("barley malt extract -> CONTAINS", () => {
    const r = run([obs({ ingredientsText: "Rice, sugar, barley malt extract, salt" })]);
    expect(r.status).toBe("CONTAINS_GLUTEN");
    expect(r.decidedBy).toEqual(expect.arrayContaining(["R-CG-BARLEY", "R-CG-MALT"]));
  });

  it("maltodextrin and maltitol are not malt", () => {
    const a = analyseIngredients("Maltodextrin, maltitol, maltose");
    expect(a.glutenMatches).toHaveLength(0);
  });

  it("barley malt vinegar alone is a special case, not counted as gluten ingredient", () => {
    const a = analyseIngredients("Potatoes, oil, barley malt vinegar powder, salt");
    expect(a.glutenMatches).toHaveLength(0);
    expect(a.exemptMatches[0].ruleId).toBe("R-EX-MALT-VINEGAR");
  });

  it("declared gluten allergen tracing only to malt vinegar -> UNVERIFIED (R-EX-ONLY), not either extreme", () => {
    const r = run([obs({ ingredientsText: "Potatoes, oil, barley malt vinegar, salt", allergens: ["en:gluten"] })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toEqual(["R-EX-ONLY"]);
  });

  it("wheat glucose syrup is exempt", () => {
    const a = analyseIngredients("Sugar, glucose syrup (wheat), gelatine");
    expect(a.glutenMatches).toHaveLength(0);
    expect(a.exemptMatches[0].ruleId).toBe("R-EX-GLUCOSE");
  });
});

describe("precautionary allergen warnings", () => {
  it("may contain wheat is a separate warning, not CONTAINS", () => {
    const r = run([obs({ ingredientsText: "Milk chocolate (sugar, cocoa butter, milk). May contain wheat and nuts." })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.precautionary.map((p) => p.ruleId)).toContain("R-PAL-TEXT");
    expect(r.decidedBy).not.toContain("R-CG-WHEAT");
  });

  it("traces tag gluten is a separate warning", () => {
    const r = run([obs({ traces: ["en:gluten"] })]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.precautionary[0].ruleId).toBe("R-PAL-TRACES");
  });

  it("factory statements are captured", () => {
    const a = analyseIngredients("Maize, oil. Made in a factory that also handles wheat.");
    expect(a.glutenMatches).toHaveLength(0);
    expect(a.precautionaryGluten).toHaveLength(1);
  });
});

describe("stale and duplicate records", () => {
  it("stale manufacturer claim cannot be VERIFIED", () => {
    const r = run([
      manufacturerObs({
        sourceLastModified: "2024-01-01T00:00:00Z",
        gfClaims: [{ field: "claims.glutenFree", value: "true", basis: "manufacturer_claim", assertedAt: "2024-01-01T00:00:00Z" }],
      }),
    ]);
    expect(r.status).toBe("UNVERIFIED");
    expect(r.decidedBy).toContain("R-UV-STALE-CLAIM");
  });

  it("claim with unknown date cannot be VERIFIED", () => {
    const r = run([manufacturerObs({ sourceLastModified: null, gfClaims: [{ field: "c", value: "gf", basis: "manufacturer_claim", assertedAt: null }] })]);
    expect(r.status).toBe("UNVERIFIED");
  });

  it("old record gets an informational staleness note", () => {
    const r = run([obs({ sourceLastModified: "2019-01-01T00:00:00Z" })]);
    expect(ruleIds(r)).toContain("R-INFO-STALE");
  });

  it("duplicates from the same provider collapse to the newest", () => {
    const older = obs({ id: "old", providerRecordId: "X", sourceLastModified: "2020-01-01T00:00:00Z", ingredientsText: "Wheat flour" });
    const newer = obs({ id: "new", providerRecordId: "X", sourceLastModified: "2026-01-01T00:00:00Z", ingredientsText: "Rice flour" });
    const r = run([older, newer]);
    expect(r.observationIds).toEqual(["new"]);
    expect(ruleIds(r)).toContain("R-INFO-DUPLICATE");
    expect(r.status).toBe("UNVERIFIED");
  });
});

describe("provider errors", () => {
  it("provider error with no data -> UNVERIFIED and error is recorded", () => {
    const r = run([], { providerErrors: [{ provider: "open_food_facts", kind: "timeout", message: "Timed out" }] });
    expect(r.status).toBe("UNVERIFIED");
    expect(ruleIds(r)).toContain("R-INFO-PROVIDER-ERROR");
  });
});

describe("determinism", () => {
  it("same input gives identical output", () => {
    const o = [obs({ id: "fixed", ingredientsText: "Wheat flour, May contain barley" })];
    expect(JSON.stringify(run(o))).toBe(JSON.stringify(run(o)));
  });
});
