import { ShieldCheck, OctagonX, CircleHelp, Siren } from "lucide-react";
import type { GlutenStatus } from "@/lib/types";
import { STATUS_TEXT } from "@/lib/present";

const STYLES: Record<GlutenStatus, string> = {
  VERIFIED_GLUTEN_FREE: "bg-lime text-ink border-ink",
  CONTAINS_GLUTEN: "bg-ink text-white border-ink",
  UNVERIFIED: "bg-warn text-ink border-ink",
};

const ICONS = { VERIFIED_GLUTEN_FREE: ShieldCheck, CONTAINS_GLUTEN: OctagonX, UNVERIFIED: CircleHelp };

export function StatusBadge({ status, size = "md" }: { status: GlutenStatus; size?: "sm" | "md" | "lg" }) {
  const Icon = ICONS[status];
  const t = STATUS_TEXT[status];
  const sz =
    size === "lg" ? "text-xl sm:text-2xl px-4 py-3 gap-3" : size === "sm" ? "text-xs px-2.5 py-1 gap-1.5" : "text-sm px-3 py-1.5 gap-2";
  const iz = size === "lg" ? 28 : size === "sm" ? 14 : 18;
  return (
    <span className={`inline-flex items-center font-extrabold uppercase tracking-wide rounded-full border-2 ${STYLES[status]} ${sz}`}>
      <Icon size={iz} aria-hidden strokeWidth={2.5} />
      <span>{size === "sm" ? t.short : t.label}</span>
    </span>
  );
}

export function RecallBadge({ level, size = "md" }: { level: "confirmed" | "possible"; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "text-xs px-2.5 py-1 gap-1.5" : "text-sm px-3 py-1.5 gap-2";
  return level === "confirmed" ? (
    <span className={`inline-flex items-center font-extrabold uppercase tracking-wide rounded-full border-2 border-alert bg-alert text-white ${sz}`}>
      <Siren size={size === "sm" ? 14 : 18} aria-hidden strokeWidth={2.5} /> Recall / allergy alert
    </span>
  ) : (
    <span className={`inline-flex items-center font-extrabold uppercase tracking-wide rounded-full border-2 border-alert text-alert bg-white ${sz}`}>
      <Siren size={size === "sm" ? 14 : 18} aria-hidden strokeWidth={2.5} /> Possible alert match
    </span>
  );
}
