import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, TriangleAlert, Database, Info } from "lucide-react";
import { lookupBarcode, type ProductView } from "@/lib/service";
import { StatusBadge, RecallBadge } from "@/components/StatusBadge";
import { ProductImage } from "@/components/ProductImage";
import { ProviderErrors } from "@/components/ProviderErrors";
import { ReportButton } from "@/components/ReportForm";
import { RememberProduct } from "@/components/RecentSearches";
import { SearchBox } from "@/components/SearchBox";
import { STATUS_TEXT, fmtDate, fmtDateTime, fmtPrice, reasonLine, tagLabel } from "@/lib/present";
import { RULES } from "@/lib/classify/rules";
import { countryLabel } from "@/lib/markets";
import { cleanBarcode, isPlausibleBarcode } from "@/lib/barcode";
import type { RecallMatch, RuleHit, SourceObservation } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ barcode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { barcode } = await params;
  return { title: `Barcode ${cleanBarcode(barcode)}` };
}

export default async function ProductPage({ params }: Props) {
  const { barcode: raw } = await params;
  const barcode = cleanBarcode(decodeURIComponent(raw));

  if (!isPlausibleBarcode(barcode)) {
    return (
      <Shell>
        <h1 className="text-3xl font-black">That doesn&apos;t look like a barcode</h1>
        <p className="mt-2 text-muted">Retail barcodes have 8, 12, 13 or 14 digits.</p>
      </Shell>
    );
  }

  const v = await lookupBarcode(barcode);
  const c = v.classification;
  const p = v.primary;
  const confirmed = v.recalls.filter((r) => r.level === "confirmed");
  const possible = v.recalls.filter((r) => r.level === "possible");
  const name = p?.productName || (v.found ? "Unnamed product" : "Product not found");

  return (
    <Shell>
      {p && <RememberProduct barcode={barcode} label={name} />}
      <ProviderErrors errors={v.providerErrors} />

      {confirmed.length > 0 && <RecallBlock matches={confirmed} level="confirmed" />}

      <section className="mt-4 grid md:grid-cols-[minmax(0,280px)_1fr] gap-6 items-start">
        <ProductImage src={p?.imageUrl} alt={name} className="w-40 sm:w-56 md:w-full aspect-square rounded-3xl border-2 border-line mx-auto md:mx-0" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">{p?.brand || (v.found ? "Brand not recorded" : "")}</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight mt-1">{name}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {p?.quantity && <Meta k="Size" v={p.quantity} />}
            <Meta k="Barcode" v={barcode + (v.checkDigitValid ? "" : " (check digit invalid — re-check the number)")} />
            {p && <Meta k="Sold in" v={p.countries.length ? p.countries.map((t) => (t.includes(":") ? countryLabel(t) : t)).join(", ") : "Not recorded"} />}
          </dl>

          <div className="mt-6 rounded-3xl border-[3px] border-ink p-5">
            <StatusBadge status={c.status} size="lg" />
            <p className="mt-3 text-lg font-bold">{reasonLine(c)}</p>
            <p className="mt-1 text-muted">{STATUS_TEXT[c.status].explain}</p>
            {c.status !== "VERIFIED_GLUTEN_FREE" && (
              <p className="mt-3 text-sm font-semibold">Last independent verification: <span className="font-normal">Not independently verified</span></p>
            )}
            {c.status === "VERIFIED_GLUTEN_FREE" && <VerifiedDate v={v} />}
          </div>

          {c.precautionary.length > 0 && (
            <div className="mt-4 rounded-2xl border-2 border-ink bg-warn/30 p-4">
              <p className="font-bold flex items-center gap-2"><TriangleAlert size={18} aria-hidden /> Precautionary warning (“may contain”)</p>
              <p className="text-sm mt-1">Shown separately — this is a cross-contact warning, not confirmed gluten content.</p>
              <ul className="mt-2 text-sm list-disc pl-5">
                {c.precautionary.map((h, i) => (
                  <li key={i}>{h.evidence.map((e) => (e.field === "traces" ? `Traces: ${tagLabel(e.value)}` : `“${e.value}”`)).join(", ")}</li>
                ))}
              </ul>
            </div>
          )}

          {possible.length > 0 && <div className="mt-4"><RecallBlock matches={possible} level="possible" /></div>}
          {v.recallsChecked && v.recalls.length === 0 && (
            <p className="mt-4 text-sm text-muted">
              No matching FSA allergy alerts or recalls found in the last two years (checked {fmtDateTime(v.recallsFetchedAt)}). This does not mean the product is guaranteed safe.
            </p>
          )}
        </div>
      </section>

      {!v.found && (
        <section className="mt-8 rounded-3xl border-2 border-line p-6">
          {v.providerErrors.some((e) => e.provider === "open_food_facts" || e.provider === "usda_fdc") ? (
            <>
              <h2 className="text-xl font-black">We couldn&apos;t reach the product database</h2>
              <p className="mt-2 text-muted">This is not a &ldquo;not found&rdquo; result. Please try again shortly, and check the packaging in the meantime.</p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black">No source has a record for this barcode</h2>
              <p className="mt-2 text-muted">We won&apos;t guess. Check the packaging. You can help everyone by adding it to Open Food Facts.</p>
            </>
          )}
          <a className="mt-3 inline-flex items-center gap-2 font-bold underline" href={`https://world.openfoodfacts.org/cgi/product.pl?type=add&code=${barcode}`} target="_blank" rel="noreferrer">
            Add this product to Open Food Facts <ExternalLink size={14} aria-hidden />
          </a>
        </section>
      )}

      {v.found && (
        <>
          <WhySection hits={c.hits} decidedBy={c.decidedBy} observations={v.observations} />
          {v.observations.map((o) => (
            <ObservationSection key={o.id} o={o} glutenTerms={c.hits.filter((h) => h.outcome === "contains" && h.evidence[0]?.observationId === o.id).flatMap((h) => h.evidence.filter((e) => e.field === "ingredientsText").map((e) => e.value))} />
          ))}
          {v.prices.length > 0 && <PricesSection v={v} />}
        </>
      )}

      <section className="mt-10 flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-t border-line pt-6">
        <div className="text-xs text-muted space-y-0.5">
          <p>Rule set {c.ruleVersion} · target market {c.targetMarket} · classified {fmtDateTime(c.classifiedAt)}</p>
          <p>Page generated {fmtDateTime(v.generatedAt)}</p>
        </div>
        <ReportButton barcode={barcode} status={c.status} observationIds={c.observationIds} />
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 space-y-2">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/" className="p-2 rounded-full border-2 border-line hover:border-ink" aria-label="Home">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1"><SearchBox size="md" /></div>
      </div>
      {children}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted">{k}:</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function VerifiedDate({ v }: { v: ProductView }) {
  const h = v.classification.hits.find((x) => x.ruleId === "R-VF-CLAIM");
  const o = v.observations.find((x) => x.id === h?.evidence[0]?.observationId);
  const claim = o?.gfClaims.find((g) => g.basis !== "community_label");
  return (
    <p className="mt-3 text-sm font-semibold">
      Claim evidence dated: <span className="font-normal">{fmtDate(claim?.assertedAt ?? o?.sourceLastModified)}</span> ({o?.providerName})
    </p>
  );
}

function RecallBlock({ matches, level }: { matches: RecallMatch[]; level: "confirmed" | "possible" }) {
  return (
    <section
      aria-label={level === "confirmed" ? "Confirmed recall or allergy alert" : "Possible recall or allergy alert match"}
      className={`rounded-3xl border-[3px] p-5 ${level === "confirmed" ? "border-alert bg-alert/10" : "border-alert/60 bg-white"}`}
    >
      <RecallBadge level={level} />
      <p className="mt-2 text-sm">
        {level === "confirmed"
          ? "A Food Standards Agency alert lists this exact barcode."
          : "These FSA alerts mention the same brand and a similar product name. They may not apply to your pack — compare the pack size, batch code and dates."}
      </p>
      <ul className="mt-3 space-y-3">
        {matches.map((m) => (
          <li key={m.alert.id} className="rounded-2xl border-2 border-line bg-white p-4">
            <a href={m.alert.url} target="_blank" rel="noreferrer" className="font-bold underline inline-flex gap-1.5 items-start">
              {m.alert.title} <ExternalLink size={14} aria-hidden className="mt-1 shrink-0" />
            </a>
            <p className="text-xs text-muted mt-1">
              {m.alert.id} · {m.alert.type.join(", ")} · published {fmtDate(m.alert.created)}
              {m.alert.allergens.length ? ` · allergens: ${m.alert.allergens.map((a) => a.label).join(", ")}` : ""}
            </p>
            {m.concernsGluten && <p className="text-sm font-bold mt-1">This alert concerns gluten.</p>}
            <p className="text-sm mt-1">{m.reason}</p>
            {m.alert.products.some((p) => p.batchCodes?.length) && (
              <p className="text-xs mt-1">Batch details: {m.alert.products.flatMap((p) => p.batchCodes ?? []).join("; ")}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WhySection({ hits, decidedBy, observations }: { hits: RuleHit[]; decidedBy: string[]; observations: SourceObservation[] }) {
  const decisive = hits.filter((h) => decidedBy.includes(h.ruleId) && h.outcome !== "info" && h.outcome !== "warning");
  const notes = hits.filter((h) => !decisive.includes(h) && h.outcome === "info");
  const provName = (id: string) => observations.find((o) => o.id === id)?.providerName ?? id.split(":")[0];
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-black tracking-tight">Why this result</h2>
      <ul className="mt-3 space-y-2">
        {decisive.map((h, i) => (
          <li key={i} className="rounded-2xl border-2 border-line p-4">
            <p className="font-bold">
              <code className="text-xs bg-neutral-100 rounded px-1.5 py-0.5 mr-2">{h.ruleId}</code>
              {h.message}
            </p>
            <p className="text-sm text-muted mt-1">{RULES[h.ruleId]?.description}</p>
            {h.evidence.length > 0 && (
              <ul className="mt-2 text-sm space-y-0.5">
                {h.evidence.slice(0, 8).map((e, j) => (
                  <li key={j}>
                    <span className="text-muted">{provName(e.observationId)} · {e.field}:</span> <span className="font-mono text-xs">{e.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <details className="mt-3 rounded-2xl border-2 border-line p-4">
          <summary className="font-bold cursor-pointer">Notes ({notes.length})</summary>
          <ul className="mt-2 space-y-2 text-sm">
            {notes.map((h, i) => (
              <li key={i}>
                <code className="text-xs bg-neutral-100 rounded px-1.5 py-0.5 mr-2">{h.ruleId}</code>
                {h.message}
                <span className="block text-muted text-xs mt-0.5">{RULES[h.ruleId]?.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function highlight(text: string, terms: string[]): React.ReactNode {
  const uniq = [...new Set(terms.filter((t) => t.length > 1))].sort((a, b) => b.length - a.length);
  if (!uniq.length) return text;
  const re = new RegExp(`(${uniq.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s_]+")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="bg-ink text-white rounded px-0.5">{part}</mark> : part));
}

function ObservationSection({ o, glutenTerms }: { o: SourceObservation; glutenTerms: string[] }) {
  const glutenLabels = o.gfClaims.map((g) => g.value);
  return (
    <section className="mt-10">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-2xl font-black tracking-tight">Source data: {o.providerName}</h2>
        <span className="text-xs font-bold uppercase tracking-wider border-2 border-line rounded-full px-2 py-0.5">{o.sourceType.replace(/_/g, " ")}</span>
      </div>

      <div className="mt-3 grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-line p-4">
            <h3 className="font-bold">Ingredient declaration</h3>
            {o.ingredientsText ? (
              <>
                <p className="mt-2 leading-relaxed" lang={o.ingredientsLang ?? undefined}>{highlight(o.ingredientsText.replace(/_/g, ""), glutenTerms)}</p>
                <p className="text-xs text-muted mt-2">
                  Language: {o.ingredientsLang ?? "unknown"}
                  {o.ingredientsComplete === false && " · source marks this list as incomplete"}
                  {o.ingredientsLang !== "en" && " · not analysed (English only)"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-muted">No ingredient list in this source.</p>
            )}
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <TagBox title="Declared allergens" tags={o.allergens} />
            <TagBox title="May contain (traces)" tags={o.traces} />
            <TagBox title="Gluten-free labels" tags={o.labels === null ? null : glutenLabels} emptyText="None recorded" />
          </div>
          {o.gfClaims.some((g) => g.basis === "community_label") && (
            <p className="text-sm flex gap-2"><Info size={16} aria-hidden className="shrink-0 mt-0.5" /> Gluten-free labels in {o.providerName} are added by community contributors from the packaging. They are not verified with the manufacturer.</p>
          )}
        </div>

        <aside className="rounded-2xl bg-neutral-50 border-2 border-line p-4 text-sm space-y-2 h-fit">
          <p className="font-bold flex items-center gap-2"><Database size={16} aria-hidden /> Provenance</p>
          <Row k="Source record" v={<a href={o.sourceUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">{o.providerRecordId} <ExternalLink size={12} aria-hidden /></a>} />
          <Row k="Source last updated" v={fmtDate(o.sourceLastModified)} />
          <Row k="Fetched by this app" v={fmtDateTime(o.fetchedAt) + (o.servedFromCache ? " (cached)" : "")} />
          <Row k="Data completeness" v={o.completenessScore != null ? `${Math.round(o.completenessScore * 100)}% (source score)` : "Not provided"} />
          <Row k="Licence" v={o.licence} />
          <p className="text-xs text-muted pt-1">{o.attribution}</p>
        </aside>
      </div>
    </section>
  );
}

function TagBox({ title, tags, emptyText }: { title: string; tags: string[] | null; emptyText?: string }) {
  return (
    <div className="rounded-2xl border-2 border-line p-3">
      <p className="font-bold">{title}</p>
      {tags === null ? (
        <p className="text-muted mt-1">Field not provided</p>
      ) : tags.length === 0 ? (
        <p className="text-muted mt-1">{emptyText ?? "None listed in source (not the same as none present)"}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <li key={t} className="bg-neutral-100 rounded-full px-2 py-0.5 capitalize">{tagLabel(t)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium break-words min-w-0">{v}</span>
    </div>
  );
}

function PricesSection({ v }: { v: ProductView }) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-black tracking-tight">Price observations</h2>
      <p className="text-sm text-muted">Crowd-sourced via Open Prices. Each is a single observation on the date shown.</p>
      <ul className="mt-3 grid sm:grid-cols-2 gap-2">
        {v.prices.map((pr, i) => (
          <li key={i} className="rounded-2xl border-2 border-line p-3 text-sm flex justify-between gap-3">
            <span>
              <span className="font-bold">{pr.retailer ?? "Shop not recorded"}</span>
              {pr.location && <span className="text-muted"> · {pr.location}</span>}
              <span className="block text-xs text-muted">Observed {fmtDate(pr.date)}</span>
            </span>
            <span className="font-black">{fmtPrice(pr.price, pr.currency)}</span>
          </li>
        ))}
      </ul>
      <a href={v.prices[0].sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline mt-2 inline-block">View on Open Prices</a>
    </section>
  );
}
