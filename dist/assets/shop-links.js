const SHOPS = [
  [['ozon.ru','ozon.com'], 'Ozon'],
  [['wildberries.ru','wb.ru'], 'Wildberries'],
  [['market.yandex.ru','market.yandex.com','yandex.market'], 'Яндекс Маркет'],
  [['henderson.ru'], 'Henderson'],
  [['goldapple.ru'], 'Золотое Яблоко'],
  [['randewoo.ru'], 'Randewoo'],
  [['rivegauche.ru'], 'РИВ ГОШ'],
  [['lamoda.ru'], 'Lamoda'],
  [['sportmaster.ru'], 'Спортмастер'],
  [['letoile.ru'], 'ЛЭТУАЛЬ'],
  [['maagfashion.ru'], 'MAAG'],
  [['dns-shop.ru'], 'DNS']
];

export function shopLink(raw) {
  try {
    const url = new URL(raw);
    if (!['http:','https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const known = SHOPS.find(([domains]) => domains.some(domain => host === domain || host.endsWith('.'+domain)));
    const originalHost = raw.match(/^https?:\/\/([^/?#]+)/i)?.[1].split('@').at(-1).replace(/^www\./i,'');
    return {type:'link', url:raw, label:known?.[1] || originalHost || host, iconUrl:url.origin+'/favicon.ico'};
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
