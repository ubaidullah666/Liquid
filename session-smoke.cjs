const assert=require('node:assert/strict');
exports.run=async({app,window,chat})=>{
 const delay=ms=>new Promise(r=>setTimeout(r,ms)); const js=code=>window.webContents.executeJavaScript(code);
 const timeout=setTimeout(()=>{console.error('Session test timed out');app.exit(1);},30000);
 try{
  await delay(1500);assert.equal((await js("window.desktop.chat('current')")).records.length,0);assert.equal(await js("document.querySelectorAll('.chat-message').length"),0);
  if(process.argv.includes('--reopen')){
   assert.ok((await js("window.desktop.chat('history')")).records.some(r=>r.content==='Previous conversation marker'));
   await js("document.querySelector('#history-toggle').click()");await delay(300);assert.ok(await js("document.querySelector('#chat-sessions').options.length>1"));
  }else{
   chat.save({role:'user',content:'Previous conversation marker'});const previous=(await js("window.desktop.chat('current')")).sessionId;
   await delay(100);await js("document.querySelector('#new-chat').click()");await delay(300);
   assert.equal((await js("window.desktop.chat('current')")).records.length,0);assert.equal(await js("document.querySelectorAll('.chat-message').length"),0);
   assert.notEqual((await js("window.desktop.chat('current')")).sessionId,previous);
   await js("document.querySelector('#history-toggle').click()");await delay(300);
   await js(`document.querySelector('#chat-sessions').value=${JSON.stringify(previous)};document.querySelector('#chat-sessions').dispatchEvent(new Event('change'))`);await delay(300);
   assert.equal(await js("document.querySelector('.message-content').textContent"),'Previous conversation marker');
   assert.equal((await js("window.desktop.chat('current')")).sessionId,previous);
  }
  console.log('PASS: '+(process.argv.includes('--reopen')?'fresh chat after process restart; previous chat retained in History':'New chat button clears transcript; History reopens the saved conversation'));
  clearTimeout(timeout);app.exit(0);
 }catch(e){console.error(e.stack);clearTimeout(timeout);app.exit(1);}
};
