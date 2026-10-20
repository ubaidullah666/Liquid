import { renderMessageContent, codeExecution } from './code-chat.js';
import { modelLabel } from './model-picker.js';
import { getChatMode, setChatMode } from './mode-state.js';
import './feature-controls.js';
const api = window.desktop;
const $ = selector => document.querySelector(selector);
const records = new Map();
addEventListener('code-feedback', event => { const row = records.get(event.detail.id); if (row) upsert(row, false); });
let busy = false, more = false, filter = '';
const thread = $('#chat-messages');
const newChat = document.createElement('button'); newChat.id='new-chat'; newChat.textContent='New chat';
$('#history-toggle').before(newChat);
const modePicker=document.createElement('div');modePicker.id='chat-mode-picker';modePicker.setAttribute('role','group');modePicker.setAttribute('aria-label','Conversation mode');
for(const mode of ['chat','codex']) {
  const button=document.createElement('button');button.type='button';button.textContent=mode==='chat'?'Chat':'Codex';button.dataset.mode=mode;
  button.onclick=async()=>{const result=await api.chat('set-mode',mode);if(!result.ok)$('#chat-error').textContent=result.error;};modePicker.append(button);
}
newChat.after(modePicker);
const workspace=document.createElement('div');workspace.id='codex-workspace';workspace.hidden=true;
const chooseFolder=document.createElement('button');chooseFolder.type='button';chooseFolder.textContent='Project folder…';
const folderLabel=document.createElement('span');folderLabel.textContent='Choose where Codex creates files';workspace.append(chooseFolder,folderLabel);$('#model-controls').append(workspace);
chooseFolder.onclick=async()=>{const result=await api.chat('choose-workspace');if(!result.ok)$('#chat-error').textContent=result.error;else if(result.workspace)folderLabel.textContent=result.workspace;};
const previewProject=document.createElement('button');previewProject.type='button';previewProject.textContent='Preview project';workspace.append(previewProject);
previewProject.onclick=async()=>{const result=await api.chat('preview-code',{project:true});if(result.ok)dispatchEvent(new CustomEvent('liquid-open-url',{detail:{url:result.url}}));else $('#chat-error').textContent=result.error;};
function updateMode(mode) {
  setChatMode(mode);workspace.hidden=mode!=='codex';document.body.classList.toggle('codex-mode',mode==='codex');
  for(const button of modePicker.children)button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  if(!document.body.classList.contains('browser-mode'))$('#message').placeholder=mode==='codex'?'Describe code or files to create…':'Ask a question or discuss an idea…';
}
const sessionPicker=document.createElement('select'); sessionPicker.id='chat-sessions';sessionPicker.setAttribute('aria-label','Saved conversations');
$('#history-search').before(sessionPicker);
const historyActions=document.createElement('div');historyActions.id='history-actions';
const clearChat=document.createElement('button');clearChat.type='button';clearChat.textContent='Clear chat';clearChat.id='clear-chat';$('#chat-heading').append(clearChat);
async function deleteHistory(command,payload){const result=await api.chat(command,payload);if(!result.ok){$('#chat-error').textContent=result.error;return;}await loadCurrent();await loadSessions();dispatchEvent(new Event('new-conversation'));}
clearChat.onclick=()=>{if(confirm('Delete this conversation and its saved messages?'))deleteHistory('clear-chat');};
for(const [label,command]of [['Delete conversation','delete-session'],['Delete all history','delete-history']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{const id=sessionPicker.value;if(command==='delete-session'&&!id){$('#chat-error').textContent='Choose a saved conversation first.';return;}if(confirm(command==='delete-history'?'Delete all Chat and Codex history in this profile?':'Delete the selected conversation?'))deleteHistory(command,id);};historyActions.append(button);}
sessionPicker.after(historyActions);
let revision=0;
async function loadCurrent() {
  const request=++revision;
  const result=await api.chat('current',{limit:80});
  if(request!==revision || !result.ok)return;
  records.clear(); result.records.forEach(row=>records.set(row.id,row));more=result.more;busy=result.busy;filter='';$('#history-search').value='';$('#chat-error').textContent='';render();thread.scrollTop=thread.scrollHeight;
}
async function loadSessions() {
  const result=await api.chat('sessions');if(!result.ok)return;
  sessionPicker.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a saved conversation';sessionPicker.append(placeholder);
  for(const session of result.sessions){const option=document.createElement('option');option.value=session.id;option.textContent=new Date(session.time).toLocaleDateString()+' · '+session.title;sessionPicker.append(option);}
  sessionPicker.value=result.sessions.some(s=>s.id===result.sessionId)?result.sessionId:'';
}
newChat.addEventListener('click',async()=>{
  const result=await api.chat('new');if(!result.ok){$('#chat-error').textContent=result.error;return;}
  clearTimeout(searchTimer);document.body.classList.remove('history-open');await loadCurrent();
  dispatchEvent(new Event('new-conversation'));$('#message').value='';$('#message').focus();
});
sessionPicker.addEventListener('change',async()=>{
  if(!sessionPicker.value)return;
  const result=await api.chat('select-session',sessionPicker.value);if(!result.ok){$('#chat-error').textContent=result.error;await loadSessions();return;}
  clearTimeout(searchTimer);await loadCurrent();dispatchEvent(new Event('new-conversation'));$('#message').value='';
});
const activity = row => row.kind === 'browser';
function setMode() {
  const hasChat = records.size > 0;
  document.body.classList.toggle('has-chat', hasChat);
  dispatchEvent(new CustomEvent('liquid-chat', { detail: { active: hasChat || document.body.classList.contains('history-open'), busy } }));
}
function messageNode(row) {
  const article = document.createElement('article'); article.className = 'chat-message ' + row.role + (activity(row) ? ' activity' : ''); article.dataset.id = row.id;
  const meta = document.createElement('div'); meta.className = 'message-meta';
  const author = document.createElement('span'); author.textContent = activity(row) ? 'BROWSER REQUEST' : row.role === 'user' ? 'YOU' : (row.model || 'ASSISTANT') + (row.cloud ? ' · CLOUD' : '');
  const time = document.createElement('time'); time.textContent = new Date(row.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); time.dateTime = row.time;
  meta.append(author, time);
  const content = document.createElement('div'); content.className = 'message-content'; renderMessageContent(content, row);
  const status = document.createElement('div'); status.className = 'message-status'; status.textContent = row.error || (row.status === 'stopped' ? 'Stopped' : '');
  const supplements=[];
  if(row.attachments?.length){const files=document.createElement('div');files.className='message-files';files.textContent='Attached: '+row.attachments.map(file=>file.name).join(', ');content.append(files);}
  if(row.sources?.length){const sources=document.createElement('div');sources.className='message-sources';sources.append(document.createTextNode('Sources: '));for(const source of row.sources){const link=document.createElement('a');link.textContent=source.title;link.href=source.url;link.onclick=event=>{event.preventDefault();dispatchEvent(new CustomEvent('liquid-open-url',{detail:{url:source.url}}));};sources.append(link);}supplements.push(sources);}
  if(row.tools?.length){const details=document.createElement('details');details.className='message-tools';const summary=document.createElement('summary');summary.textContent='Model tools';const body=document.createElement('pre');body.textContent=row.tools.map(tool=>`${tool.name}: ${tool.status}\n${JSON.stringify(tool.result||tool.arguments||{}).slice(0,6000)}`).join('\n');details.append(summary,body);supplements.push(details);}
  article.append(meta, content,...supplements, status); return article;
}
function render() {
  thread.replaceChildren();
  if (more && !filter) { const older = document.createElement('button'); older.className = 'load-history'; older.textContent = 'Load earlier messages'; older.addEventListener('click', loadOlder); thread.append(older); }
  for (const row of records.values()) { if (!filter || row.content.toLowerCase().includes(filter)) thread.append(messageNode(row)); }
  setMode();
}
function upsert(record, scroll = true) {
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 110;
  records.set(record.id, record);
  const existing = [...thread.children].find(node => node.dataset.id === record.id);
  if (existing) existing.replaceWith(messageNode(record)); else thread.append(messageNode(record));
  setMode(); if (scroll && nearBottom) thread.scrollTop = thread.scrollHeight;
}
async function loadOlder() {
  const first = records.keys().next().value;
  const request=revision;
  const result = await api.chat('current', { before: first, limit: 80 });
  if(request!==revision)return;
  if (!result.ok) return;
  const old = [...records.values()]; records.clear();
  for (const row of [...result.records, ...old]) records.set(row.id, row);
  more = result.more; const oldHeight = thread.scrollHeight; render(); thread.scrollTop = thread.scrollHeight - oldHeight;
}
export async function sendChat(text) {
  if (busy) return;
  if (filter) await loadCurrent();
  $('#chat-error').textContent = '';
  const result = await api.chat('send', text);
  if (!result.ok) $('#chat-error').textContent = result.error;
  return result;
}
export function lastUserThought() { return [...records.values()].reverse().find(row => row.role === 'user' && row.kind !== 'browser')?.content || ''; }
export async function recordBrowser(text) { return api.chat('activity', text); }
export function chatBusy() { return busy; }
api.onChat(event => {
  if(event.type==='activity'){$('#state').textContent=event.message;for(const node of thread.querySelectorAll('.chat-message.assistant')){const row=records.get(node.dataset.id);if(row?.status==='streaming')node.querySelector('.message-status').textContent=event.message;}}
  if(event.type==='thinking'){const row=records.get(event.id);if(row){row.thinkingCharacters=(row.thinkingCharacters||0)+1;const node=[...thread.children].find(node=>node.dataset.id===event.id);if(node)node.querySelector('.message-status').textContent='Deep thinking…';}}
  if(event.type==='sources'||event.type==='tool'){const row=records.get(event.id);if(row){if(event.type==='sources')row.sources=event.sources;else row.tools=[...(row.tools||[]),event];upsert(row,false);}}
  if(event.type==='mode') {
    updateMode(event.mode);folderLabel.textContent=event.workspace||'Choose where Codex creates files';
    clearTimeout(searchTimer);loadCurrent();if(document.body.classList.contains('history-open'))loadSessions();dispatchEvent(new Event('new-conversation'));$('#message').value='';
  }
  if(event.type==='workspace')folderLabel.textContent=event.workspace;
  if (event.type === 'code-running') {
    codeExecution(event);
    const row = records.get(event.id);
    if (row) upsert(row, false);
  }
  if (event.type === 'record') upsert(event.record);
  if (event.type === 'delta') {
    const row = records.get(event.id); if (!row) return;
    row.content += event.text;
    const node = [...thread.children].find(node => node.dataset.id === row.id);
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 110;
    if (node) {renderMessageContent(node.querySelector('.message-content'), row);node.querySelector('.message-status').textContent='Writing answer…';}
    if (nearBottom) thread.scrollTop = thread.scrollHeight;
  }
  if (event.type === 'busy') {
    busy = event.busy; $('#stop-answer').hidden = !busy;
    for(const button of modePicker.children)button.disabled=busy;
    $('#state').textContent = busy ? 'A thought taking shape' : modelLabel();
    document.body.classList.toggle('chat-busy', busy); setMode();
  }
  if (event.type === 'error') $('#chat-error').textContent = event.message;
});
$('#stop-answer').addEventListener('click', () => api.chat('stop'));
$('#history-toggle').addEventListener('click', async () => {
  document.body.classList.toggle('history-open');
  setMode();
  if (document.body.classList.contains('history-open')) {await loadSessions();$('#history-search').focus();}
  else {clearTimeout(searchTimer);await loadCurrent();}
});
let searchTimer;
$('#history-search').addEventListener('input', event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const request=++revision;
    filter = event.target.value.toLowerCase();
    const result = await api.chat('history', { query: filter, limit: 200 });
    if(request!==revision)return;
    if (result.ok) { records.clear(); result.records.forEach(row => records.set(row.id, row)); more = result.more; render(); }
  }, 200);
});
const history = await api.chat('current', { limit: 80 });
updateMode(history.mode||'chat');
if (history.ok) { history.records.forEach(row => records.set(row.id, row)); more = history.more; busy = history.busy; render(); thread.scrollTop = thread.scrollHeight; $('#history-toggle').title = 'Open a saved conversation or search all history'; }
