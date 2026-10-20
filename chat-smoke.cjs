const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HistoryStore } = require('./history-store.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run({ app, window, chat, recall }) {
  const timeout = setTimeout(() => { console.error('Chat test timed out'); app.exit(1); }, 230000);
  try {
    window.show(); window.focus();
    const js = code => window.webContents.executeJavaScript(code, true);
    for (let attempt = 0; attempt < 100; attempt++) { if (await js("document.body.dataset.loaded === 'true'")) break; await delay(100); }
    await delay(300);
    const before = chat.history.all().length;
    const question = recall ? 'What is my test project called? Reply with its exact name only.' : 'Remember this fact for later: my test project is called Aurora-Cobalt-731. Reply only with Saved.';
    await js(`document.querySelector('#message').value=${JSON.stringify(question)}; document.querySelector('#composer').requestSubmit()`);
    for (let attempt = 0; attempt < 1800; attempt++) { if (chat.history.all().length > before && !chat.busy) break; await delay(100); }
    const latest = chat.history.all().at(-1);
    assert.equal(latest.role, 'assistant'); assert.equal(latest.status, 'complete', latest.error); assert(latest.content.length > 0);
    assert.equal(await js("document.body.classList.contains('browser-mode')"), false);
    assert.equal(latest.model, 'qwen2.5:3b');
    if (recall) assert.match(latest.content, /Aurora-Cobalt-731/i);
    const reloaded = new HistoryStore(app.getPath('userData'));
    assert.equal(reloaded.all().at(-1).content, latest.content);
    assert(reloaded.all().some(row => row.content.includes('Aurora-Cobalt-731')));
    await delay(500);
    fs.writeFileSync(path.join(__dirname, 'chat-preview.png'), (await window.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ ok: true, phase: recall ? 'recall after process restart' : 'local model and save', model: latest.model, answer: latest.content, savedRecords: reloaded.all().length, normalChatStayedInApp: true }, null, 2));
    clearTimeout(timeout); app.exit(0);
  } catch (error) { console.error(error.stack); clearTimeout(timeout); app.exit(1); }
}
module.exports = { run };
