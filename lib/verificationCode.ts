import crypto from "crypto";

/** 6 haneli rastgele kod üretir (100000-999999) */
export function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/** Kodun son geçerlilik zamanı (varsayılan 10 dakika sonrası) */
export function codeExpiry(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/** Kod geçerli mi kontrol eder (eşleşiyor ve süresi dolmamış) */
export function isCodeValid(
  storedCode: string | null | undefined,
  storedExpiry: Date | null | undefined,
  inputCode: string
): boolean {
  if (!storedCode || !storedExpiry) return false;
  if (new Date() > new Date(storedExpiry)) return false;
  return storedCode === inputCode;
}