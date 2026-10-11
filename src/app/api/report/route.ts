import { NextResponse } from "next/server";
import { z } from "zod";
import { saveReport } from "@/lib/db/supabase";
import { RateLimiter } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  barcode: z.string().regex(/^\d{8}$|^\d{12,14}$/),
  issueType: z.enum(["wrong_status", "ingredients_changed", "gf_claim_missing", "wrong_product", "recall", "other"]),
  details: z.string().trim().min(5).max(2000),
  contactEmail: z.string().email().max(200).optional(),
  classificationStatus: z.string().max(40).optional(),
  observationIds: z.array(z.string().max(200)).max(10).optional(),
});

const limiter = new RateLimiter(30, 60_000);

export async function POST(req: Request) {
  if (!limiter.tryTake()) return NextResponse.json({ error: "Too many reports, try again shortly" }, { status: 429 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid report", issues: parsed.error.issues }, { status: 400 });
  const r = await saveReport(parsed.data);
  if (!r.ok) return NextResponse.json({ error: "Could not save report" }, { status: 500 });
  return NextResponse.json({ ok: true, stored: r.stored });
}
