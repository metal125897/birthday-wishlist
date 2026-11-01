export const MAX_GIFT_PRICE = 9999999;

export function isGiftPrice(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_GIFT_PRICE;
}

export function parseGiftPrice(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return /^[0-9]{1,7}$/.test(text) ? Number(text) : NaN;
}
