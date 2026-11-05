import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../dist/assets/admin.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function giftDraft()'),source.indexOf('\nlet descriptionWidth'));
const field=()=>({value:''});
const elements={giftId:field(),title:field(),price:field(),category:field(),description:field(),reason:field(),guidanceThings:field(),guidanceBrands:field(),guidanceDialog:{open:false}};
let level=1,consent=false;
const context=vm.createContext({elements,desireLevel:()=>level,window:{confirm:()=>consent}});
vm.runInContext(functions,context);
assert.equal(context.hasUnsavedDraft(),false);
for(const name of ['title','description','reason','price','category']){
 elements[name].value='changed';assert.equal(context.hasUnsavedDraft(),true);assert.equal(context.allowDiscard(),false);
 consent=true;assert.equal(context.allowDiscard(),true);consent=false;elements[name].value='';assert.equal(context.hasUnsavedDraft(),false);
}
level=5;assert.equal(context.hasUnsavedDraft(),true);level=1;assert.equal(context.hasUnsavedDraft(),false);
elements.guidanceDialog.open=true;elements.guidanceBrands.value='new';assert.equal(context.hasUnsavedDraft(),true);
elements.guidanceDialog.open=false;assert.equal(context.hasUnsavedDraft(),false);
console.log('Draft guard covers gift fields, desire, guidance, reverted edits and discard consent.');
