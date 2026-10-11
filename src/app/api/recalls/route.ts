import { NextResponse } from "next/server";
import { fsaRecentAlerts } from "@/lib/providers/fsa";
import { alertConcernsGluten } from "@/lib/recalls/match";

export const dynamic = "force-dynamic";

/** Recent FSA alerts. ?gluten=1 filters to alerts concerning gluten cereals. */
export async function GET(req: Request) {
  const glutenOnly = new URL(req.url).searchParams.get("gluten") === "1";
  const r = await fsaRecentAlerts();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const alerts = glutenOnly ? r.data.alerts.filter(alertConcernsGluten) : r.data.alerts;
  return NextResponse.json({ fetchedAt: r.data.fetchedAt, count: alerts.length, alerts: alerts.sort((a, b) => b.created.localeCompare(a.created)) });
}
