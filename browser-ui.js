import { sendChat, lastUserThought, recordBrowser, chatBusy } from './chat-ui.js';
import { getChatMode } from './mode-state.js';
const $ = selector => document.querySelector(selector);
const api = window.desktop;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
addEventListener('liquid-open-url',event=>enterBrowser(event.detail.url));
let state = null, inBrowser = false, transitioning = false, previousThought = '', currentId = null, currentUrl = '';
let motionTimer, thoughtTimer;
let addressDirty = false;
addEventListener('new-conversation',()=>{previousThought='';clearTimeout(thoughtTimer);$('#response').textContent='';});
const field = $('#message');
field.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('#composer').requestSubmit();}});
field.addEventListener('input', () => { addressDirty = true; });
field.addEventListener('blur', () => { if (inBrowser && !addressDirty) field.value = currentUrl; });
async function command(name, payload) {
  try {
    const result = await api.browser(name, payload);
    if (result?.ok === false) { $('#page-status').textContent = result.error; $('#response').textContent = result.error; }
    return result;
  } catch (error) { $('#page-status').textContent = error.message; return { ok: false }; }
}
function animateField(before) {
  const after = $('footer').getBoundingClientRect();
  if (reducedMotion) return;
  $('footer').animate([
    { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, 1)` },
    { transform: 'translate(0, 0) scale(1)' }
  ], { duration: 1150, easing: 'cubic-bezier(.22,.8,.2,1)', fill: 'none' });
}
async function enterBrowser(query = '') {
  if (transitioning) return;
  if (inBrowser) { if (query) await command('navigate', query); return; }
  transitioning = true;
  const result = await command('open', query);
  if (!result?.ok) { transitioning = false; return; }
  clearTimeout(thoughtTimer);
  const before = $('footer').getBoundingClientRect();
  inBrowser = true; document.body.classList.add('browser-mode', 'forming');
  $('#response').textContent = '';
  field.placeholder = 'Search Google or enter a website'; field.setAttribute('aria-label', 'Address and search bar');
  field.value = state?.tabs.find(tab => tab.id === state.active)?.url || query;
  if (query) field.blur();
  animateField(before);
  dispatchEvent(new CustomEvent('liquid-transform', { detail: { browser: true, duration: reducedMotion ? 0 : 1150 } }));
  clearTimeout(motionTimer);
  motionTimer = setTimeout(async () => {
    document.body.classList.remove('forming'); document.body.classList.add('browser-ready');
    transitioning = false;
    await command('ready');
    if (!query) { field.focus(); field.select(); }
  }, reducedMotion ? 20 : 1200);
}
async function leaveBrowser() {
  if (transitioning || !inBrowser) return;
  transitioning = true; clearTimeout(motionTimer);
  await command('home');
  const before = $('footer').getBoundingClientRect();
  document.body.classList.remove('browser-mode', 'browser-ready', 'forming', 'find-open');
  inBrowser = false; currentUrl = ''; currentId = null;
  field.value = ''; field.placeholder = getChatMode()==='codex'?'Describe code or files to create…':'Ask a question or discuss an idea…'; field.setAttribute('aria-label', 'Message or browser command');
  // Reverse FLIP preserves the original bottom alignment after the animation.
  const after = $('footer').getBoundingClientRect();
  if (!reducedMotion) $('footer').animate([{ transform: `translate3d(calc(-50% + ${before.left - after.left}px), ${before.top - after.top}px, 0) scale(${before.width / after.width}, 1)` }, { transform: 'translate3d(-50%,0,0)' }], { duration: 900, easing: 'cubic-bezier(.22,.8,.2,1)' });
  dispatchEvent(new CustomEvent('liquid-transform', { detail: { browser: false, duration: reducedMotion ? 0 : 900 } }));
  setTimeout(() => { transitioning = false; field.focus(); }, reducedMotion ? 20 : 950);
}
$('#composer').addEventListener('submit', async event => {
  event.preventDefault();
  if (transitioning) return;
  const value = field.value.trim(); if (!value) return field.focus();
  addressDirty = false;
  if (inBrowser) { await recordBrowser('Browser address/search: ' + value); const result = await command('navigate', value); field.blur(); if (result?.ok) field.value = state?.tabs.find(tab => tab.id === state.active)?.url || value; return; }
  const intent = await command('intent', { text: value, previous: previousThought || lastUserThought() });
  if (intent && 'query' in intent) { await recordBrowser(value); return enterBrowser(intent.query); }
  if (chatBusy()) { $('#chat-error').textContent = 'Wait for the reply or press Stop before sending another message.'; return; }
  previousThought = value;
  dispatchEvent(new Event('liquid-ripple'));
  field.value = '';
  await sendChat(value);
});
api.onBrowserState(next => {
  state = next;
  const active = next.tabs.find(tab => tab.id === next.active);
  const strip = $('#tab-strip');
  // Preserve tab buttons and keyboard focus while loading state changes.
  const signature = next.tabs.map(tab => `${tab.id}:${tab.title}:${tab.loading}:${tab.id === next.active}`).join('|');
  if (strip.dataset.signature !== signature) {
    strip.dataset.signature = signature; strip.replaceChildren();
    for (const tab of next.tabs) {
      const item = document.createElement('div'); item.className = 'tab' + (tab.id === next.active ? ' selected' : '');
      const button = document.createElement('button'); button.className = 'tab-select'; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(tab.id === next.active)); button.title = tab.title;
      const mark = document.createElement('span'); mark.className = tab.loading ? 'tab-mark spinning' : 'tab-mark'; mark.textContent = tab.loading ? '◌' : '◦';
      const title = document.createElement('span'); title.className = 'tab-title'; title.textContent = tab.title || 'New tab'; button.append(mark, title);
      button.addEventListener('click', () => command('select', tab.id));
      const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', `Close ${tab.title}`); close.addEventListener('click', () => command('close', tab.id));
      item.append(button, close); strip.append(item);
    }
  }
  if (active && inBrowser && (currentId !== active.id || (!addressDirty && currentUrl !== active.url))) field.value = active.url;
  currentId = active?.id; currentUrl = active?.url || '';
  $('#back').disabled = !next.back; $('#forward').disabled = !next.forward;
  $('#reload').textContent = active?.loading ? '×' : '↻'; $('#reload').setAttribute('aria-label', active?.loading ? 'Stop loading' : 'Reload');
  $('#browser-empty').classList.toggle('shown', !!active && !active.url);
  $('#browser-error').classList.toggle('shown', !!active?.error);
  $('#error-detail').textContent = active?.error || '';
  $('#connection').textContent = active?.url.startsWith('https:') ? '◇' : active?.url ? 'ⓘ' : '✧';
  $('#connection').title = active?.url.startsWith('https:') ? 'HTTPS connection' : active?.url ? 'HTTP — connection is not encrypted' : 'New tab';
  $('#page-status').textContent = next.notice || (active?.loading ? 'Loading…' : active?.error ? 'Page unavailable' : active?.url ? new URL(active.url).hostname : 'Ready to explore');
  $('#zoom-status').textContent = `${active?.zoom || 100}%`;
  $('#download-status').textContent = next.download ? `${next.download.state} · ${next.download.name}${next.download.state === 'Downloading' ? ` · ${next.download.percent}%` : ''}` : '';
  document.body.classList.toggle('page-loading', !!active?.loading);
  document.body.classList.toggle('find-open', next.findOpen);
});
api.onBrowserFocus(target => {
  if (target === 'open') enterBrowser();
  else if (target === 'home') leaveBrowser();
  else if (target === 'find') $('#find-input').focus();
  else { field.focus(); field.select(); }
});
api.onBrowserFind(result => { $('#find-count').textContent = `${result.current} / ${result.count}`; });
$('#liquid-home').addEventListener('click', leaveBrowser);
$('#new-tab').addEventListener('click', () => command('new'));
$('#back').addEventListener('click', () => command('back'));
$('#forward').addEventListener('click', () => command('forward'));
$('#reload').addEventListener('click', () => command(state?.tabs.find(tab => tab.id === state.active)?.loading ? 'stop' : 'reload'));
$('#retry').addEventListener('click', () => command('reload'));
document.querySelectorAll('[data-url]').forEach(button => button.addEventListener('click', () => command('navigate', button.dataset.url)));
async function showFind() { await command('find', !state?.findOpen); if (state?.findOpen) $('#find-input').focus(); }
$('#find-toggle').addEventListener('click', showFind);
$('#find-close').addEventListener('click', () => command('find', false));
$('#find-input').addEventListener('input', () => command('find-text', { text: $('#find-input').value }));
$('#find-input').addEventListener('keydown', event => { if (event.key === 'Enter') command('find-text', { text: event.target.value, next: true, forward: !event.shiftKey }); });
$('#find-prev').addEventListener('click', () => command('find-text', { text: $('#find-input').value, next: true, forward: false }));
$('#find-next').addEventListener('click', () => command('find-text', { text: $('#find-input').value, next: true, forward: true }));
$('#browser-menu').addEventListener('click', () => command('menu'));
command('state');
