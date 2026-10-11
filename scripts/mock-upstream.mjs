// LOCAL SMOKE-TEST MOCK ONLY. Serves synthetic, clearly-labelled FIXTURE records
// shaped like the OFF / FSA / Open Prices APIs so the full request path can be
// exercised where the real APIs are unreachable. Never used in production.
import http from "node:http";

const products = {
  "5000000000017": { code: "5000000000017", product_name: "FIXTURE Ready Salted Crisps", brands: "FixtureBrand", quantity: "150 g", lang: "en",
    ingredients_text_en: "Potatoes, Sunflower Oil, Salt. May contain wheat.", allergens_tags: [], traces_tags: ["en:gluten"], labels_tags: ["en:gluten-free"],
    countries_tags: ["en:united-kingdom"], states_tags: ["en:ingredients-completed"], completeness: 0.9, last_modified_t: 1767225600 },
  "5000000000024": { code: "5000000000024", product_name: "FIXTURE Chocolate Wafer", brands: "FixtureBrand", quantity: "41.5 g", lang: "en",
    ingredients_text_en: "Sugar, _wheat_ flour, cocoa butter, skimmed _milk_ powder", allergens_tags: ["en:gluten", "en:milk"], traces_tags: [], labels_tags: [],
    countries_tags: ["en:united-kingdom"], states_tags: ["en:ingredients-completed"], completeness: 0.8, last_modified_t: 1767225600 },
};

const fsa = { items: [{ notation: "FSA-AA-FIXTURE-01", title: "FIXTURE recalls FixtureBrand Ready Salted Crisps because of undeclared gluten", created: "2026-09-01",
  type: ["http://data.food.gov.uk/food-alerts/def/AA"], alertURL: "https://example.invalid/alert", reportingBusiness: { commonName: "FixtureBrand" },
  problem: [{ allergen: [{ "@id": "http://data.food.gov.uk/codes/alerts/def/allergen/gluten", label: "Gluten" }] }],
  productDetails: [{ productName: "FixtureBrand Ready Salted Crisps", packSizeDescription: "150g" }] }] };

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("Content-Type", "application/json");
  let m;
  if ((m = u.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/))) {
    const p = products[m[1]];
    res.statusCode = p ? 200 : 404;
    return res.end(JSON.stringify(p ? { status: 1, product: p } : { status: 0 }));
  }
  if (u.pathname === "/cgi/search.pl") return res.end(JSON.stringify({ products: Object.values(products) }));
  if (u.pathname === "/fsa/id") return res.end(JSON.stringify(fsa));
  if (u.pathname === "/api/v1/prices") return res.end(JSON.stringify({ items: [{ price: 1.5, currency: "GBP", date: "2026-10-01", location: { osm_name: "FIXTURE Shop" } }] }));
  res.statusCode = 404; res.end("{}");
}).listen(4010, () => console.log("mock on 4010"));
