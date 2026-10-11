/**
 * Rule registry. Each rule has a stable id that is stored with every
 * classification so results can be audited and reproduced.
 *
 * Bump RULE_VERSION whenever any rule's behaviour changes.
 */
export const RULE_VERSION = "2026.10.1";

export interface RuleDef {
  id: string;
  title: string;
  description: string;
}

export const RULES: Record<string, RuleDef> = {
  // ---- Primary: contains gluten
  "R-CG-ALLERGEN": {
    id: "R-CG-ALLERGEN",
    title: "Gluten declared as an allergen",
    description:
      "The source's structured allergen field lists gluten or a gluten-containing cereal (wheat, barley, rye, oats, spelt, kamut).",
  },
  "R-CG-WHEAT": { id: "R-CG-WHEAT", title: "Wheat in ingredients", description: "Ingredient declaration contains wheat (any word beginning 'wheat'; buckwheat is excluded)." },
  "R-CG-BARLEY": { id: "R-CG-BARLEY", title: "Barley in ingredients", description: "Ingredient declaration contains barley (malt vinegar handled separately)." },
  "R-CG-RYE": { id: "R-CG-RYE", title: "Rye in ingredients", description: "Ingredient declaration contains rye." },
  "R-CG-SPELT": { id: "R-CG-SPELT", title: "Spelt in ingredients", description: "Spelt is a type of wheat." },
  "R-CG-TRITICALE": { id: "R-CG-TRITICALE", title: "Triticale in ingredients", description: "Wheat × rye hybrid." },
  "R-CG-WHEAT-TYPES": { id: "R-CG-WHEAT-TYPES", title: "Wheat variety or product", description: "Durum, semolina, kamut/khorasan, einkorn, emmer, farro, freekeh, bulgur, couscous, seitan." },
  "R-CG-MALT": { id: "R-CG-MALT", title: "Malt / malt extract", description: "Malt, malted grain and malt extract are usually barley and are not exempt. Malt vinegar is handled by R-EX-MALT-VINEGAR." },
  "R-CG-OATS": { id: "R-CG-OATS", title: "Oats not stated gluten-free", description: "UK allergen law treats oats as a cereal containing gluten. Only oats explicitly stated as gluten-free are exempted (R-EX-GF-OATS)." },
  "R-CG-GLUTEN-WORD": { id: "R-CG-GLUTEN-WORD", title: "Gluten as ingredient", description: "The word 'gluten' appears as an ingredient (e.g. wheat gluten), not as part of 'gluten-free'." },

  // ---- Exemptions / special cases (never on their own prove gluten-free)
  "R-EX-WHEAT-STARCH": { id: "R-EX-WHEAT-STARCH", title: "Gluten-free wheat starch", description: "Codex wheat starch may be used in gluten-free products (≤20 mg/kg). Not counted as a gluten ingredient." },
  "R-EX-GLUCOSE": { id: "R-EX-GLUCOSE", title: "Exempt cereal derivative", description: "Wheat/barley glucose syrups, wheat dextrose and wheat maltodextrin are exempt from allergen labelling under retained Regulation (EU) 1169/2011 Annex II." },
  "R-EX-GF-OATS": { id: "R-EX-GF-OATS", title: "Gluten-free oats", description: "Oats explicitly described as gluten-free/uncontaminated. A minority of coeliacs react to avenin." },
  "R-EX-MALT-VINEGAR": { id: "R-EX-MALT-VINEGAR", title: "Barley malt vinegar", description: "Coeliac UK considers barley malt vinegar generally acceptable. Recorded but not counted as a gluten ingredient." },
  "R-EX-ONLY": {
    id: "R-EX-ONLY",
    title: "Declared gluten only from exempt/special-case ingredient",
    description:
      "The allergen field declares gluten, but the only cereal ingredients found are exempt or special-case ones. The app cannot resolve this deterministically, so the result is UNVERIFIED rather than either extreme.",
  },

  // ---- Verified
  "R-VF-CLAIM": {
    id: "R-VF-CLAIM",
    title: "Current manufacturer or certification gluten-free claim",
    description:
      "An explicit gluten-free claim from a manufacturer-supplied or authorised certification source, for this exact barcode and target market, updated within the freshness window, with no contradicting evidence.",
  },

  // ---- Unverified reasons
  "R-UV-COMMUNITY-CLAIM": { id: "R-UV-COMMUNITY-CLAIM", title: "Community-reported gluten-free label only", description: "A community database records a gluten-free label. This is useful but is not an independently verified manufacturer claim." },
  "R-UV-NO-CLAIM": { id: "R-UV-NO-CLAIM", title: "No gluten ingredients listed, but no gluten-free claim", description: "Absence of a known gluten ingredient does not establish that a product is gluten-free (cross-contact, unlisted processing aids)." },
  "R-UV-NO-INGREDIENTS": { id: "R-UV-NO-INGREDIENTS", title: "No ingredient declaration", description: "No ingredient list is available from any source." },
  "R-UV-NOT-ENGLISH": { id: "R-UV-NOT-ENGLISH", title: "Ingredients not available in English", description: "The rule engine only analyses English declarations; other languages are shown but not analysed." },
  "R-UV-INCOMPLETE": { id: "R-UV-INCOMPLETE", title: "Source marks ingredients incomplete", description: "The source itself flags the ingredient list as incomplete." },
  "R-UV-ALLERGENS-UNKNOWN": { id: "R-UV-ALLERGENS-UNKNOWN", title: "Allergen field absent", description: "The allergen field is missing. Absence is never treated as 'allergen-free'." },
  "R-UV-STALE-CLAIM": { id: "R-UV-STALE-CLAIM", title: "Claim outside freshness window", description: "A strong claim exists but the source has not been updated within the freshness window, so it cannot support VERIFIED." },
  "R-UV-CLAIM-WITH-PAL": { id: "R-UV-CLAIM-WITH-PAL", title: "Gluten-free claim alongside 'may contain gluten'", description: "A gluten-free claim and a precautionary gluten warning contradict each other." },
  "R-UV-NO-DATA": { id: "R-UV-NO-DATA", title: "No source data", description: "No provider returned a record for this barcode, or all providers failed." },

  // ---- Conflicts
  "R-CONFLICT-CLAIM": { id: "R-CONFLICT-CLAIM", title: "Gluten-free claim conflicts with gluten ingredient", description: "A gluten-free claim is recorded but the declaration also lists a non-exempt gluten ingredient." },
  "R-CONFLICT-SOURCES": { id: "R-CONFLICT-SOURCES", title: "Sources disagree", description: "For the same barcode and market, one complete English declaration lists a gluten ingredient and another does not." },

  // ---- Market
  "R-MKT-OTHER": { id: "R-MKT-OTHER", title: "Not recorded as sold in target market", description: "No source records this barcode as sold in the target market. Formulations can differ by country, so VERIFIED is not possible." },

  // ---- Warnings & info
  "R-PAL-TRACES": { id: "R-PAL-TRACES", title: "Precautionary gluten warning (traces field)", description: "The source's traces field lists gluten. Shown separately; not treated as confirmed gluten content." },
  "R-PAL-TEXT": { id: "R-PAL-TEXT", title: "Precautionary gluten warning (text)", description: "A 'may contain'/factory statement mentions a gluten cereal. Shown separately; not treated as confirmed gluten content." },
  "R-AMB-UNSPECIFIED": { id: "R-AMB-UNSPECIFIED", title: "Unspecified cereal ingredient", description: "Ingredients such as 'flour' or 'starch' with no stated source." },
  "R-INFO-STALE": { id: "R-INFO-STALE", title: "Old source record", description: "The source record has not been updated for over two years. Recipes change." },
  "R-INFO-DUPLICATE": { id: "R-INFO-DUPLICATE", title: "Duplicate record collapsed", description: "Multiple records from the same provider for this barcode; the most recently updated one was used." },
  "R-INFO-PROVIDER-ERROR": { id: "R-INFO-PROVIDER-ERROR", title: "Provider unavailable", description: "A data provider failed or timed out; the result may be missing evidence." },
};

/** Cereal allergen tags (Open Food Facts taxonomy) treated as declared gluten. */
export const GLUTEN_ALLERGEN_TAGS = new Set([
  "en:gluten",
  "en:wheat",
  "en:barley",
  "en:rye",
  "en:oats",
  "en:spelt",
  "en:kamut",
  "en:cereals-containing-gluten",
]);

/** Days within which a strong claim's source must have been updated. */
export const CLAIM_FRESHNESS_DAYS = 365;
/** Days after which an informational staleness note is shown. */
export const INFO_STALE_DAYS = 730;
