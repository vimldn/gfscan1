# Can I Eat That?

A UK-first gluten-free packaged-food checker. Search or scan a barcode and see what the available food data says about gluten, with sources, dates and uncertainty shown.

**No AI decides any result.** Classification is a deterministic, versioned rule engine (`src/lib/classify`) that runs on structured source fields. Every result stores the rule IDs and evidence that produced it.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase Postgres (optional) · `barcode-detector` (native BarcodeDetector with a self-hosted zxing-wasm fallback) · Vitest.

## Quick start

```bash
npm install
cp .env.example .env.local   # set OFF_USER_AGENT at minimum
npm run dev                  # http://localhost:3000
npm test                     # 67 tests
npm run build
```

The app runs without Supabase (it uses in-memory caching). Camera scanning needs HTTPS, or `localhost`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `OFF_USER_AGENT` | Yes | Open Food Facts requires an identifying User-Agent: `AppName/Version (contact email)` |
| `OFF_BASE_URL` | No | Defaults to `https://world.openfoodfacts.org` |
| `USDA_FDC_API_KEY` | No | Turns on USDA FoodData Central (US branded foods). Server-side only |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-side only. Used for caching, evidence, classifications and reports |
| `ENABLE_OPEN_PRICES` | No | `false` turns off price lookups |
| `FSA_BASE_URL`, `OPEN_PRICES_BASE_URL` | No | Override upstream URLs (testing only) |

## Deploying to Vercel

1. Push to GitHub and import the repo in Vercel (framework preset: Next.js).
2. Add the environment variables above in Project → Settings → Environment Variables.
3. Supabase: create a project, then run `supabase/migrations/20261011000000_init.sql` (SQL editor, or `supabase db push`).
4. Deploy. Check `/api/health` to confirm the configuration.

## How classification works

See `/sources` in the app for the live rule list. In short:

1. Only records for the exact barcode are used. UK-market records are preferred; other markets are never merged into a UK verification.
2. A gluten ingredient plus any gluten-free claim → **UNVERIFIED** (`R-CONFLICT-CLAIM`).
3. Same-market sources that disagree → **UNVERIFIED** (`R-CONFLICT-SOURCES`).
4. A declared gluten allergen or a non-exempt gluten cereal in the English ingredients → **CONTAINS GLUTEN**.
5. A manufacturer or authorised-certification claim, updated within 365 days, for GB, with no "may contain gluten" → **VERIFIED GLUTEN-FREE**.
6. Everything else → **UNVERIFIED — CHECK PACKAGING**, with every reason recorded.

UK special cases: Codex gluten-free wheat starch, exempt wheat/barley glucose syrups, dextrose and maltodextrin, gluten-free oats compared with plain oats, malt and malt extract compared with barley malt vinegar (Coeliac UK guidance), buckwheat, and maltodextrin/maltitol, which are not malt. When a declared gluten allergen traces back only to an exempt ingredient, the result is UNVERIFIED (`R-EX-ONLY`), not either extreme.

"May contain" warnings and FSA alerts appear separately from the main status. The one exception: a "may contain gluten" warning stops a product being marked VERIFIED.

**Open Food Facts gluten-free labels are community-reported, so on their own they never produce VERIFIED.** With the providers live today, no product can reach VERIFIED. That only becomes possible once a manufacturer or certification feed is added (see `PROVIDERS` in `src/lib/providers/registry.ts` and the `verification_evidence` table). This is deliberate.

Change any rule's behaviour → bump `RULE_VERSION` in `src/lib/classify/rules.ts`.

## API

| Endpoint | Description |
|---|---|
| `GET /api/product/{barcode}` | Observations, classification (rule IDs plus evidence), recall matches, prices, provider errors. Returns 404 if no source has the barcode, or 503 if Open Food Facts is unreachable |
| `GET /api/search?q=` | Name, brand or barcode search. UK first, then products with English ingredients |
| `GET /api/recalls?gluten=1` | Recent FSA alerts (last 2 years) |
| `POST /api/report` | User report `{ barcode, issueType, details, contactEmail?, classificationStatus?, observationIds? }` |
| `GET /api/health` | Configuration and rule version |

## Data sources and attribution

- **Open Food Facts**: © Open Food Facts contributors. Database under ODbL 1.0, contents under DbCL, images under CC BY-SA 3.0. Rate limits are enforced in-process: about 90 product reads and 8 searches per minute per instance, with 6 h caching.
- **UK Food Standards Agency food alerts**: Open Government Licence v3.0. Cached for 1 h.
- **USDA FoodData Central**: CC0. Exact GTIN matches only.
- **Open Prices**: ODbL 1.0.
- **GS1, Coeliac UK, manufacturer feeds, Tesco, Sainsbury's, Asda, Morrisons, Waitrose, Ocado**: listed in the registry as `not_integrated`. Each needs an agreement. Nothing is scraped and nothing is faked.

## Testing

`tests/classify.test.ts` covers the rule engine: explicit claims, confirmed gluten, missing allergens and ingredients, conflicts, countries, wheat starch, oats, malt, precautionary labelling, stale and duplicate records, and provider errors. `tests/providers.test.ts` covers provider mapping, FSA parsing, recall matching (confirmed, possible, none), timeouts, HTTP errors and barcodes. The fixtures in `tests/fixtures` are synthetic, labelled `FIXTURE`, and never imported by app code.

`scripts/mock-upstream.mjs` is a local mock of the OFF, FSA and Open Prices endpoints. It is for smoke-testing the full request path where the real APIs can't be reached. Point `OFF_BASE_URL`, `FSA_BASE_URL` and `OPEN_PRICES_BASE_URL` at it. Never use it in production.

## Known limitations

- **Not yet run against the live APIs.** The build sandbox's network blocked Open Food Facts, the FSA and USDA. Adapters follow the documented response formats (the FSA alert shape was checked against a real response), and the full path was tested against a local mock. Do a live smoke test after deploying: `/api/product/3017620422003` and `/search?q=kitkat`.
- VERIFIED cannot happen until a manufacturer or certification provider is integrated.
- Ingredient analysis is English-only. Other languages return UNVERIFIED.
- OFF `cgi/search.pl` is slow at times and limited to 10 requests per minute. Results are cached for 6 h per query. For scale, move to OFF's Search-a-licious API or a local OFF data dump.
- FSA alerts rarely include barcodes, so most recall matches will be "possible" (brand plus name), not "confirmed".
- In-memory rate limits and caches are per serverless instance. Supabase holds the shared evidence store, but the live cache read path only falls back to Supabase when providers fail.
- Recently searched items are stored in the browser (localStorage) only.
- The camera scanner needs HTTPS. iOS Safari uses the wasm decoder (around 1 MB, loaded on first scan).
