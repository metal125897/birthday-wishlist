export const GIFT_CATEGORIES = Object.freeze([
  'Self Care & Cosmetics',
  'Sport',
  'Just Pleasure',
  'Food',
  'Needs'
]);

export function normalizeGiftCategory(value) {
  return GIFT_CATEGORIES.includes(value) ? value : null;
}
