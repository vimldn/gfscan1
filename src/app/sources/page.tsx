import type { Metadata } from "next";
import { PROVIDERS } from "@/lib/providers/registry";
import { RULES, RULE_VERSION, CLAIM_FRESHNESS_DAYS, INFO_STALE_DAYS } from "@/lib/classify/rules";

export const metadata: Metadata = { title: "Sources, rules & attribution" };

const STATUS_STYLE = { live: "bg-lime", optional: "bg-neutral-200", not_integrated: "bg-white border-2 border-line" } as const;

export default function Sources() {
  const groups: [string, string][] = [
    ["R-CG-", "Contains gluten"],
    ["R-EX-", "UK exemptions & special cases"],
    ["R-VF-", "Verified gluten-free"],
    ["R-UV-", "Unverified reasons"],
    ["R-CONFLICT-", "Conflicts"],
    ["R-MKT-", "Market"],
    ["R-PAL-", "Precautionary warnings"],
    ["R-AMB-", "Ambiguous ingredients"],
    ["R-INFO-", "Information"],
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 space-y-12">
      <header>
        <h1 className="text-4xl font-black tracking-tight">Sources, rules &amp; attribution</h1>
        <p className="mt-3 text-lg text-muted">
          Every result is produced by deterministic rules on structured source data. No AI model, LLM or probabilistic classifier decides whether a product contains gluten.
        </p>
      </header>

      <section>
        <h2 className="text-2xl font-black">Data sources</h2>
        <ul className="mt-4 space-y-3">
          {PROVIDERS.map((p) => (
            <li key={p.id} className="rounded-2xl border-2 border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{p.name}</h3>
                <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${STATUS_STYLE[p.status]}`}>{p.status.replace("_", " ")}</span>
              </div>
              <p className="text-sm mt-1">{p.role}</p>
              {p.notes && <p className="text-sm mt-1 text-muted">{p.notes}</p>}
              <p className="text-xs mt-2 text-muted">
                Licence: {p.licence}
                {p.docs.startsWith("http") && (
                  <>
                    {" · "}
                    <a href={p.docs} className="underline" target="_blank" rel="noreferrer">Documentation</a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 text-sm space-y-2 rounded-2xl bg-neutral-50 p-4">
          <p><strong>Open Food Facts:</strong> product data © Open Food Facts contributors, available under the Open Database Licence (ODbL) 1.0; individual contents under the Database Contents Licence; product images under CC BY-SA 3.0. <a className="underline" href="https://world.openfoodfacts.org/terms-of-use">Terms</a>.</p>
          <p><strong>Food Standards Agency:</strong> contains public sector information licensed under the Open Government Licence v3.0.</p>
          <p><strong>USDA FoodData Central:</strong> U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. Public domain (CC0 1.0).</p>
          <p><strong>Open Prices:</strong> © Open Food Facts contributors, ODbL 1.0.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-black">Classification rules <span className="text-base font-semibold text-muted">v{RULE_VERSION}</span></h2>
        <ol className="mt-4 list-decimal pl-5 space-y-1 text-sm">
          <li>Only records for the exact barcode are used. Records for the UK market are preferred; other markets are never merged into a UK verification.</li>
          <li>A gluten ingredient together with any gluten-free claim → <strong>Unverified</strong> (conflict).</li>
          <li>Same-market sources that disagree → <strong>Unverified</strong>.</li>
          <li>Any declared gluten allergen or non-exempt gluten ingredient → <strong>Contains gluten</strong>.</li>
          <li>A manufacturer or authorised certification claim, updated within {CLAIM_FRESHNESS_DAYS} days, for the UK, with no “may contain gluten” → <strong>Verified gluten-free</strong>.</li>
          <li>Everything else → <strong>Unverified — check packaging</strong>, with every reason recorded.</li>
          <li>“May contain” warnings and FSA alerts are shown separately and never change the primary status by themselves (except that “may contain gluten” blocks Verified). Records older than {Math.round(INFO_STALE_DAYS / 365)} years get a staleness note.</li>
        </ol>
        {groups.map(([prefix, title]) => (
          <div key={prefix} className="mt-6">
            <h3 className="font-bold">{title}</h3>
            <ul className="mt-2 divide-y divide-line border-2 border-line rounded-2xl">
              {Object.values(RULES)
                .filter((r) => r.id.startsWith(prefix))
                .map((r) => (
                  <li key={r.id} className="p-3 text-sm">
                    <code className="text-xs bg-neutral-100 rounded px-1.5 py-0.5 mr-2">{r.id}</code>
                    <strong>{r.title}</strong>
                    <p className="text-muted mt-0.5">{r.description}</p>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
