// Requires the isolated Firestore Emulator on 127.0.0.1:8787 (demo-wishlist).
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787/v1/projects/demo-wishlist/databases/(default)/documents';
const encode=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v};
const fields=obj=>Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,encode(v)]));
function token(uid,email){const now=Math.floor(Date.now()/1000),b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/demo-wishlist',aud:'demo-wishlist',iat:now,exp:now+3600,sub:uid,user_id:uid,auth_time:now,firebase:{identities:{},sign_in_provider:email?'password':'anonymous'},...(email?{email,email_verified:false}:{})})+'.';}
const a=token('guest-A'),b=token('guest-B'),admin=token('owner-admin','admin@birthday-wishlist.local'),outsider=token('outsider','other@example.test');
const headers=auth=>({'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})});
const gift={...fields({title:'QA only',description:'',desireLevel:3,price:0,category:null,status:'available',reservedBy:null}),createdAt:{timestampValue:'2026-11-04T00:00:00Z'}};
async function seed(id,overrides={},omitOwner=false){const data={...gift,...overrides};if(omitOwner)delete data.reservedBy;const r=await fetch(base+'/gifts/'+id,{method:'PATCH',headers:headers('owner'),body:JSON.stringify({fields:data})});assert.equal(r.status,200,await r.text());}
let count=0;
async function update(label,id,auth,changes,allowed){const mask=Object.keys(changes).map(k=>'updateMask.fieldPaths='+k).join('&');const r=await fetch(base+'/gifts/'+id+'?'+mask,{method:'PATCH',headers:headers(auth),body:JSON.stringify({fields:fields(changes)})});const text=await r.text();assert.equal(r.ok,allowed,label+': '+r.status+' '+text);count++;}
await seed('owned');
await update('unauthenticated cannot reserve','owned',null,{status:'reserved',reservedBy:'guest-A'},false);
await update('cannot reserve for another UID','owned',a,{status:'reserved',reservedBy:'guest-B'},false);
await update('old client cannot reserve without owner','owned',a,{status:'reserved'},false);
await update('owner can reserve','owned',a,{status:'reserved',reservedBy:'guest-A'},true);
await update('cannot steal owner','owned',b,{status:'reserved',reservedBy:'guest-B'},false);
await update('cannot clear another reservation','owned',b,{status:'available',reservedBy:null},false);
await update('other signed in account is not admin','owned',outsider,{status:'available',reservedBy:null},false);
await update('guest cannot edit gift','owned',a,{title:'changed'},false);
await update('owner must clear owner with status','owned',a,{status:'available'},false);
await update('owner can clear own','owned',a,{status:'available',reservedBy:null},true);
await update('reserve again','owned',b,{status:'reserved',reservedBy:'guest-B'},true);
await update('admin can clear any owner','owned',admin,{status:'available',reservedBy:null},true);
await seed('legacy',{status:{stringValue:'reserved'},reservedBy:{nullValue:null}});
await update('legacy cannot be claimed','legacy',a,{reservedBy:'guest-A'},false);
await update('legacy cannot be cleared by guest','legacy',a,{status:'available',reservedBy:null},false);
await update('admin can clear legacy','legacy',admin,{status:'available',reservedBy:null},true);
const noOwner={...gift,status:{stringValue:'reserved'}};delete noOwner.reservedBy;
await seed('missing-owner',noOwner,true);
await update('missing owner cannot be cleared by guest','missing-owner',a,{status:'available',reservedBy:null},false);
await update('admin can clear missing owner','missing-owner',admin,{status:'available',reservedBy:null},true);
await update('admin may add 100 char reason','owned',admin,{reason:'я'.repeat(100)},true);
await update('guest may not edit reason','owned',a,{reason:'changed'},false);
await update('admin may clear reason','owned',admin,{reason:''},true);
await update('reason cannot exceed 100 chars','owned',admin,{reason:'я'.repeat(101)},false);
await update('reason cannot be a number','owned',admin,{reason:42},false);
await update('admin may disable booking','owned',admin,{reservationRequired:false},true);
await update('guest cannot reserve non-bookable gift','owned',a,{status:'reserved',reservedBy:'guest-A'},false);
await update('guest cannot enable booking','owned',a,{reservationRequired:true},false);
await update('booking flag must be boolean','owned',admin,{reservationRequired:'false'},false);
await update('admin may re-enable booking','owned',admin,{reservationRequired:true},true);
await update('guest can reserve after re-enable','owned',a,{status:'reserved',reservedBy:'guest-A'},true);
await update('disable cannot silently preserve invalid reserved state','owned',admin,{reservationRequired:false},false);
await update('owner release still works','owned',a,{status:'available',reservedBy:null},true);
for(const [auth,allowed] of [[a,false],[outsider,false],[admin,true]]){
 const r=await fetch(base+'/gifts/new-'+(++count),{method:'PATCH',headers:headers(auth),body:JSON.stringify({fields:gift})});assert.equal(r.ok,allowed,'create role');
}
for(const [auth,allowed] of [[a,false],[outsider,false],[admin,true]]){
 const r=await fetch(base+'/gifts/legacy',{method:'DELETE',headers:headers(auth)});assert.equal(r.ok,allowed,'delete role');count++;
}
console.log(`Firestore Emulator: ${count} owner/admin/legacy/unauthenticated permission checks passed.`);
