// Input is already filtered and sorted. Partitioning never changes order or duplicates gifts.
export function catalogSections(gifts, {mode, sort}) {
  if (mode === 'saved' || sort === 'desire-asc') return {featured:[], main:gifts, future:[]};
  const future = gifts.filter(gift => gift.desireLevel === 1);
  const current = gifts.filter(gift => gift.desireLevel !== 1);
  const featured = sort === 'desire-desc' ? current.filter(gift => gift.desireLevel === 5) : [];
  const main = sort === 'desire-desc' ? current.filter(gift => gift.desireLevel !== 5) : current;
  return {featured, main, future};
}
