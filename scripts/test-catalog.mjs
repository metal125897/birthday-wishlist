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
