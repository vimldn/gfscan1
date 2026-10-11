import type {
  ClaimBasis,
  ClassificationResult,
  EvidenceRef,
  GlutenStatus,
  ProviderError,
  RuleHit,
  SourceObservation,
} from "../types";
import { analyseIngredients, GLUTEN_CEREAL_WORD, type IngredientAnalysis } from "./ingredients";
import {
  CLAIM_FRESHNESS_DAYS,
  GLUTEN_ALLERGEN_TAGS,
  INFO_STALE_DAYS,
  RULE_VERSION,
  RULES,
} from "./rules";

export interface ClassifyOptions {
  targetMarket?: string; // ISO alpha-2, default GB
  now?: Date;
  providerErrors?: ProviderError[];
}

const DAY = 86_400_000;

function ev(o: SourceObservation, field: string, value: string): EvidenceRef {
  return { observationId: o.id, provider: o.provider, field, value };
}

function hit(ruleId: string, outcome: RuleHit["outcome"], evidence: EvidenceRef[], extra?: string): RuleHit {
  const def = RULES[ruleId];
  if (!def) throw new Error(`Unknown rule ${ruleId}`);
  return { ruleId, outcome, message: extra ? `${def.title}: ${extra}` : def.title, evidence };
}

function ageDays(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / DAY;
}

/** English declaration if available, otherwise null. Never translates. */
function englishText(o: SourceObservation): string | null {
  if (!o.ingredientsText || !o.ingredientsText.trim()) return null;
  return o.ingredientsLang === "en" ? o.ingredientsText : null;
}

/** Collapse duplicate records from the same provider, keeping the newest. */
export function dedupeObservations(obs: SourceObservation[]): { kept: SourceObservation[]; dropped: SourceObservation[] } {
  const byKey = new Map<string, SourceObservation>();
  const dropped: SourceObservation[] = [];
  for (const o of obs) {
    const key = `${o.provider}|${o.providerRecordId}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, o);
      continue;
    }
    const a = Date.parse(cur.sourceLastModified ?? "") || 0;
    const b = Date.parse(o.sourceLastModified ?? "") || 0;
    if (b > a) {
      dropped.push(cur);
      byKey.set(key, o);
    } else dropped.push(o);
  }
  return { kept: [...byKey.values()], dropped };
}

interface ObsSignals {
  o: SourceObservation;
  text: string | null;
  analysis: IngredientAnalysis | null;
  declaredGluten: string[]; // matching allergen tags
}

/**
 * Classify a product from its source observations. Pure and deterministic:
 * the same observations, options and RULE_VERSION always give the same result.
 */
export function classify(observationsIn: SourceObservation[], opts: ClassifyOptions = {}): ClassificationResult {
  const now = opts.now ?? new Date();
  const market = opts.targetMarket ?? "GB";
  const hits: RuleHit[] = [];
  const precautionary: RuleHit[] = [];

  for (const e of opts.providerErrors ?? []) {
    hits.push({
      ruleId: "R-INFO-PROVIDER-ERROR",
      outcome: "info",
      message: `${RULES["R-INFO-PROVIDER-ERROR"].title}: ${e.provider} (${e.kind}) — ${e.message}`,
      evidence: [],
    });
  }

  // Only observations carrying product data take part (prices/recalls are separate).
  const productObs = observationsIn.filter((o) => o.provider !== "open_prices" && o.provider !== "fsa_alerts");
  const { kept, dropped } = dedupeObservations(productObs);
  for (const d of dropped) {
    hits.push(hit("R-INFO-DUPLICATE", "info", [ev(d, "providerRecordId", d.providerRecordId)]));
  }

  const result = (status: GlutenStatus, decidedBy: string[], claimBasis: ClaimBasis): ClassificationResult => ({
    status,
    ruleVersion: RULE_VERSION,
    targetMarket: market,
    claimBasis,
    decidedBy,
    hits,
    precautionary,
    observationIds: kept.map((o) => o.id),
    classifiedAt: now.toISOString(),
  });

  if (kept.length === 0) {
    hits.push(hit("R-UV-NO-DATA", "unverified", []));
    return result("UNVERIFIED", ["R-UV-NO-DATA"], "none");
  }

  // ---- Market partition. Never merge different markets' formulations into a verified claim.
  const inMarket = kept.filter((o) => o.markets.includes(market));
  const considered = inMarket.length > 0 ? inMarket : kept;
  const marketMismatch = inMarket.length === 0;
  if (marketMismatch) {
    hits.push(
      hit(
        "R-MKT-OTHER",
        "info",
        kept.map((o) => ev(o, "countries", o.countries.join(", ") || "(none recorded)")),
        `no source records this product as sold in ${market}`,
      ),
    );
  }

  // ---- Per-observation signals
  const signals: ObsSignals[] = considered.map((o) => {
    const text = englishText(o);
    return {
      o,
      text,
      analysis: text ? analyseIngredients(text) : null,
      declaredGluten: (o.allergens ?? []).filter((t) => GLUTEN_ALLERGEN_TAGS.has(t)),
    };
  });

  // Info: staleness
  for (const s of signals) {
    const age = ageDays(s.o.sourceLastModified, now);
    if (age !== null && age > INFO_STALE_DAYS) {
      hits.push(hit("R-INFO-STALE", "info", [ev(s.o, "sourceLastModified", s.o.sourceLastModified!)], `${Math.floor(age / 365)} years old`));
    }
  }

  // ---- Precautionary warnings (separate from status)
  for (const s of signals) {
    const traceTags = (s.o.traces ?? []).filter((t) => GLUTEN_ALLERGEN_TAGS.has(t));
    if (traceTags.length) {
      precautionary.push(hit("R-PAL-TRACES", "warning", traceTags.map((t) => ev(s.o, "traces", t))));
    }
    for (const c of s.analysis?.precautionaryGluten ?? []) {
      precautionary.push(hit("R-PAL-TEXT", "warning", [ev(s.o, "ingredientsText", c)], `“${c}”`));
    }
  }
  hits.push(...precautionary);

  // ---- Contains evidence
  const containsHits: RuleHit[] = [];
  const exemptOnlyHits: RuleHit[] = [];
  const obsWithGluten = new Set<string>();
  const obsCompleteNoGluten = new Set<string>();

  for (const s of signals) {
    const a = s.analysis;
    for (const m of a?.exemptMatches ?? []) {
      hits.push(hit(m.ruleId, "info", [ev(s.o, "ingredientsText", m.term)], m.term));
    }
    for (const m of a?.ambiguousMatches ?? []) {
      hits.push(hit(m.ruleId, "info", [ev(s.o, "ingredientsText", m.term)], m.term));
    }
    const textGluten = a?.glutenMatches ?? [];
    for (const m of textGluten) {
      containsHits.push(hit(m.ruleId, "contains", [ev(s.o, "ingredientsText", m.term)], m.term));
    }

    // Declared, but the only cereal found in the English text is exempt/special-case.
    const onlyExempt = s.declaredGluten.length > 0 && !!a && textGluten.length === 0 && a.exemptMatches.length > 0;
    if (s.declaredGluten.length) {
      const allergenEvidence = s.declaredGluten.map((t) => ev(s.o, "allergens", t));
      if (onlyExempt) {
        exemptOnlyHits.push(
          hit(
            "R-EX-ONLY",
            "unverified",
            [...allergenEvidence, ...a!.exemptMatches.map((m) => ev(s.o, "ingredientsText", m.term))],
            a!.exemptMatches.map((m) => m.term).join(", "),
          ),
        );
      } else {
        containsHits.push(hit("R-CG-ALLERGEN", "contains", allergenEvidence, s.declaredGluten.join(", ")));
      }
    }

    if (textGluten.length || (s.declaredGluten.length && !onlyExempt)) {
      obsWithGluten.add(s.o.id);
    } else if (s.text && s.o.ingredientsComplete !== false && s.declaredGluten.length === 0) {
      obsCompleteNoGluten.add(s.o.id);
    }
  }

  // ---- Claims
  const claimsCommunity: RuleHit[] = [];
  const claimsStrong: { s: ObsSignals; h: RuleHit; fresh: boolean }[] = [];
  for (const s of signals) {
    for (const c of s.o.gfClaims) {
      const e = [ev(s.o, c.field, c.value)];
      if (c.basis === "community_label") {
        claimsCommunity.push(hit("R-UV-COMMUNITY-CLAIM", "unverified", e, c.value));
      } else if (s.o.sourceType === "manufacturer" || s.o.sourceType === "authorised_certification") {
        const age = ageDays(c.assertedAt ?? s.o.sourceLastModified, now);
        const fresh = age !== null && age <= CLAIM_FRESHNESS_DAYS;
        claimsStrong.push({ s, h: hit("R-VF-CLAIM", "verified", e, c.value), fresh });
      } else {
        // A "manufacturer" basis from a non-authoritative source is downgraded, never upgraded.
        claimsCommunity.push(hit("R-UV-COMMUNITY-CLAIM", "unverified", e, `${c.value} (reported via ${s.o.providerName})`));
      }
    }
  }
  const anyClaim = claimsCommunity.length > 0 || claimsStrong.length > 0;
  const claimBasis: ClaimBasis = claimsStrong.some((c) => c.s.o.sourceType === "authorised_certification")
    ? "certification"
    : claimsStrong.length
      ? "manufacturer_claim"
      : claimsCommunity.length
        ? "community_label"
        : "none";

  // ===== Decision =====

  // 1. Gluten ingredient AND a gluten-free claim -> conflict, UNVERIFIED.
  if (containsHits.length && anyClaim) {
    hits.push(...containsHits, ...claimsCommunity, ...claimsStrong.map((c) => c.h));
    const h = hit(
      "R-CONFLICT-CLAIM",
      "unverified",
      [...containsHits, ...claimsCommunity, ...claimsStrong.map((c) => c.h)].flatMap((x) => x.evidence),
    );
    hits.push(h);
    return result("UNVERIFIED", ["R-CONFLICT-CLAIM"], claimBasis);
  }

  // 2. Sources disagree (same market).
  if (obsWithGluten.size > 0 && obsCompleteNoGluten.size > 0) {
    hits.push(...containsHits);
    const disagreeing = signals.filter((s) => obsCompleteNoGluten.has(s.o.id));
    hits.push(
      hit("R-CONFLICT-SOURCES", "unverified", [
        ...containsHits.flatMap((h) => h.evidence),
        ...disagreeing.map((s) => ev(s.o, "ingredientsText", s.text!.slice(0, 200))),
      ]),
    );
    return result("UNVERIFIED", ["R-CONFLICT-SOURCES"], claimBasis);
  }

  // 3. Contains gluten.
  if (containsHits.length) {
    hits.push(...containsHits, ...exemptOnlyHits);
    return result("CONTAINS_GLUTEN", uniq(containsHits.map((h) => h.ruleId)), claimBasis);
  }

  // 4. Declared gluten that only traces back to exempt ingredients.
  if (exemptOnlyHits.length) {
    hits.push(...exemptOnlyHits);
    return result("UNVERIFIED", ["R-EX-ONLY"], claimBasis);
  }

  // 5. Strong, current, market-matched claim with no contradictions -> VERIFIED.
  const freshStrong = claimsStrong.filter((c) => c.fresh);
  const staleStrong = claimsStrong.filter((c) => !c.fresh);
  if (freshStrong.length && !marketMismatch) {
    if (precautionary.length) {
      hits.push(...freshStrong.map((c) => c.h));
      hits.push(hit("R-UV-CLAIM-WITH-PAL", "unverified", precautionary.flatMap((p) => p.evidence)));
      return result("UNVERIFIED", ["R-UV-CLAIM-WITH-PAL"], claimBasis);
    }
    hits.push(...freshStrong.map((c) => c.h), ...claimsCommunity);
    return result("VERIFIED_GLUTEN_FREE", ["R-VF-CLAIM"], claimBasis);
  }

  // 6. Everything else is UNVERIFIED — record every reason.
  const reasons: string[] = [];
  if (staleStrong.length) {
    hits.push(hit("R-UV-STALE-CLAIM", "unverified", staleStrong.flatMap((c) => c.h.evidence)));
    reasons.push("R-UV-STALE-CLAIM");
  }
  if (freshStrong.length && marketMismatch) reasons.push("R-MKT-OTHER");
  if (claimsCommunity.length) {
    hits.push(...claimsCommunity);
    if (precautionary.length) {
      hits.push(hit("R-UV-CLAIM-WITH-PAL", "unverified", precautionary.flatMap((p) => p.evidence)));
      reasons.push("R-UV-CLAIM-WITH-PAL");
    }
    reasons.push("R-UV-COMMUNITY-CLAIM");
  }

  const anyText = signals.some((s) => s.text);
  const anyAnyLangText = signals.some((s) => s.o.ingredientsText && s.o.ingredientsText.trim());
  if (!anyAnyLangText) {
    hits.push(hit("R-UV-NO-INGREDIENTS", "unverified", signals.map((s) => ev(s.o, "ingredientsText", "(missing)"))));
    reasons.push("R-UV-NO-INGREDIENTS");
  } else if (!anyText) {
    hits.push(
      hit(
        "R-UV-NOT-ENGLISH",
        "unverified",
        signals.filter((s) => s.o.ingredientsText).map((s) => ev(s.o, "ingredientsLang", s.o.ingredientsLang ?? "unknown")),
      ),
    );
    reasons.push("R-UV-NOT-ENGLISH");
  }
  const incomplete = signals.filter((s) => s.o.ingredientsComplete === false);
  if (incomplete.length) {
    hits.push(hit("R-UV-INCOMPLETE", "unverified", incomplete.map((s) => ev(s.o, "ingredientsComplete", "false"))));
    reasons.push("R-UV-INCOMPLETE");
  }
  const allergensUnknown = signals.filter((s) => s.o.allergens === null);
  if (allergensUnknown.length === signals.length) {
    hits.push(hit("R-UV-ALLERGENS-UNKNOWN", "unverified", allergensUnknown.map((s) => ev(s.o, "allergens", "(absent)"))));
    reasons.push("R-UV-ALLERGENS-UNKNOWN");
  }
  if (!anyClaim && anyText) {
    hits.push(hit("R-UV-NO-CLAIM", "unverified", signals.filter((s) => s.text).map((s) => ev(s.o, "gfClaims", "(none)"))));
    reasons.push("R-UV-NO-CLAIM");
  }
  if (reasons.length === 0) reasons.push("R-UV-NO-CLAIM");

  return result("UNVERIFIED", uniq(reasons), claimBasis);
}

function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}

export { GLUTEN_CEREAL_WORD };
