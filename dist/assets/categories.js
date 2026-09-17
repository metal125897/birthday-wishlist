export const GIFT_CATEGORIES = Object.freeze([
  'Self Care & Cosmetics',
  'Sport',
  'Just Pleasure',
  'Food',
  'Needs'
]);

export const GIFT_CATEGORY_LABELS = Object.freeze({
  'Self Care & Cosmetics': 'Забота о себе',
  Sport: 'Жопу качат',
  'Just Pleasure': 'Дофаминовый всплеск',
  Food: 'Еда',
  Needs: 'Практичное'
});

export function normalizeGiftCategory(value) {
  return GIFT_CATEGORIES.includes(value) ? value : null;
}

export function giftCategoryLabel(value) {
  const normalized = normalizeGiftCategory(value);
  return normalized ? GIFT_CATEGORY_LABELS[normalized] : '';
}
