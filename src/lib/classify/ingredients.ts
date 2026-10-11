/**
 * Deterministic ingredient-text analysis for UK gluten rules.
 *
 * Pure functions, no network, no probabilistic models. Every pattern here is
 * explicit and covered by tests. Patterns operate on English text only; the
 * caller must not pass non-English declarations.
 */

export interface TextMatch {
  /** Rule id that produced this match */
  ruleId: string;
  /** Matched text as it appears (normalised lower-case) */
  term: string;
  /** Human-readable explanation */
  note: string;
}

export interface IngredientAnalysis {
  normalised: string;
  /** Text with precautionary clauses and labelling boilerplate removed */
  declarationOnly: string;
  /** Non-exempt gluten-containing cereal matches */
  glutenMatches: TextMatch[];
  /** Ingredients covered by UK/EU exemptions or special cases */
  exemptMatches: TextMatch[];
  /** Ambiguous ingredients whose cereal source is not stated */
  ambiguousMatches: TextMatch[];
  /** Precautionary clauses that mention a gluten cereal */
  precautionaryGluten: string[];
  /** All precautionary clauses found (for display) */
  precautionaryClauses: string[];
}

export function normaliseText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    // OFF marks emphasised allergens with underscores: _wheat_
    .replace(/_/g, " ")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Labelling boilerplate that mentions gluten without declaring it. */
const BOILERPLATE: RegExp[] = [
  /for allergens,? (including cereals containing gluten,? )?see (the )?ingredients (in|listed in) (bold|capitals|capital letters|underlined)[^.;]*/g,
  /allergens? (are )?(shown|highlighted|listed|emphasised|emphasized) in (bold|capitals|capital letters)[^.;]*/g,
  /cereals containing gluten,? see ingredients in bold/g,
  /suitable for (vegetarians|vegans)[^.;]*/g,
];

/** Precautionary allergen labelling (PAL). Extracted and kept separate. */
const PRECAUTIONARY: RegExp =
  /(may (also )?contain|may be present|traces? of|made (in|on) (a )?(factory|site|kitchen|premises|equipment|line)|produced (in|on) (a )?(factory|site|premises|equipment|line)|manufactured (in|on) (a )?(factory|site|premises|equipment|line)|packed (in|on) (a )?(factory|site|premises|line)|(factory|site|kitchen|bakery) (that|which) (also )?(handles|uses)|not suitable for (those|people|customers) with)[^.;]*/g;

/**
 * UK/EU exemptions and special cases. Order matters: these are matched and
 * removed BEFORE the gluten-cereal patterns run, so "gluten-free wheat starch"
 * does not also count as "wheat".
 */
const EXEMPT_PATTERNS: { ruleId: string; re: RegExp; note: string }[] = [
  {
    ruleId: "R-EX-WHEAT-STARCH",
    re: /(gluten[\s-]*free wheat starch|wheat starch \(gluten[\s-]*free\)|codex(-quality)? wheat starch)/g,
    note:
      "Gluten-free (Codex) wheat starch: permitted in products labelled gluten-free in the UK (≤20 mg/kg).",
  },
  {
    ruleId: "R-EX-GLUCOSE",
    re: /((wheat|barley)[\s-]*(based )?(glucose|glucose[\s-]fructose|fructose[\s-]glucose|dextrose) syrup|(glucose|glucose[\s-]fructose|fructose[\s-]glucose) syrup \((from |contains )?(wheat|barley)\)|dextrose \((from )?wheat\)|wheat dextrose|maltodextrin \((from )?wheat\)|wheat maltodextrin)/g,
    note:
      "Wheat/barley-based glucose syrups, wheat dextrose and wheat maltodextrins are exempt from allergen labelling (Retained Regulation (EU) 1169/2011, Annex II).",
  },
  {
    ruleId: "R-EX-GF-OATS",
    re: /(gluten[\s-]*free (rolled |jumbo |porridge |whole[\s-]?grain )?oat(s|meal| flakes| flour| bran)?|oat(s|meal| flakes| flour)? \(gluten[\s-]*free\)|uncontaminated oats?|pure oats? \(gluten[\s-]*free\))/g,
    note:
      "Oats stated as gluten-free (uncontaminated). Most people with coeliac disease tolerate these, but a small number react to avenin.",
  },
  {
    ruleId: "R-EX-MALT-VINEGAR",
    re: /((barley )?malt vinegar( extract| powder)?)/g,
    note:
      "Barley malt vinegar: Coeliac UK advises it is generally acceptable because gluten levels at typical usage are very low, but barley must still be declared.",
  },
];

/** Gluten-containing cereals and derivatives (non-exempt). */
const GLUTEN_PATTERNS: { ruleId: string; re: RegExp; note: string }[] = [
  { ruleId: "R-CG-WHEAT", re: /\bwheat\w*/g, note: "Wheat (incl. wheat flour, wheat protein)" },
  { ruleId: "R-CG-BARLEY", re: /\bbarley\b/g, note: "Barley" },
  { ruleId: "R-CG-RYE", re: /\brye\b/g, note: "Rye" },
  { ruleId: "R-CG-SPELT", re: /\bspelt\b/g, note: "Spelt (a type of wheat)" },
  { ruleId: "R-CG-TRITICALE", re: /\btriticale\b/g, note: "Triticale (wheat × rye hybrid)" },
  {
    ruleId: "R-CG-WHEAT-TYPES",
    re: /\b(durum|semolina|kamut|khorasan|einkorn|emmer|farro|freekeh|bulgh?ur|bulgar|couscous|seitan)\b/g,
    note: "Wheat variety or wheat product",
  },
  {
    ruleId: "R-CG-MALT",
    re: /\bmalt(ed)?\b(?!\s*vinegar)/g,
    note: "Malt / malt extract / malted grain (usually barley); not exempt",
  },
  {
    ruleId: "R-CG-OATS",
    re: /\boat(s|meal)?\b/g,
    note:
      "Oats not stated as gluten-free. Under UK allergen law oats are a cereal containing gluten and are often cross-contaminated.",
  },
  {
    ruleId: "R-CG-GLUTEN-WORD",
    // "gluten" as an ingredient (e.g. "wheat gluten", "vital gluten"), not "gluten-free"
    re: /(?<!\bno |\bfree from )\bgluten\b(?![\s-]*free)/g,
    note: "Gluten listed as an ingredient",
  },
];

/** Ingredients whose cereal source is not stated. Informational only. */
const AMBIGUOUS_PATTERNS: { ruleId: string; re: RegExp; note: string }[] = [
  {
    ruleId: "R-AMB-UNSPECIFIED",
    re: /\b(flour|modified starch|starch|breadcrumbs?|rusk|batter|cereal extract|stuffing|pasta|noodles?|crumb)\b/g,
    note: "Ingredient source cereal not stated in the declaration",
  },
];

/** Remove matches from text so later patterns cannot double count them. */
function extract(
  text: string,
  patterns: { ruleId: string; re: RegExp; note: string }[],
): { remaining: string; matches: TextMatch[] } {
  let remaining = text;
  const matches: TextMatch[] = [];
  for (const p of patterns) {
    remaining = remaining.replace(new RegExp(p.re.source, p.re.flags), (m) => {
      matches.push({ ruleId: p.ruleId, term: m.trim(), note: p.note });
      return " ";
    });
  }
  return { remaining, matches };
}

export const GLUTEN_CEREAL_WORD =
  /\b(gluten|wheat\w*|barley|rye|oats?|spelt|triticale|kamut|khorasan|einkorn|emmer|durum|semolina|malt(ed)?|cereals? containing gluten)\b/;

export function analyseIngredients(rawText: string): IngredientAnalysis {
  const normalised = normaliseText(rawText);

  let text = normalised;
  for (const re of BOILERPLATE) text = text.replace(new RegExp(re.source, re.flags), " ");

  const precautionaryClauses: string[] = [];
  text = text.replace(new RegExp(PRECAUTIONARY.source, PRECAUTIONARY.flags), (m) => {
    precautionaryClauses.push(m.trim());
    return " ";
  });
  const precautionaryGluten = precautionaryClauses.filter((c) => GLUTEN_CEREAL_WORD.test(c));

  const declarationOnly = text.replace(/\s+/g, " ").trim();

  const ex = extract(declarationOnly, EXEMPT_PATTERNS);
  const gl = extract(ex.remaining, GLUTEN_PATTERNS);
  const amb = extract(gl.remaining, AMBIGUOUS_PATTERNS);

  return {
    normalised,
    declarationOnly,
    glutenMatches: dedupe(gl.matches),
    exemptMatches: dedupe(ex.matches),
    ambiguousMatches: dedupe(amb.matches),
    precautionaryGluten,
    precautionaryClauses,
  };
}

function dedupe(ms: TextMatch[]): TextMatch[] {
  const seen = new Set<string>();
  return ms.filter((m) => {
    const k = `${m.ruleId}|${m.term}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
