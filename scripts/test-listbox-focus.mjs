import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
for (const [file, name] of [['app.js','control'],['admin.js','elements.categoryControl']]) {
  const source = await readFile(new URL('../dist/assets/'+file, import.meta.url), 'utf8');
  const start = source.indexOf(name+".addEventListener('focusout'");
  const end = source.indexOf('\n  });',start)>=0 && file==='app.js'
    ? source.indexOf('\n  });',start)+6 : source.indexOf('\n});',start)+4;
  assert.ok(start>=0 && end>start);
  const inside={}, outside={}, timers=[];let handler, closes=0;
  const control={contains:node=>node===inside,addEventListener:(type,fn)=>{handler=fn;}};
  const document={activeElement:outside};
  const close=()=>{closes++;};
  vm.runInNewContext(source.slice(start,end),{control,elements:{categoryControl:control},document,close,closeCategoryMenu:close,setTimeout:fn=>timers.push(fn)});
  handler({relatedTarget:inside}); // activeElement is still body during focus transfer.
  assert.equal(closes,0);assert.equal(timers.length,0);
  handler({relatedTarget:null});document.activeElement=inside;timers.shift()();
  assert.equal(closes,0);
  handler({relatedTarget:outside});document.activeElement=outside;
  assert.equal(closes,0);timers.shift()();assert.equal(closes,1);
  handler({relatedTarget:null});timers.shift()();assert.equal(closes,2);
}
console.log('Listbox focus: internal transfer keeps menu open; transient body focus waits; leaving closes, public and admin.');
