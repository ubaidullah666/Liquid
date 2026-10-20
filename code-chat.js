import { codeParts, normalizeLanguage, sourceFilename } from './code-output.js';
import { getChatMode } from './mode-state.js';
const drafts = new Map();
const filenames = new Map();
const executions = new Map();
const failures = new Map();
const api = window.desktop;
export function codeExecution(event) {
  const key = `${event.id}:${event.index}`;
  if (event.running) executions.set(key, true); else executions.delete(key);
}
export function renderMessageContent(container, row) {
  container.replaceChildren();
  if(getChatMode()!=='codex') {container.textContent=row.content||(row.status==='streaming'?'Thinking…':'');return;}
  const parts = row.role === 'assistant' ? codeParts(row.content, row.kind === 'code' ? row.language || 'text' : '') : [{ type: 'text', content: row.content }];
  let index = 0;
  for (const part of parts) {
    if (part.type !== 'code') {
      const text = document.createElement('span'); text.textContent = part.content; container.append(text); continue;
    }
    const blockIndex = index++, key = `${row.id}:${blockIndex}`, language = normalizeLanguage(part.language);
    const block = document.createElement('section'); block.className = 'chat-code';
    const toolbar = document.createElement('div'); toolbar.className = 'chat-code-toolbar';
    const name = document.createElement('span'); name.textContent = part.language; toolbar.append(name);
    const editor = document.createElement('textarea'); editor.className = 'chat-code-editor'; editor.spellcheck = false;
    editor.setAttribute('aria-label', `${part.language} source code`);
    editor.value = drafts.get(key) ?? row.codeRuns?.[blockIndex]?.source ?? part.content;
    editor.readOnly = row.status === 'streaming' || executions.has(key);
    editor.rows = Math.min(18, Math.max(4, editor.value.split('\n').length));
    editor.oninput = () => drafts.set(key, editor.value);
    editor.onkeydown = event => { if (event.key === 'Tab' && !editor.readOnly) { event.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); drafts.set(key, editor.value); } };
    const status = document.createElement('div'); status.className = 'code-block-status'; status.setAttribute('role', 'status');
    const output = document.createElement('pre'); output.className = 'code-run-output';
    const previous = row.codeRuns?.[blockIndex];
    if (previous) { output.textContent = previous.output || previous.error || '(No output)'; status.textContent = `Last run: ${previous.status}${previous.exitCode !== null ? ` · exit ${previous.exitCode}` : ''}`; }
    else output.hidden = true;
    if (failures.has(key)) { output.hidden = false; output.textContent = failures.get(key); status.textContent = 'Could not run code.'; }
    const button = (label, handler) => {
      const control = document.createElement('button'); control.type = 'button'; control.textContent = label;
      if(label==='Run')control.className='primary-action';
      control.disabled = row.status === 'streaming' || executions.has(key);
      control.onclick = handler; toolbar.append(control); return control;
    };
    for (const action of ['copy', 'save','download']) button(action === 'copy' ? 'Copy' : action==='save'?'Save…':'Download', async () => {
      try {
        const result = await api.chat(`${action}-code`, { content: editor.value, filename: filenames.get(key)||part.filename || sourceFilename(language) });
        status.textContent = !result.ok ? result.error : result.canceled ? 'Save canceled.' : action === 'copy' ? 'Copied.' : `Saved ${result.filename}.`;
      } catch (error) { status.textContent = error.message; }
    });
    const filename=document.createElement('input');filename.className='code-filename';filename.setAttribute('aria-label','Project filename');filename.value=filenames.get(key)||part.filename||sourceFilename(language);filename.placeholder='src/main.py';filename.maxLength=240;filename.disabled=row.status==='streaming';filename.oninput=()=>filenames.set(key,filename.value);toolbar.append(filename);
    button('Create file',async()=>{
      try{
        const result=await api.chat('create-file',{id:row.id,index:blockIndex,filename:filename.value,content:editor.value});
        status.textContent=result.ok?`Created ${result.filename}`:result.error;
      }catch(error){status.textContent=error.message;}
    });
    const preview = async () => {
      const files=parts.filter(part=>part.type==='code').map((part,index)=>({filename:filenames.get(`${row.id}:${index}`)||part.filename||sourceFilename(part.language),content:drafts.get(`${row.id}:${index}`)??part.content}));
      const page=files.find(file=>/\.html?$/i.test(file.filename));
      try{const result=await api.chat('preview-code',{content:page?.content||'',files});if(result.ok){dispatchEvent(new CustomEvent('liquid-open-url',{detail:{url:result.url}}));status.textContent='Opened in Liquid browser.';}else status.textContent=result.error;}catch(error){status.textContent=error.message;}
    };
    if(['javascript','css','ts','jsx','tsx'].includes(language))button('Preview',preview);
    if (['python', 'javascript'].includes(language)) {
      const run = button('Run', async () => {
        failures.delete(key);
        drafts.set(key, editor.value); executions.set(key, true); editor.readOnly = true; run.disabled = true;
        stop.hidden = false; status.textContent = 'Running…'; output.hidden = false; output.textContent = '';
        try {
          const result = await api.chat('run-code', { id: row.id, index: blockIndex, content: editor.value });
          if (!result.ok) failures.set(key, result.error);
        } catch (error) { failures.set(key, error.message); }
        finally { executions.delete(key); dispatchEvent(new CustomEvent('code-feedback', {detail: {id: row.id}})); }
      });
      const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop'; stop.hidden = !executions.has(key);
      stop.onclick = () => api.chat('stop-code'); toolbar.append(stop);
      const note = document.createElement('small'); note.textContent = 'Runs locally with your Windows account. Use code you trust. Stops after 15 seconds.'; block.append(note);
      if (executions.has(key)) { status.textContent = 'Running…'; output.hidden = false; }
    } else if (language === 'html') {
      button('Run', preview);
      button('Preview', preview);
    } else { const hint = document.createElement('small'); hint.textContent = 'Edit, copy, or save this language. Run supports Python and JavaScript; HTML supports Preview.'; block.append(hint); }
    block.prepend(toolbar, editor); block.append(status, output); container.append(block);
  }
  if (!row.content) container.textContent = row.status === 'streaming' ? 'Thinking…' : '';
}
