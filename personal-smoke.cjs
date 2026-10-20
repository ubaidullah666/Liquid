const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
exports.run=async({app,window,personal,chat,browser})=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>window.webContents.executeJavaScript(code);const call=(command,payload)=>js(`window.desktop.personal(${JSON.stringify(command)},${JSON.stringify(payload)})`);
 try{
  window.setAlwaysOnTop(true);window.show();window.focus();await pause(2500);let state=await call('state');assert.ok(state.ok);const original=state.active;
  await js("document.querySelector('.personal-nav button').click()");await pause(400);assert.equal(await js("document.querySelector('dialog').open"),true);
  const event=await call('save-event',{title:'Calendar smoke test',start:'2026-10-02T09:00:00Z',end:'2026-10-02T10:00:00Z',notes:'A local event'});assert.ok(event.ok);
  assert.ok((await call('events')).events.some(e=>e.id===event.event.id));assert.ok(personal.context().content.includes('Calendar smoke test'));
  assert.equal((await call('save-event',{title:'Bad',start:'bad',end:'bad'})).ok,false);
  chat.save({role:'user',content:'Profile isolation marker'});await browser.browserSession.cookies.set({url:'https://example.com',name:'profile-test',value:'one'});
  state=await call('create',{name:'Smoke '+Date.now()});const other=state.profiles.at(-1).id;
  async function switchTo(id){const loaded=new Promise(r=>window.webContents.once('did-finish-load',r));await call('switch',{id}).catch(()=>{});await loaded;await pause(800);}
  await switchTo(other);assert.equal((await call('events')).events.length,0);assert.equal(chat.history.all().length,0);assert.equal((await browser.browserSession.cookies.get({name:'profile-test'})).length,0);
  await switchTo(original);assert.ok(chat.history.all().some(r=>r.content==='Profile isolation marker'));assert.ok((await call('events')).events.some(e=>e.id===event.event.id));assert.equal((await browser.browserSession.cookies.get({name:'profile-test'}))[0].value,'one');
  assert.equal((await call('lock')).ok,false);assert.equal((await call('state')).locked,false);
  personal.locked=false;personal.active.hello=false;personal.save();window.webContents.reload();await pause(1500);await js("document.querySelector('.personal-nav button').click()");await pause(500);
  for(let n=0;n<20 && !await js("document.querySelector('dialog').open");n++)await pause(200);
  assert.equal(await js("document.querySelector('dialog').open"),true);
  assert.equal(await js("document.querySelector('.event-form').getBoundingClientRect().bottom <= document.querySelector('.event-list').getBoundingClientRect().top"),true);
  window.show();window.focus();await pause(1200);fs.writeFileSync(path.join(__dirname,'calendar-preview.png'),(await window.webContents.capturePage()).toPNG());
  console.log('PASS: calendar CRUD, context, profile persistence, chat/cookie isolation and removed lock');app.exit(0);
 }catch(error){console.error(error.stack);app.exit(1);}
};
