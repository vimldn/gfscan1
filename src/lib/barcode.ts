/** GTIN helpers. Deterministic; no lookups. */

export function cleanBarcode(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

export function isPlausibleBarcode(code: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(code);
}

/** GS1 mod-10 check digit validation for GTIN-8/12/13/14. */
export function hasValidCheckDigit(code: string): boolean {
  if (!isPlausibleBarcode(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Weights alternate 3,1 starting from the digit nearest the check digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** Equivalent representations of the same GTIN (UPC-A <-> EAN-13 with leading zero). */
export function barcodeVariants(code: string): string[] {
  const out = new Set<string>([code]);
  if (code.length === 12) out.add("0" + code);
  if (code.length === 13 && code.startsWith("0")) out.add(code.slice(1));
  if (code.length === 14 && code.startsWith("0")) out.add(code.slice(1));
  return [...out];
}

/** Compare two GTINs ignoring leading-zero padding. */
export function sameGtin(a: string, b: string): boolean {
  return cleanBarcode(a).padStart(14, "0") === cleanBarcode(b).padStart(14, "0");
}
