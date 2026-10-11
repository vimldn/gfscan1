"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";

const ISSUES = [
  ["wrong_status", "The gluten result looks wrong"],
  ["ingredients_changed", "Ingredients on the pack are different"],
  ["gf_claim_missing", "Pack says gluten-free but that isn't shown"],
  ["wrong_product", "Wrong product, photo or name"],
  ["recall", "Recall information is wrong or missing"],
  ["other", "Something else"],
] as const;

export function ReportButton({ barcode, status, observationIds }: { barcode: string; status: string; observationIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState<string>(ISSUES[0][0]);
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const r = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode, issueType: issue, details, contactEmail: email || undefined, classificationStatus: status, observationIds }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setState("done");
      setMsg(j.stored ? "Thanks — your report has been saved for review." : "Thanks. (Report storage isn't configured on this deployment, so it wasn't saved.)");
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border-2 border-ink px-4 py-2.5 font-bold hover:bg-lime/40">
        <Flag size={16} aria-hidden /> Report incorrect information
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="report-h" className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-auto">
            <div className="flex justify-between items-center">
              <h2 id="report-h" className="text-xl font-black">Report incorrect information</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-2"><X /></button>
            </div>
            {state === "done" ? (
              <p className="mt-4" role="status">{msg}</p>
            ) : (
              <form onSubmit={submit} className="mt-3 space-y-3">
                <fieldset>
                  <legend className="font-semibold text-sm">What&apos;s wrong?</legend>
                  <div className="mt-2 space-y-1.5">
                    {ISSUES.map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="issue" value={v} checked={issue === v} onChange={() => setIssue(v)} className="accent-black h-4 w-4" />
                        {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-semibold">
                  Details (what does the pack say?)
                  <textarea required minLength={5} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} rows={4} className="mt-1 w-full border-2 border-ink rounded-xl p-2 font-normal" />
                </label>
                <label className="block text-sm font-semibold">
                  Email (optional, only if you&apos;re happy to be contacted)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border-2 border-ink rounded-xl p-2 font-normal" />
                </label>
                {state === "error" && <p className="text-alert text-sm" role="alert">{msg}</p>}
                <p className="text-xs text-muted">Reports are reviewed by people. They never change a result automatically.</p>
                <button disabled={state === "sending"} className="w-full bg-lime border-2 border-ink rounded-xl py-3 font-extrabold disabled:opacity-60">
                  {state === "sending" ? "Sending…" : "Send report"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
