const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {PersonalStore}=require('./personal-store.cjs');
test('calendar persistence, validation, profile isolation and lock migration',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liquid-personal-'));const s=new PersonalStore(root);const first=s.active.id;
 const e=s.putEvent({title:'Meeting',start:'2026-10-01T10:00:00Z',end:'2026-10-01T11:00:00Z',notes:'Bring notes'});
 assert.equal(new PersonalStore(root).events()[0].title,'Meeting');assert.throws(()=>s.putEvent({title:'Bad',start:'bad',end:'bad'}));assert.throws(()=>s.putEvent({...e,end:e.start}));
 const second=s.create('Work');s.data.active=second.id;assert.equal(s.events().length,0);s.data.active=first;assert.equal(s.events().length,1);
 s.locked=true;assert.throws(()=>s.events(),/Unlock/);assert.throws(()=>s.putEvent(e),/Unlock/);s.locked=false;s.removeEvent(e.id);assert.equal(s.events().length,0);
 s.active.hello=true;s.active.sid='old-identity';s.save();const migrated=new PersonalStore(root);assert.equal(migrated.locked,false);assert.equal(migrated.active.hello,false);assert.equal(migrated.active.sid,undefined);
});
test('legacy history migrates without removing original',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'liquid-migration-'));fs.writeFileSync(path.join(root,'conversation-history.jsonl'),'original');const s=new PersonalStore(root);assert.equal(fs.readFileSync(path.join(s.directory(),'conversation-history.jsonl'),'utf8'),'original');assert.ok(fs.existsSync(path.join(root,'conversation-history.jsonl')));});
