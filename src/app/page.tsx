import Link from "next/link";
import { ShieldCheck, OctagonX, CircleHelp, Siren } from "lucide-react";
import { SearchBox, ScanButton } from "@/components/SearchBox";
import { RecentSearches } from "@/components/RecentSearches";

// Popular SEARCH TERMS (queries only, not product data). Results always come live from the API.
const POPULAR = ["KitKat", "Walkers", "Warburtons gluten free", "Schär", "Heinz baked beans", "Doritos", "Nairn's oatcakes", "Genius bread"];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4">
      <section className="pt-12 sm:pt-20 pb-6 text-center">
        <h1 className="font-black tracking-tighter leading-[0.9] text-[clamp(3rem,13vw,6.5rem)]">
          CAN I EAT
          <br />
          THAT<span className="text-lime-deep">?</span>
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-muted font-medium">Find out what the food data actually says.</p>
      </section>

      <SearchBox autoFocus={false} />

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <ScanButton className="w-full sm:w-auto" />
        <p className="text-sm text-muted self-center sm:pl-2">
          Or type the numbers under the barcode into the search box.
        </p>
      </div>

      <section aria-labelledby="pop-h" className="mt-10">
        <h2 id="pop-h" className="text-sm font-bold uppercase tracking-wider text-muted">Popular searches</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {POPULAR.map((p) => (
            <li key={p}>
              <Link href={`/search?q=${encodeURIComponent(p)}`} className="inline-block rounded-full bg-lime/30 hover:bg-lime border-2 border-transparent hover:border-ink px-4 py-2 text-sm font-semibold">
                {p}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <RecentSearches />

      <section aria-labelledby="how-h" className="mt-14">
        <h2 id="how-h" className="text-2xl font-black tracking-tight">How results work</h2>
        <ul className="mt-4 grid sm:grid-cols-2 gap-3">
          <Legend icon={<ShieldCheck aria-hidden />} cls="bg-lime" title="Verified gluten-free" text="A current manufacturer or certification source explicitly claims it. A community label alone is never enough." />
          <Legend icon={<OctagonX aria-hidden />} cls="bg-ink text-white" title="Contains gluten" text="The data lists wheat, barley, rye, oats (not stated gluten-free), spelt or gluten as an ingredient or allergen." />
          <Legend icon={<CircleHelp aria-hidden />} cls="bg-warn" title="Unverified — check packaging" text="Missing, conflicting or out-of-date data, or no gluten-free claim. We never assume a product is safe." />
          <Legend icon={<Siren aria-hidden />} cls="bg-alert text-white" title="Recall / allergy alert" text="Food Standards Agency alerts. Exact barcode matches and possible name matches are shown separately." />
        </ul>
        <p className="mt-4 text-sm text-muted">
          Every result is produced by published, deterministic rules — no AI. <Link className="underline" href="/sources">See the rules and sources</Link>.
        </p>
      </section>
    </div>
  );
}

function Legend({ icon, cls, title, text }: { icon: React.ReactNode; cls: string; title: string; text: string }) {
  return (
    <li className="rounded-2xl border-2 border-line p-4 flex gap-3">
      <span className={`shrink-0 h-10 w-10 rounded-full grid place-items-center ${cls}`}>{icon}</span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted mt-0.5">{text}</span>
      </span>
    </li>
  );
}
