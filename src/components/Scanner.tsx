"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Flashlight, Keyboard } from "lucide-react";
import { cleanBarcode, hasValidCheckDigit } from "@/lib/barcode";

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

async function createDetector(): Promise<Detector> {
  // Prefer the native BarcodeDetector (Android Chrome); fall back to the
  // zxing-wasm ponyfill (iOS Safari, Firefox). The wasm binary is self-hosted.
  const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
    } catch {
      /* fall through */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/wasm/zxing_reader.wasm" : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector;
}

function errorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow camera access in your browser settings, or type the barcode below.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found on this device. Type the barcode below instead.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  return "Couldn't start the camera. Type the barcode below instead.";
}

export function Scanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<{ code: string; n: number }>({ code: "", n: 0 });
  const [status, setStatus] = useState<"starting" | "scanning" | "found" | "error">("starting");
  const [error, setError] = useState<string>("");
  const [hint, setHint] = useState(false);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [manual, setManual] = useState("");
  const [manualErr, setManualErr] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const close = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  const go = useCallback(
    (code: string) => {
      setStatus("found");
      stop();
      try {
        navigator.vibrate?.(60);
      } catch {}
      router.push(`/product/${code}`);
      onClose();
    },
    [router, stop, onClose],
  );

  useEffect(() => {
    let cancelled = false;
    const hintTimer = setTimeout(() => setHint(true), 12000);

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError("Camera scanning needs a secure (https) connection and a supported browser. Type the barcode below instead.");
        return;
      }
      try {
        const [stream, detector] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          }),
          createDetector(),
        ]);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ supported: !!caps.torch, on: false });
        setStatus("scanning");

        let last = 0;
        const tick = async (t: number) => {
          if (cancelled || !streamRef.current) return;
          if (t - last > 120 && v.readyState >= 2) {
            last = t;
            try {
              const found = await detector.detect(v);
              for (const r of found) {
                const code = cleanBarcode(r.rawValue);
                if (!hasValidCheckDigit(code)) continue;
                // Require two consecutive identical reads to avoid misreads.
                if (lastRef.current.code === code) lastRef.current.n++;
                else lastRef.current = { code, n: 1 };
                if (lastRef.current.n >= 2) return go(code);
              }
            } catch {
              /* transient detection errors are ignored */
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(errorMessage(e));
        }
      }
    })();

    const onVis = () => document.hidden && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
      stop();
    };
  }, [go, stop, close]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on } as MediaTrackConstraintSet] });
      setTorch((s) => ({ ...s, on: !s.on }));
    } catch {}
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = cleanBarcode(manual);
    if (!/^\d{8}$|^\d{12,14}$/.test(code)) return setManualErr("Enter the 8, 12, 13 or 14 digits under the barcode.");
    go(code);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan a barcode" className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between px-4 h-14">
        <p className="font-bold">Scan a barcode</p>
        <div className="flex gap-2">
          {torch.supported && (
            <button onClick={toggleTorch} className="p-2 rounded-full bg-white/10" aria-pressed={torch.on} aria-label="Toggle torch">
              <Flashlight size={22} />
            </button>
          )}
          <button onClick={close} className="p-2 rounded-full bg-white/10" aria-label="Close scanner">
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
        {status !== "error" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[78%] max-w-md aspect-[2/1] border-4 border-lime rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        <p aria-live="polite" className="absolute bottom-4 inset-x-0 text-center text-sm px-6">
          {status === "starting" && "Starting camera…"}
          {status === "scanning" && (hint ? "Having trouble? Try more light, hold steady, or type the number below." : "Point at the barcode on the pack")}
          {status === "found" && "Found it — looking up…"}
        </p>
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="bg-white text-ink rounded-2xl p-5 max-w-sm font-medium" role="alert">{error}</p>
          </div>
        )}
      </div>

      <form onSubmit={submitManual} className="bg-white text-ink p-4 flex gap-2 items-start">
        <label className="sr-only" htmlFor="manual-barcode">Barcode number</label>
        <div className="flex-1">
          <div className="flex items-center gap-2 border-2 border-ink rounded-xl px-3">
            <Keyboard size={18} aria-hidden />
            <input
              id="manual-barcode"
              inputMode="numeric"
              pattern="[0-9 ]*"
              autoComplete="off"
              placeholder="Or type the barcode number"
              value={manual}
              onChange={(e) => (setManual(e.target.value), setManualErr(""))}
              className="w-full py-3 outline-none bg-transparent"
            />
          </div>
          {manualErr && <p className="text-sm text-alert mt-1" role="alert">{manualErr}</p>}
        </div>
        <button className="bg-lime border-2 border-ink font-bold rounded-xl px-4 py-3">Check</button>
      </form>
    </div>
  );
}
