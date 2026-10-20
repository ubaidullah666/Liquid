const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
async function run({app,window,chat,browser}) {
  const errors=[];window.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try {
    await delay(1000);
    const controls=await window.webContents.executeJavaScript(`({files:!!document.querySelector('#attach-files'),web:!!document.querySelector('#use-web'),thinking:!!document.querySelector('#deep-thinking'),terminal:!!document.querySelector('#terminal-toggle')})`);
    assert.ok(Object.values(controls).every(Boolean));
    await window.webContents.executeJavaScript(`window.desktop.chat('set-mode','codex')`);await delay(250);
    chat.save({role:'assistant',content:'```html filename=index.html\n<button id="check" onclick="document.querySelector(\'#result\').textContent=\'working\'">Test preview</button><p id="result">ready</p><link rel="stylesheet" href="style.css"><script src="app.js"></script>\n```\n```css filename=style.css\n#result { color: rgb(1, 2, 3); }\n```\n```javascript filename=app.js\ndocument.body.dataset.linked = "yes";\n```'});
    await delay(250);
    const buttons=await window.webContents.executeJavaScript(`({preview:!![...document.querySelectorAll('.chat-code button')].find(b=>b.textContent==='Preview'),download:!![...document.querySelectorAll('.chat-code button')].find(b=>b.textContent==='Download'),terminalVisible:!document.querySelector('#terminal-toggle').hidden})`);
    assert.ok(Object.values(buttons).every(Boolean));
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.chat-code button')].find(b=>b.textContent==='Run').click()`);
    let preview;
    for(let i=0;i<100;i++){preview=browser.active()?.view;if(preview&&!preview.webContents.isLoading()&&preview.webContents.getURL().startsWith('http://127.0.0.1:'))break;await delay(100);}
    assert.ok(preview,'Preview browser tab did not open');
    const result=await preview.webContents.executeJavaScript(`document.querySelector('#check').click();({value:document.querySelector('#result').textContent,linked:document.body.dataset.linked,color:getComputedStyle(document.querySelector('#result')).color,bridge:typeof window.desktop,node:typeof require})`);
    assert.equal(result.value,'working');assert.equal(result.linked,'yes');assert.equal(result.color,'rgb(1, 2, 3)');assert.equal(result.bridge,'undefined');assert.equal(result.node,'undefined');
    await window.webContents.executeJavaScript(`document.querySelector('#liquid-home').click()`);await delay(1200);
    const multiline=await window.webContents.executeJavaScript(`(()=>{const field=document.querySelector('#message');const event=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});field.dispatchEvent(event);return field.tagName==='TEXTAREA'&&!event.defaultPrevented;})()`);assert.ok(multiline);
    const image=await window.webContents.capturePage();fs.writeFileSync(path.join(__dirname,'features-preview.png'),image.toPNG());
    const report={controls,buttons,preview:result,errors};fs.writeFileSync(path.join(__dirname,'features-test-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    await window.webContents.executeJavaScript(`window.desktop.chat('clear-chat')`);
    const current=await window.webContents.executeJavaScript(`window.desktop.chat('current')`);assert.equal(current.records.length,0);
    app.exit(0);
  }catch(error){console.error(error.stack);app.exit(1);}
}
module.exports={run};
