import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {isGiftPrice} from '../dist/assets/gift-price.js';
import {normalizeGiftCategory} from '../dist/assets/categories.js';
import {publicGiftStatus} from '../dist/assets/reservation-policy.js';
const source = await readFile(new URL('../dist/assets/app.js', import.meta.url), 'utf8');
const state = {mode:'catalog', filter:'all', category:'all', sort:'desire-desc', bookmarks:new Set(['b','c']), gifts:[
  {id:'a', desireLevel:5, price:null, category:'Sport', status:'available'},
  {id:'b', desireLevel:4, price:0, category:'Food', status:'reserved'},
  {id:'c', desireLevel:5, price:9999999, category:'Sport', status:'available'},
  {id:'d', desireLevel:1, price:123, category:null, status:'available'}
]};
const context = vm.createContext({state, isGiftPrice, normalizeGiftCategory, publicGiftStatus, createdMillis:()=>0});
vm.runInContext(source.slice(source.indexOf('function sortedFilteredGifts()'), source.indexOf('\nfunction desireScale')), context);
const ids=()=>Array.from(context.sortedFilteredGifts(), gift=>gift.id);
assert.deepEqual(ids(), ['a','c','b','d']);
state.category='Sport'; state.filter='reserved'; assert.deepEqual(ids(),[]);
state.filter='available'; assert.deepEqual(ids(), ['a','c']);
state.category='all'; state.filter='all';
for(const [sort,expected] of [['price-asc',['b','d','c','a']],['price-desc',['c','d','b','a']],['desire-asc',['d','b','a','c']]]) {
  state.sort=sort; assert.deepEqual(ids(),expected);
}
state.category='Needs'; state.filter='available'; state.sort='price-asc'; state.mode='saved';
assert.deepEqual(ids(), ['c','b']);
assert.equal(state.category,'Needs'); assert.equal(state.filter,'available'); assert.equal(state.sort,'price-asc');
state.mode='catalog'; assert.deepEqual(ids(),[]);
console.log('Catalog: category/status intersection, four sorts, missing prices last, saved mode independent and filters preserved.');

const title = {textContent:''};
const savedCounter = {textContent:''};
context.document = {querySelector: () => savedCounter};
context.elements = {
  counter:{}, list:{}, empty:{querySelector: () => title}, emptyCopy:{}, emptyAction:{}, emptyEyebrow:{}
};
vm.runInContext(source.slice(source.indexOf('function plural('), source.indexOf('\nfunction createdMillis')), context);
vm.runInContext(source.slice(source.indexOf('function updateListSummary('), source.indexOf('\nfunction showNotice')), context);
state.mode='catalog'; state.filter='reserved'; state.category='Sport';
state.gifts=[{status:'available',category:'Food'}];
context.updateListSummary([]);
assert.equal(title.textContent,'Кажется, вы опередили всех!');
assert.equal(context.elements.emptyCopy.textContent,'Все желания пока свободны. Можно выбирать без компромиссов – редкая роскошь!');
assert.equal(context.elements.emptyAction.hidden,false);
state.gifts.push({status:'reserved',category:'Food'});
context.updateListSummary([]);
assert.equal(title.textContent,'Пока нет подарков');
assert.equal(context.elements.emptyCopy.textContent,'В этой категории пока нет забронированных подарков');
assert.equal(context.elements.emptyAction.hidden,false);
state.filter='available'; context.updateListSummary([]);
assert.equal(context.elements.emptyCopy.textContent,'В этой категории ничего не нашлось по текущим фильтрам. Попробуйте изменить категорию или статус.');
assert.equal(context.elements.emptyAction.hidden,true);
assert.equal(context.elements.emptyEyebrow.hidden,false);
state.mode='saved'; context.updateListSummary([]);
assert.equal(title.textContent,'В избранном пока пусто');
assert.equal(context.elements.emptyAction.hidden,true);
state.mode='catalog'; state.filter='all'; state.gifts=[]; context.updateListSummary([]);
assert.equal(context.elements.emptyCopy.textContent,'Список ещё наполняется. Загляните чуть позже.');
context.elements.emptyAction=null; state.filter='reserved';
assert.doesNotThrow(() => context.updateListSummary([]));
console.log('Empty state: no reservations globally vs category-only empty, saved and ordinary empty states passed.');
