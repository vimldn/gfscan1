/* eslint-disable @next/next/no-img-element */
import { ScanBarcode } from "lucide-react";

export function ProductImage({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`bg-neutral-100 grid place-items-center text-muted ${className}`} aria-label="No product photo available" role="img">
        <ScanBarcode size={32} aria-hidden />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`bg-white object-contain ${className}`} />;
}
