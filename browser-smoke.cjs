const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await predicate()) return; await delay(100); }
  throw new Error('Timed out: ' + label);
}
async function run({ app, window, browser }) {
  const checks = [];
  checks.push = function (...items) { console.log('PASS: ' + items.join(', ')); return Array.prototype.push.apply(this, items); };
  const timeout = setTimeout(() => { console.error('Browser test exceeded 90 seconds.'); app.exit(1); }, 90000);
  const server = http.createServer((req, res) => {
    if (req.url === '/unreachable') return req.socket.destroy();
    const second = req.url.startsWith('/second');
    if (req.url.startsWith('/download')) { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="liquid-test.txt"' }); return res.end('Liquid test download'); }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'liquid=present; SameSite=Lax' });
    res.end(`<!doctype html><html><head><title>${second ? 'Second page' : 'Liquid browser test'}</title><style>body{margin:0;padding:65px;font:18px system-ui;color:#24304a;background:#f5f8fc}h1{font-weight:500}a,button{display:inline-block;margin:12px;padding:14px}input{padding:14px}</style></head><body><h1>${second ? 'Second page' : 'A real page, inside Liquid.'}</h1><p>Navigation, forms, links, and cookies run in Chromium.</p><a id="next" href="/second">Next page</a><a id="popup" href="/second?popup" target="_blank">Open tab</a><form id="form" action="/second" method="post" target="_blank"><input name="q" value="hello"><button>Submit form</button></form><input id="typing" placeholder="Type here"><a id="download" href="/download">Download</a></body></html>`);
  });
  const js = code => window.webContents.executeJavaScript(code, true);
  try {
    window.setAlwaysOnTop(true); window.show(); window.focus();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    await until(() => js("document.body.dataset.loaded === 'true'"), 'Blender asset');
    await js(`document.querySelector('#message').value = 'open browser'; document.querySelector('#composer').requestSubmit();`);
    await until(() => js("document.body.classList.contains('browser-ready')"), 'orb transformation');
    console.log('WINDOW: ' + JSON.stringify({ shown: window.isVisible(), root: window.contentView.getBounds(), children: window.contentView.children.map(view => ({ bounds: view.getBounds(), visible: view.getVisible(), id: view.webContents?.id })), renderer: await js("({visibility:document.visibilityState, animations:document.getAnimations().map(a=>({time:a.currentTime,state:a.playState})),top:document.querySelector('#composer').getBoundingClientRect().top})") }));
    await until(() => js("document.querySelector('#composer').getBoundingClientRect().top < 65"), 'address bar animation settles');
    assert.equal(browser.tabs.size, 1); checks.push('command transformation and new tab');
    const rect = await js("(() => { const r = document.querySelector('#composer').getBoundingClientRect(); return {top:r.top,height:r.height}; })()");
    assert(rect.top >= 50 && rect.top < 65 && Math.abs(rect.height - 46) < .5, JSON.stringify(rect)); checks.push('same input moves to browser address position');
    await delay(800);
    fs.writeFileSync(path.join(__dirname, 'browser-newtab-preview.png'), (await window.webContents.capturePage()).toPNG());
    await js(`document.querySelector('#message').value = ${JSON.stringify(base)}; document.querySelector('#composer').requestSubmit();`);
    await until(() => browser.active()?.view.webContents.getTitle() === 'Liquid browser test', 'embedded HTTP page');
    let wc = browser.active().view.webContents;
    assert.equal(await wc.executeJavaScript('typeof window.desktop'), 'undefined');
    assert.equal(await wc.executeJavaScript('typeof require'), 'undefined');
    assert((await wc.executeJavaScript('document.cookie')).includes('liquid=present')); checks.push('isolated website, cookies, real Chromium');
    await wc.executeJavaScript("document.querySelector('#typing').focus()"); wc.insertText('typed in the embedded page');
    assert.equal(await wc.executeJavaScript("document.querySelector('#typing').value"), 'typed in the embedded page'); checks.push('page keyboard input');
    await wc.executeJavaScript("document.querySelector('#next').click()");
    await until(() => wc.getTitle() === 'Second page', 'navigation');
    browser.action('back'); await until(() => wc.getTitle() === 'Liquid browser test', 'back');
    browser.action('forward'); await until(() => wc.getTitle() === 'Second page', 'forward');
    browser.action('reload'); await until(() => !browser.active().loading, 'reload'); checks.push('back, forward, reload');
    browser.action('back'); await until(() => wc.getTitle() === 'Liquid browser test' && !wc.isLoading(), 'back for popup');
    console.log('CHECK: invoking target=_blank link');
    await wc.executeJavaScript("document.querySelector('#popup').click()", true);
    console.log('CHECK: popup click returned, tabs=' + browser.tabs.size);
    await until(() => browser.tabs.size === 2 && browser.active().view.webContents.getTitle() === 'Second page', 'popup tab'); checks.push('target=_blank stays in the same window');
    browser.action('close', browser.active().id); assert.equal(browser.tabs.size, 1);
    wc = browser.active().view.webContents;
    await wc.executeJavaScript("document.querySelector('#form').requestSubmit()", true);
    await until(() => browser.tabs.size === 2 && browser.active().view.webContents.getTitle() === 'Second page', 'POST popup'); checks.push('POST form popup preserved');
    browser.action('close', browser.active().id); wc = browser.active().view.webContents;
    browser.action('find', true); browser.action('find-text', { text: 'Navigation' });
    await until(() => js("document.querySelector('#find-count').textContent.includes('1')"), 'find');
    browser.action('find', false); browser.action('zoom-in'); assert(wc.getZoomFactor() > 1); browser.action('zoom-reset'); checks.push('find and zoom');
    const downloadPath = path.join(app.getPath('userData'), 'liquid-test.txt');
    browser.browserSession.prependOnceListener('will-download', (_event, item) => item.setSavePath(downloadPath));
    await wc.executeJavaScript("document.querySelector('#download').click()", true);
    await until(() => fs.existsSync(downloadPath) && fs.readFileSync(downloadPath, 'utf8') === 'Liquid test download', 'download');
    checks.push('file download');
    browser.action('navigate', base + '/unreachable');
    await until(() => !!browser.active().error, 'network error');
    assert.equal(browser.active().view.getVisible(), false);
    browser.action('navigate', base);
    await until(() => wc.getTitle() === 'Liquid browser test' && !wc.isLoading() && !browser.active().error, 'network recovery');
    checks.push('network failure and recovery');
    window.setSize(950, 680); await delay(200);
    assert.equal(browser.active().view.getBounds().width, window.getContentSize()[0] - 20); checks.push('native web page resizes with window');
    window.setSize(1280, 850); await delay(200);
    const bad = await js("window.desktop.browser('navigate', 'file:///C:/Windows/win.ini')"); assert.equal(bad.ok, false); checks.push('privileged URL rejected');
    await js("document.querySelector('#liquid-home').click()");
    await until(() => js("!document.body.classList.contains('browser-mode')"), 'return to orb');
    await delay(1050);
    await js("document.querySelector('#message').value='open browser'; document.querySelector('#composer').requestSubmit()");
    await until(() => js("document.body.classList.contains('browser-ready')"), 'reopen browser');
    assert.equal(browser.tabs.size, 1); assert.equal(browser.active().view.webContents.getTitle(), 'Liquid browser test'); checks.push('orb return preserves the browsing session');
    // A real external HTTPS page verifies network access outside the fixture.
    await js("window.desktop.browser('navigate', 'https://example.com')");
    await until(() => browser.active().view.webContents.getTitle() === 'Example Domain', 'external HTTPS browsing', 30000);
    checks.push('external HTTPS page');
    await delay(600);
    fs.writeFileSync(path.join(__dirname, 'browser-preview.png'), (await window.webContents.capturePage()).toPNG());
    assert.equal(browser.active().view.getVisible(), true);
    console.log('VIEW: ' + JSON.stringify({ root: window.contentView.getBounds(), children: window.contentView.children.map(view => ({ bounds: view.getBounds(), visible: view.getVisible(), id: view.webContents?.id })), active: browser.active().view.webContents.id }));
    assert((await browser.active().view.webContents.executeJavaScript('innerWidth')) > 500);
    const { desktopCapturer } = require('electron');
    const captures = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1600, height: 1100 } });
    const capture = captures.find(source => source.id === window.getMediaSourceId());
    if (!capture || capture.thumbnail.isEmpty()) throw new Error('Could not capture the app window');
    fs.writeFileSync(path.join(__dirname, 'browser-window-preview.png'), capture.thumbnail.toPNG());
    const pixels = capture.thumbnail.toBitmap();
    let bright = 0;
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 180 && pixels[index + 1] > 180 && pixels[index + 2] > 180) bright++;
    assert(bright > pixels.length / 4 * .1, 'The actual webpage must be visibly painted in the native window.');
    checks.push('webpage visible in the native window capture');
    console.log(JSON.stringify({ ok: true, checks }, null, 2));
    clearTimeout(timeout); server.close(); app.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, checks, error: error.stack }, null, 2));
    try { fs.writeFileSync(path.join(__dirname, 'browser-failure.png'), (await window.webContents.capturePage()).toPNG()); } catch {}
    clearTimeout(timeout); server.close(); app.exit(1);
  }
}
module.exports = { run };
