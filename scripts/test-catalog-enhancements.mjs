import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {catalogSections} from '../dist/assets/catalog-sections.js';
import {descriptionParts, shopLink} from '../dist/assets/shop-links.js';
import {requiresReservation, publicGiftStatus, reservationUpdate} from '../dist/assets/reservation-policy.js';
const gifts=[{id:'five',desireLevel:5},{id:'three',desireLevel:3},{id:'one-a',desireLevel:1},{id:'one-b',desireLevel:1}];
let parts=catalogSections(gifts,{mode:'catalog',sort:'desire-desc'});
assert.deepEqual(parts.featured.map(g=>g.id),['five']);assert.deepEqual(parts.main.map(g=>g.id),['three']);assert.deepEqual(parts.future.map(g=>g.id),['one-a','one-b']);
for(const sort of ['price-asc','price-desc']){
 parts=catalogSections([...gifts].reverse(),{mode:'catalog',sort});
 assert.deepEqual(parts.featured,[]);assert.deepEqual(parts.future.map(g=>g.id),['one-b','one-a']);assert.equal(parts.main.length,2);
}
for(const options of [{mode:'saved',sort:'desire-desc'},{mode:'catalog',sort:'desire-asc'}]){
 parts=catalogSections(gifts,options);assert.equal(parts.main.length,4);assert.equal(parts.future.length,0);assert.equal(parts.featured.length,0);
}
assert.equal(catalogSections([gifts[2]],{mode:'catalog',sort:'price-asc'}).future.length,1);
assert.equal(catalogSections([],{mode:'catalog',sort:'desire-desc'}).future.length,0);
assert.equal(requiresReservation({}),true);assert.equal(requiresReservation({reservationRequired:true}),true);assert.equal(requiresReservation({reservationRequired:false}),false);
assert.equal(publicGiftStatus({reservationRequired:false,status:'reserved'}),'available');
assert.throws(()=>reservationUpdate({reservationRequired:false,status:'available'},'reserved','guest'),/reservation-not-required/);
const text='Размер 44\nСсылки: (https://m.ozon.ru/a?q=тест&x=%2B) и https://www.wildberries.ru/item\nhttps://длинный-домен.рф/путь?размер=44';
const tokens=descriptionParts(text);assert.equal(tokens.map(p=>p.type==='text'?p.value:p.url).join(''),text);
assert.deepEqual(tokens.filter(p=>p.type==='link').map(p=>p.label),['Ozon','Wildberries','длинный-домен.рф']);
assert.equal(tokens.find(p=>p.type==='link').url,'https://m.ozon.ru/a?q=тест&x=%2B');
assert.equal(shopLink('https://ozon.ru.evil.example/a').label,'ozon.ru.evil.example');
assert.equal(shopLink('https://m.market.yandex.ru/cc/ABC').label,'Яндекс Маркет');assert.equal(shopLink('https://henderson.ru/a').label,'Henderson');
assert.equal(shopLink('javascript:alert(1)'),null);
// Bundled icons must exist under the module, including the actual MAAG domain.
for (const domain of ['ozon.ru','wildberries.ru','market.yandex.ru','henderson.ru','goldapple.ru','rivegauche.ru','maag-fashion.com','perekrestok.ru','randewoo.ru']) {
  const link = shopLink(`https://${domain}/product`);
  assert.ok(link.iconUrl.includes('/shop-icons/'), domain);
  await access(new URL(link.iconUrl));
}
assert.equal(shopLink('https://maag-fashion.com/product/4101820800/').label,'MAAG');
assert.equal(shopLink('https://www.perekrestok.ru/product').label,'Перекрёсток');
assert.equal(shopLink('https://lenta.com/product').label,'Лента');
assert.equal(shopLink('https://magnit.ru/product').label,'Магнит');
assert.equal(shopLink('https://shop.fix-price.com/product').label,'FixPrice');
assert.deepEqual(descriptionParts('Без ссылок\nПодробности'),[{type:'text',value:'Без ссылок\nПодробности'}]);
console.log('Future grouping, old/new booking semantics, shop labels, exact URLs, Unicode/parameters and preserved description text passed.');
