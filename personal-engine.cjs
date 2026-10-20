const {ipcMain}=require('electron');
const {execFile}=require('node:child_process');
const path=require('node:path');
function hello(window,verify=false) { return new Promise((resolve,reject)=>{
 const handle=window.getNativeWindowHandle(); const args=verify?['verify',(handle.length===8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE())).toString()]:['status'];
 execFile(path.join(__dirname,'native','Hello.exe'),args,{windowsHide:true,timeout:120000},(error,stdout)=>{try {const result=JSON.parse(stdout.trim()); if(!result.ok) throw Error(result.error); resolve(result);} catch(e){reject(Error(e.message||error?.message||'Windows Hello is unavailable.'));}});
}); }
function createPersonal(window,store,chat,browser) {
 let pending=false;
 const state=()=>({ok:true,profiles:store.data.profiles.map(({id,name,hello})=>({id,name,hello})),active:store.active.id,locked:store.locked});
 async function verify(profile) { const identity=await hello(window); if(profile.sid && identity.sid!==profile.sid) throw Error('Sign in to the Windows account that protects this profile.'); if(identity.result!==0) throw Error(['Available','No Windows Hello device is available.','Set up Windows Hello in Windows Settings first.','Windows Hello is disabled by policy.','Windows Hello is busy.'][identity.result]||'Windows Hello is unavailable.'); const result=await hello(window,true); if(result.result!==0 || result.sid!==identity.sid) throw Error('Windows Hello did not verify you. Nothing was unlocked.'); return result; }
 ipcMain.handle('personal-command',async(event,command,payload={})=>{
  if(event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame) throw Error('Untrusted command.');
  try {
   if(command==='state') return state();
   if(['hello-status','hello','lock','unlock'].includes(command)) throw Error('Profile locking has been removed.');
   if(pending) throw Error('Finish the Windows Hello check first.');
   if(['switch','unlock','lock','hello','create'].includes(command)) {
    if(chat.busy) throw Error('Stop the current answer before changing profiles.');
    pending=true; store.changing=true;
    try {
     if(command==='create') {store.requireOpen(); store.create(payload.name); return state();}
     if(command==='hello') {store.requireOpen(); const identity=await verify(store.active); store.active.hello=!!payload.enabled; store.active.sid=payload.enabled?identity.sid:undefined; store.save(); return state();}
     if(command==='lock') {store.requireOpen(); if(!store.active.hello) throw Error('Enable Windows Hello for this profile first.'); store.locked=true;}
     else {const profile=store.data.profiles.find(p=>p.id===(payload.id||store.active.id)); if(!profile) throw Error('Profile not found.'); store.data.active=profile.id; store.locked=false; store.save();}
     browser.reset(store.active.id); chat.switchDirectory(store.directory()); await window.webContents.reload(); return state();
    } finally {pending=false; store.changing=false;}
   }
   store.requireOpen();
   if(command==='events') return {ok:true,events:store.events()};
   if(command==='save-event') {const value=store.putEvent(payload); chat.save({role:'user',kind:'calendar',content:'Saved local calendar event: '+JSON.stringify(value)}); return {ok:true,event:value};}
   if(command==='delete-event') {store.removeEvent(payload.id); chat.save({role:'user',kind:'calendar',content:'Deleted local calendar event '+payload.id}); return {ok:true};}
   throw Error('Unknown command.');
  }catch(error){return {ok:false,error:error.message};}
 });
 window.on('closed',()=>ipcMain.removeHandler('personal-command'));
}
module.exports={createPersonal,hello};
