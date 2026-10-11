import { NextResponse } from "next/server";
import { RULE_VERSION } from "@/lib/classify/rules";
import { dbConfigured } from "@/lib/db/supabase";
import { usdaConfigured } from "@/lib/providers/usda";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ruleVersion: RULE_VERSION,
    supabase: dbConfigured(),
    usda: usdaConfigured(),
    offUserAgentSet: !!process.env.OFF_USER_AGENT,
  });
}
