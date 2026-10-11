/**
 * Deterministic mapping of Open Food Facts country tags to ISO alpha-2 codes.
 * Unknown tags are ignored (never guessed).
 */
const MAP: Record<string, string> = {
  "en:united-kingdom": "GB",
  "en:england": "GB",
  "en:scotland": "GB",
  "en:wales": "GB",
  "en:northern-ireland": "GB",
  "en:ireland": "IE",
  "en:united-states": "US",
  "en:canada": "CA",
  "en:france": "FR",
  "en:germany": "DE",
  "en:spain": "ES",
  "en:italy": "IT",
  "en:netherlands": "NL",
  "en:belgium": "BE",
  "en:switzerland": "CH",
  "en:austria": "AT",
  "en:portugal": "PT",
  "en:poland": "PL",
  "en:sweden": "SE",
  "en:denmark": "DK",
  "en:norway": "NO",
  "en:finland": "FI",
  "en:australia": "AU",
  "en:new-zealand": "NZ",
  "en:kenya": "KE",
  "en:south-africa": "ZA",
  "en:india": "IN",
};

export function marketsFromCountryTags(tags: string[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const t of tags ?? []) {
    const m = MAP[t.toLowerCase()];
    if (m) out.add(m);
  }
  return [...out];
}

export function countryLabel(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
