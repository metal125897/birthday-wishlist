export const DEFAULT_GIFT_GUIDANCE = Object.freeze({
  things: 'Шампунь, гель для душа, бомбочки, пена и соль для ванны, свечи, диффузоры, посуда и приборы, цветы, полотенца, маски на основе глины и тканевые маски.',
  brands: 'Mixit, Aravia, Vois, Natura Siberica, Planeta Organica, Likato, Semily, kottur, Sokolov, HELDI.'
});

export function normalizeGiftGuidance(value) {
  return {
    things: typeof value?.things === 'string' ? value.things.trim() : DEFAULT_GIFT_GUIDANCE.things,
    brands: typeof value?.brands === 'string' ? value.brands.trim() : DEFAULT_GIFT_GUIDANCE.brands
  };
}
