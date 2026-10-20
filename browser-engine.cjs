const { WebContentsView, ipcMain, session, Menu, dialog } = require('electron');
const { resolveAddress, browserIntent } = require('./browser-input.cjs');

function createBrowser(window, { test = false, profile='default', guard=()=>{} } = {}) {
  const tabs = new Map();
  let partition = test ? 'liquid-browser-test' : 'persist:liquid-'+profile;
  let browserSession = session.fromPartition(partition);
  const grants = new Set();
  let selected = null, counter = 0, visible = false, ready = false, findOpen = false;
  let notice = '', download = null;
  const isWeb = url => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } };
  const active = () => tabs.get(selected);
  const send = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send('browser-state', {
      visible, ready, active: selected, notice, download, findOpen,
      tabs: [...tabs.values()].map(tab => ({ id: tab.id, title: tab.title, url: tab.url, loading: tab.loading, error: tab.error, zoom: Math.round(tab.zoom * 100) })),
      back: active()?.view.webContents.navigationHistory.canGoBack() || false,
      forward: active()?.view.webContents.navigationHistory.canGoForward() || false
    });
  };
  const layout = () => {
    if (window.isDestroyed()) return;
    const [width, height] = window.getContentSize();
    for (const tab of tabs.values()) {
      const top = findOpen ? 164 : 118;
      tab.view.setBounds({ x: 10, y: top, width: Math.max(1, width - 20), height: Math.max(1, height - top - 28) });
      tab.view.setVisible(visible && ready && tab.id === selected && !!tab.url && !tab.error);
    }
    const current = active();
    if (current && visible && ready && current.url && !current.error) window.contentView.addChildView(current.view);
  };
  const origin = url => { try { return new URL(url).origin; } catch { return ''; } };
  const permissionKey = (wc, permission, details = {}) => `${origin(details.requestingUrl || details.securityOrigin || wc?.getURL() || '')}|${permission}|${(details.mediaTypes || [details.mediaType || '']).join(',')}`;
  function configureSession() {
  browserSession.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => grants.has(permissionKey(wc, permission, { ...details, securityOrigin: requestingOrigin })));
  browserSession.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const allowed = ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock'];
    if (!allowed.includes(permission) || !wc || wc.isDestroyed() || !isWeb(wc.getURL())) return callback(false);
    const key = permissionKey(wc, permission, details);
    if (grants.has(key)) return callback(true);
    const name = permission === 'media' ? (details.mediaTypes || ['camera / microphone']).join(' and ') : permission.replaceAll('-', ' ');
    try {
      const result = await dialog.showMessageBox(window, { type: 'question', title: 'Website permission', message: `${origin(details.requestingUrl || wc.getURL())} wants to use ${name}.`, buttons: ['Block', 'Allow for this session'], defaultId: 0, cancelId: 0, noLink: true });
      if (result.response === 1) grants.add(key);
      callback(result.response === 1);
    } catch { callback(false); }
  });
  browserSession.on('will-download', (_event, item) => {
    download = { name: item.getFilename(), state: 'Downloading', percent: 0 };
    send();
    item.on('updated', (_event, state) => { download = { name: item.getFilename(), state: state === 'interrupted' ? 'Interrupted' : 'Downloading', percent: item.getTotalBytes() ? Math.round(item.getReceivedBytes() / item.getTotalBytes() * 100) : 0 }; send(); });
    item.once('done', (_event, state) => { download = { name: item.getFilename(), state: state === 'completed' ? 'Saved' : state, percent: state === 'completed' ? 100 : 0 }; send(); });
  });
  }
  function select(id) {
    if (!tabs.has(id)) return;
    selected = id; findOpen = false; layout(); send();
    if (visible && ready && active().url && !active().error) active().view.webContents.focus();
  }
  function load(tab, query) {
    const url = resolveAddress(query);
    tab.error = ''; tab.url = url; tab.title = url ? 'Loading…' : 'New tab'; tab.loading = !!url;
    if (url) tab.view.webContents.loadURL(url).catch(error => { if (!tab.view.webContents.isDestroyed() && error.code !== 'ERR_ABORTED') { tab.error = error.message; tab.loading = false; layout(); send(); } });
    else tab.view.webContents.loadURL('about:blank').catch(() => {});
    layout(); send();
  }
  function add(query = '', { focus = true, supplied = null } = {}) {
    const view = supplied || new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, spellcheck: true, backgroundThrottling: false } });
    view.setBackgroundColor('#ffffff'); view.setVisible(false);
    window.contentView.addChildView(view);
    const wc = view.webContents;
    wc.setBackgroundThrottling(false);
    const tab = { id: ++counter, view, title: 'New tab', url: '', loading: false, error: '', zoom: 1 };
    tabs.set(tab.id, tab);
    const update = () => { if (!tabs.has(tab.id) || wc.isDestroyed()) return; const url = wc.getURL(); if (isWeb(url)) tab.url = url; tab.title = tab.url ? (wc.getTitle() || tab.title) : 'New tab'; send(); };
    wc.on('did-start-loading', () => { tab.loading = true; send(); });
    wc.on('did-stop-loading', () => { tab.loading = false; update(); });
    wc.on('did-start-navigation', (_event, url, inPlace, mainFrame) => { if (mainFrame && isWeb(url)) { tab.url = url; tab.error = ''; layout(); send(); } });
    wc.on('did-navigate', update); wc.on('did-navigate-in-page', update); wc.on('page-title-updated', update);
    wc.on('did-finish-load', () => { tab.error = ''; update(); layout(); });
    wc.on('did-fail-load', (_event, code, description, url, mainFrame) => { if (mainFrame && code !== -3) { tab.error = `${description} (${code})`; tab.loading = false; if (isWeb(url)) tab.url = url; layout(); send(); } });
    wc.on('render-process-gone', () => { tab.error = 'This page stopped responding. Reload to try again.'; tab.loading = false; layout(); send(); });
    const guard = (event, url) => { if (!isWeb(url) && url !== 'about:blank') { event.preventDefault(); notice = 'This link requires an external app. Liquid keeps browsing inside this window.'; send(); } };
    wc.on('will-navigate', guard); wc.on('will-redirect', guard);
    wc.setWindowOpenHandler(details => {
      if (!isWeb(details.url) && details.url !== 'about:blank') return { action: 'deny' };
      return { action: 'allow', outlivesOpener: true, overrideBrowserWindowOptions: { webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false } }, createWindow: options => {
        const child = new WebContentsView({ webContents: options.webContents, webPreferences: options.webPreferences });
        // Attach the actual popup contents, preserving POST requests and window.opener.
        const popup = attachPopup(child);
        return popup.view.webContents;
      } };
    });
    function attachPopup(child) {
      const popup = add('', { supplied: child, focus: true });
      return popup;
    }
    wc.on('context-menu', (_event, info) => {
      const items = [];
      if (isWeb(info.linkURL)) items.push({ label: 'Open link in new tab', click: () => add(info.linkURL) }, { label: 'Copy link address', click: () => require('electron').clipboard.writeText(info.linkURL) }, { type: 'separator' });
      if (info.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
      else if (info.selectionText) items.push({ role: 'copy' }, { label: 'Search selection in a new tab', click: () => add(info.selectionText) });
      items.push({ type: 'separator' }, { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() }, { label: 'Reload', click: () => wc.reload() });
      Menu.buildFromTemplate(items).popup({ window });
    });
    wc.on('found-in-page', (_event, result) => { if (selected === tab.id) window.webContents.send('browser-find', { count: result.matches, current: result.activeMatchOrdinal }); });
    wc.on('before-input-event', (event, input) => shortcut(event, input));
    wc.on('enter-html-full-screen', () => { window.setFullScreen(true); });
    wc.on('leave-html-full-screen', () => { window.setFullScreen(false); });
    wc.on('destroyed', () => { if (tabs.has(tab.id)) { tabs.delete(tab.id); if (selected === tab.id) selected = [...tabs.keys()].at(-1) || null; if (!tabs.size) add(); layout(); send(); } });
    if (focus && supplied) setImmediate(() => { if (tabs.has(tab.id)) select(tab.id); });
    else if (focus) select(tab.id);
    if (!supplied) load(tab, query);
    return tab;
  }
  function close(id) {
    const tab = tabs.get(id); if (!tab) return;
    tabs.delete(id); window.contentView.removeChildView(tab.view); tab.view.webContents.close();
    if (selected === id) selected = [...tabs.keys()].at(-1) || null;
    if (!tabs.size) add();
    layout(); send();
  }
  function focusAddress() { window.webContents.focus(); window.webContents.send('browser-focus', 'address'); }
  function shortcut(event, input) {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta; const key = input.key.toLowerCase();
    let handled = true;
    if (input.key === 'F11') window.setFullScreen(!window.isFullScreen());
    else if (ctrl && key === 'l') { if (visible) focusAddress(); else window.webContents.send('browser-focus', 'open'); }
    else if (ctrl && key === 't') { if (!visible) window.webContents.send('browser-focus', 'open'); else { add(); focusAddress(); } }
    else if (ctrl && key === 'w' && visible) close(selected);
    else if ((ctrl && key === 'r' || input.key === 'F5') && visible) active()?.view.webContents.reload();
    else if (ctrl && key === 'f' && visible) { findOpen = !findOpen; layout(); send(); if (findOpen) { window.webContents.focus(); window.webContents.send('browser-focus', 'find'); } }
    else if (ctrl && key === 'tab' && visible) { const ids = [...tabs.keys()]; select(ids[(ids.indexOf(selected) + (input.shift ? ids.length - 1 : 1)) % ids.length]); }
    else if (input.alt && input.key === 'ArrowLeft' && visible) action('back');
    else if (input.alt && input.key === 'ArrowRight' && visible) action('forward');
    else if (ctrl && ['+', '=', '-', '0'].includes(key) && visible) action(key === '0' ? 'zoom-reset' : key === '-' ? 'zoom-out' : 'zoom-in');
    else if (key === 'escape' && visible && findOpen) { findOpen = false; active()?.view.webContents.stopFindInPage('clearSelection'); layout(); send(); }
    else handled = false;
    if (handled) event.preventDefault();
  }
  function action(name, value) {
    guard();
    const tab = active(), wc = tab?.view.webContents;
    if (name === 'ready') { ready = true; layout(); send(); return; }
    if (name === 'home') { visible = false; ready = false; findOpen = false; layout(); send(); window.webContents.focus(); return; }
    if (name === 'new') { add(); focusAddress(); return; }
    if (name === 'select') return select(Number(value));
    if (name === 'close') return close(Number(value));
    if (name === 'menu') {
      Menu.buildFromTemplate([
        { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => { add(); focusAddress(); } },
        { label: 'Find on page', accelerator: 'CmdOrCtrl+F', click: () => { findOpen = true; layout(); send(); window.webContents.focus(); window.webContents.send('browser-focus', 'find'); } },
        { type: 'separator' },
        { label: 'Zoom in', click: () => action('zoom-in') }, { label: 'Zoom out', click: () => action('zoom-out') }, { label: 'Actual size', click: () => action('zoom-reset') },
        { type: 'separator' }, { label: 'Print…', click: () => action('print') },
        { label: 'Fullscreen', accelerator: 'F11', click: () => window.setFullScreen(!window.isFullScreen()) },
        { type: 'separator' }, { label: 'Return to the orb', click: () => window.webContents.send('browser-focus', 'home') }
      ]).popup({ window, x: window.getContentSize()[0] - 245, y: 104 });
      return;
    }
    if (!wc) return;
    if (name === 'navigate') load(tab, value);
    if (name === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (name === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if (name === 'reload') { tab.error = ''; wc.reload(); layout(); }
    if (name === 'stop') wc.stop();
    if (name === 'find') { findOpen = !!value; if (!findOpen) wc.stopFindInPage('clearSelection'); layout(); }
    if (name === 'find-text') { if (value?.text) wc.findInPage(String(value.text).slice(0, 500), { forward: value.forward !== false, findNext: !value.next }); else wc.stopFindInPage('clearSelection'); }
    if (name.startsWith('zoom-')) { tab.zoom = name === 'zoom-reset' ? 1 : Math.max(.5, Math.min(2, tab.zoom + (name === 'zoom-in' ? .1 : -.1))); wc.setZoomFactor(tab.zoom); }
    if (name === 'print') wc.print({ silent: false, printBackground: true });
    if (name === 'dismiss-download') download = null;
    if (name === 'dismiss-notice') notice = '';
    send();
  }
  ipcMain.handle('browser-command', async (event, command, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted browser command.');
    try {
      guard();
      if (command === 'intent') return browserIntent(payload?.text, payload?.previous);
      if (command === 'open') {
        const query = String(payload || ''); resolveAddress(query);
        visible = true; ready = false;
        if (!tabs.size) add(query); else if (query) add(query);
        layout(); send(); return { ok: true };
      }
      if (command === 'state') { send(); return { ok: true }; }
      action(command, payload); return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  configureSession();
  window.webContents.on('before-input-event', (event,input)=>{try{guard();shortcut(event,input);}catch{}});
  window.on('resize', layout);
  window.on('closed', () => { for (const tab of tabs.values()) { tab.view.webContents.removeAllListeners('destroyed'); tab.view.webContents.close(); } tabs.clear(); ipcMain.removeHandler('browser-command'); });
  return { tabs, active, action, get browserSession(){return browserSession;}, layout, reset(id){
    visible=false; ready=false; selected=null; findOpen=false; notice=''; download=null;
    const old=[...tabs.values()]; tabs.clear(); for(const tab of old){window.contentView.removeChildView(tab.view); tab.view.webContents.close();}
    grants.clear(); browserSession.removeAllListeners('will-download');
    partition=test?'liquid-browser-test':'persist:liquid-'+id; browserSession=session.fromPartition(partition); configureSession(); send();
  } };
}
module.exports = { createBrowser };
