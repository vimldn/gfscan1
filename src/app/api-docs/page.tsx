import type { Metadata } from "next";

export const metadata: Metadata = { title: "API" };

const ENDPOINTS = [
  { m: "GET", p: "/api/product/{barcode}", d: "Look up a GTIN (8/12/13/14 digits). Returns source observations, classification with rule ids and evidence, recall matches (confirmed/possible), prices and provider errors. 404 when no source has the barcode (body still includes an UNVERIFIED classification)." },
  { m: "GET", p: "/api/search?q={query}", d: "Search by product name, brand or barcode. UK products first, then those with English ingredients. Each result carries its own classification." },
  { m: "GET", p: "/api/recalls?gluten=1", d: "Recent FSA allergy alerts and recalls (last two years). gluten=1 filters to gluten-cereal alerts." },
  { m: "POST", p: "/api/report", d: "Submit a user report. JSON: { barcode, issueType, details, contactEmail?, classificationStatus?, observationIds? }. Reports never change results automatically." },
  { m: "GET", p: "/api/health", d: "Configuration status and current rule version." },
];

export default function ApiDocs() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10">
      <h1 className="text-4xl font-black tracking-tight">API</h1>
      <p className="mt-3 text-muted">JSON endpoints. No authentication. Please cache responses and respect upstream provider limits.</p>
      <ul className="mt-6 space-y-3">
        {ENDPOINTS.map((e) => (
          <li key={e.p} className="rounded-2xl border-2 border-line p-4">
            <p className="font-mono text-sm"><span className="bg-lime rounded px-1.5 py-0.5 font-bold mr-2">{e.m}</span>{e.p}</p>
            <p className="text-sm mt-2">{e.d}</p>
          </li>
        ))}
      </ul>
      <h2 className="text-2xl font-black mt-10">Classification object</h2>
      <pre className="mt-3 text-xs bg-neutral-50 border-2 border-line rounded-2xl p-4 overflow-x-auto">{`{
  "status": "VERIFIED_GLUTEN_FREE" | "CONTAINS_GLUTEN" | "UNVERIFIED",
  "ruleVersion": "2026.10.1",
  "targetMarket": "GB",
  "claimBasis": "manufacturer_claim" | "certification" | "community_label" | "none",
  "decidedBy": ["R-CG-WHEAT"],
  "hits": [{ "ruleId": "R-CG-WHEAT", "outcome": "contains", "message": "...",
             "evidence": [{ "observationId": "open_food_facts:...", "provider": "open_food_facts",
                            "field": "ingredientsText", "value": "wheat flour" }] }],
  "precautionary": [ ...RuleHit ],
  "observationIds": ["open_food_facts:5000...:1767225600"],
  "classifiedAt": "2026-10-11T18:00:00.000Z"
}`}</pre>
    </div>
  );
}
