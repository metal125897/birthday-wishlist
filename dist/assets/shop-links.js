const SHOPS = [
  [['ozon.ru','ozon.com'], 'Ozon', 'ozon.ico'],
  [['wildberries.ru','wb.ru'], 'Wildberries', 'wildberries.ico'],
  [['market.yandex.ru','market.yandex.com','yandex.market'], 'Яндекс Маркет', 'yandex-market.png'],
  [['henderson.ru'], 'Henderson', 'henderson.svg'],
  [['goldapple.ru'], 'Золотое Яблоко', 'goldapple.png'],
  [['randewoo.ru'], 'Randewoo', 'randewoo.ico'],
  [['rivegauche.ru'], 'РИВ ГОШ', 'rivegauche.svg'],
  [['lamoda.ru'], 'Lamoda'],
  [['sportmaster.ru'], 'Спортмастер'],
  [['letoile.ru'], 'ЛЭТУАЛЬ'],
  [['perekrestok.ru'], 'Перекрёсток', 'perekrestok.svg'],
  [['lenta.com','lenta.ru'], 'Лента'],
  [['maagfashion.ru','maag-fashion.com'], 'MAAG', 'maag.png'],
  [['dns-shop.ru'], 'DNS']
];

export function shopLink(raw) {
  try {
    const url = new URL(raw);
    if (!['http:','https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const known = SHOPS.find(([domains]) => domains.some(domain => host === domain || host.endsWith('.'+domain)));
    const originalHost = raw.match(/^https?:\/\/([^/?#]+)/i)?.[1].split('@').at(-1).replace(/^www\./i,'');
    const iconUrl = known?.[2] ? new URL('./shop-icons/'+known[2], import.meta.url).href : url.origin+'/favicon.ico';
    return {type:'link', url:raw, label:known?.[1] || originalHost || host, iconUrl};
  } catch { return null; }
}

export function descriptionParts(text) {
  const parts=[];
  let cursor=0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"\u0000-\u001f]+/giu)) {
    let raw=match[0];
    // A closing bracket belonging to the surrounding sentence is text, not URL.
    for (const [open,close] of [['(',')'],['[',']'],['{','}']]) {
      while (raw.endsWith(close) && raw.split(close).length>raw.split(open).length) raw=raw.slice(0,-1);
    }
    const link=shopLink(raw);
    if (!link) continue;
    if (match.index>cursor) parts.push({type:'text',value:text.slice(cursor,match.index)});
    parts.push(link);
    cursor=match.index+raw.length;
  }
  if (cursor<text.length) parts.push({type:'text',value:text.slice(cursor)});
  return parts;
}
