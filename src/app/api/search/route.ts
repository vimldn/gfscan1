import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
  const res = await searchProducts(q);
  return NextResponse.json(res, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}
