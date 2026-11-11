import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {giftCategoryLabel} from '../dist/assets/categories.js';
const source = await readFile(new URL('../dist/assets/admin.js', import.meta.url), 'utf8');
let downloaded, downloadLink, clicked = false;
const context = vm.createContext({
  state: {gifts: [
    {title:'Подарок', description:'Ссылка https://example.com', desireLevel:5, price:0, category:'Needs', reason:'Цитата; с "кавычками"\nи переносом', reservationRequired:true},
    {title:'Без цитаты', description:'', desireLevel:1, price:null, category:null},
    {title:'Без брони', description:'', desireLevel:2, price:100, reservationRequired:false}
  ]},
  giftCategoryLabel, Blob, Intl, Date,
  URL: {createObjectURL: blob => { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {}},
  document: {createElement: () => (downloadLink = {click() {clicked = true;}})},
  setTimeout: fn => fn(), showNotice() {}
});
vm.runInContext(source.slice(source.indexOf('function csvCell('), source.indexOf('\nfunction subscribeToGifts')), context);
context.exportGiftsToCsv();
assert.equal(clicked, true);
assert.equal(downloaded.type, 'text/csv;charset=utf-8');
const bytes = new Uint8Array(await downloaded.arrayBuffer());
assert.deepEqual([...bytes.slice(0,3)], [239,187,191]);
const csv = await downloaded.text();
assert.ok(csv.startsWith('"Название";"Описание";"Уровень желания";"Цена";"Категория";"Цитата";"Требуется бронирование"\r\n'));
assert.ok(csv.includes('"Подарок";"Ссылка https://example.com";"5";"0";"Практичное";"Цитата; с ""кавычками""\nи переносом";"Да"'));
assert.ok(csv.includes('"Без цитаты";"";"1";"";"";"";"Да"\r\n'));
assert.ok(csv.endsWith('"Без брони";"";"2";"100";"";"";"Нет"'));
assert.match(downloadLink.download, /^wishlist-gifts-\d{4}-\d{2}-\d{2}\.csv$/);
assert.equal(context.csvCell('=1+1'), '"\'=1+1"');
console.log('CSV: seven ordered columns, old/true/false booking flag, filename, escaping, formula protection and UTF-8 BOM passed.');
