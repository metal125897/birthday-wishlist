import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {giftCategoryLabel} from '../dist/assets/categories.js';
const source = await readFile(new URL('../dist/assets/admin.js', import.meta.url), 'utf8');
let downloaded, clicked = false;
const context = vm.createContext({
  state: {gifts: [
    {title:'Подарок', description:'Ссылка https://example.com', desireLevel:5, price:0, category:'Needs', reason:'Цитата; с "кавычками"\nи переносом'},
    {title:'Без цитаты', description:'', desireLevel:1, price:null, category:null}
  ]},
  giftCategoryLabel, Blob, Intl, Date,
  URL: {createObjectURL: blob => { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {}},
  document: {createElement: () => ({click() {clicked = true;}})},
  setTimeout: fn => fn(), showNotice() {}
});
vm.runInContext(source.slice(source.indexOf('function csvCell('), source.indexOf('\nfunction subscribeToGifts')), context);
context.exportGiftsToCsv();
assert.equal(clicked, true);
assert.equal(downloaded.type, 'text/csv;charset=utf-8');
const bytes = new Uint8Array(await downloaded.arrayBuffer());
assert.deepEqual([...bytes.slice(0,3)], [239,187,191]);
const csv = await downloaded.text();
assert.ok(csv.startsWith('"Название";"Описание";"Уровень желания";"Цена";"Категория";"Цитата"'));
assert.ok(csv.includes('"Подарок";"Ссылка https://example.com";"5";"0";"Практичное";"Цитата; с ""кавычками""\nи переносом"'));
assert.ok(csv.endsWith('"Без цитаты";"";"1";"";"";""'));
assert.equal(context.csvCell('=1+1'), '"\'=1+1"');
console.log('CSV: six columns, quote/empty quote, links, zero price, escaping, formula protection and UTF-8 BOM passed.');
