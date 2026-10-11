import { TriangleAlert } from "lucide-react";
import type { ProviderError } from "@/lib/types";

const NAMES: Record<string, string> = {
  open_food_facts: "Open Food Facts",
  usda_fdc: "USDA FoodData Central",
  fsa_alerts: "Food Standards Agency alerts",
  open_prices: "Open Prices",
};

export function ProviderErrors({ errors }: { errors: ProviderError[] }) {
  const shown = errors.filter((e) => e.kind !== "config");
  if (!shown.length) return null;
  return (
    <div role="status" className="rounded-2xl border-2 border-ink bg-warn/40 p-4 text-sm flex gap-3">
      <TriangleAlert aria-hidden className="shrink-0" />
      <div>
        <p className="font-bold">Some data sources didn&apos;t respond</p>
        <ul className="mt-1 list-disc pl-4">
          {shown.map((e, i) => (
            <li key={i}>
              {NAMES[e.provider] ?? e.provider}: {e.kind === "rate_limited" ? "busy — please try again in a minute" : e.kind === "timeout" ? "timed out" : "unavailable"}
            </li>
          ))}
        </ul>
        <p className="mt-1">Results may be missing evidence, so treat them as unverified.</p>
      </div>
    </div>
  );
}
