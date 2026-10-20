const { app, BaseWindow, WebContentsView, ipcMain } = require('electron');
const path = require('node:path');
const { createBrowser } = require('./browser-engine.cjs');
const { createChat } = require('./chat-engine.cjs');
const { PersonalStore } = require('./personal-store.cjs');
const { createPersonal } = require('./personal-engine.cjs');
// Keep native child web views painting when Windows reports transient occlusion.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (process.argv.some(arg => ['--browser-test','--chat-test'].includes(arg))) process.on('uncaughtException', error => { console.error(error.stack); app.exit(1); });
if (process.argv.includes('--browser-test')) app.setPath('userData', path.join(__dirname, '.browser-test-profile'));
if (process.argv.includes('--chat-test')) app.setPath('userData', path.join(__dirname, '.chat-test-profile'));
let window;
if(process.argv.includes('--personal-test')) app.setPath('userData',path.join(__dirname,'.personal-test-profile'));
if(process.argv.includes('--session-test')) app.setPath('userData',path.join(__dirname,'.session-test-profile'));
if(process.argv.includes('--features-test')) app.setPath('userData',path.join(__dirname,'.features-test-profile'));
app.whenReady().then(() => {
  window = new BaseWindow({ width: 1280, height: 850, minWidth: 740, minHeight: 520, backgroundColor: '#000000', frame: false, show: false, title: 'Liquid Glass' });
  const shellView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  window.contentView.addChildView(shellView);
  const sizeShell = () => { const [width, height] = window.getContentSize(); shellView.setBounds({ x: 0, y: 0, width, height }); };
  sizeShell(); window.on('resize', sizeShell);
  window.webContents = shellView.webContents;
  window.webContents.once('did-finish-load', () => window.show());
  const personal = new PersonalStore(app.getPath('userData'));
  const browser = createBrowser(window, { test: process.argv.includes('--browser-test'), profile:personal.active.id, guard:()=>{personal.requireOpen();if(personal.changing)throw Error('Finish changing profiles first.');} });
  const chat = createChat(window, personal.directory(), personal);
  createPersonal(window,personal,chat,browser);
  if(process.argv.includes('--features-test'))window.webContents.once('did-finish-load',()=>require('./features-smoke.cjs').run({app,window,chat,browser}));
  if(process.argv.includes('--session-test')) window.webContents.once('did-finish-load',()=>require('./session-smoke.cjs').run({app,window,chat}));
  if(process.argv.includes('--personal-test')) window.webContents.once('did-finish-load',()=>require('./personal-smoke.cjs').run({app,window,personal,chat,browser}));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.loadFile(path.join(__dirname, 'index.html'));
  window.on('closed', () => { if (!shellView.webContents.isDestroyed()) shellView.webContents.close(); });
  ipcMain.on('window-action', (event, action) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    if (action === 'close') window.close();
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'fullscreen') window.setFullScreen(!window.isFullScreen());
  });
  if (process.argv.includes('--browser-test')) {
    window.webContents.once('did-finish-load', () => require('./browser-smoke.cjs').run({ app, window, browser }));
  }
  if (process.argv.includes('--chat-test')) {
    window.webContents.once('did-finish-load', () => require('./chat-smoke.cjs').run({ app, window, chat, recall: process.argv.includes('--recall') }));
  }
  if (process.argv.includes('--smoke-test')) {
    window.webContents.on('did-finish-load', async () => {
      await new Promise(resolve => setTimeout(resolve, 6000));
      const result = await window.webContents.executeJavaScript(`({loaded: document.body.dataset.loaded, input: !!document.querySelector('#message'), canvas: !!document.querySelector('canvas'), error: document.body.dataset.error || null})`);
      console.log(JSON.stringify(result));
      await new Promise(resolve => setTimeout(resolve, 800));
      const capture = await window.webContents.capturePage();
      require('node:fs').writeFileSync(path.join(__dirname, 'preview.png'), capture.toPNG());
      app.exit(result.loaded === 'true' && result.input && !result.error ? 0 : 1);
    });
  }
});
app.on('window-all-closed', () => app.quit());
