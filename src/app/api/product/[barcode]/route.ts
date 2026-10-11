import { NextResponse } from "next/server";
import { lookupBarcode } from "@/lib/service";
import { cleanBarcode, isPlausibleBarcode } from "@/lib/barcode";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ barcode: string }> }) {
  const { barcode } = await params;
  const code = cleanBarcode(barcode);
  if (!isPlausibleBarcode(code)) return NextResponse.json({ error: "Barcode must be 8, 12, 13 or 14 digits" }, { status: 400 });
  const v = await lookupBarcode(code);
  return NextResponse.json(v, { status: v.found ? 200 : v.providerErrors.some((e) => e.provider === "open_food_facts") ? 503 : 404, headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
