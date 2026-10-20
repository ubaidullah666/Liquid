import {getChatMode} from './mode-state.js';
const api=window.desktop;
const error=message=>{document.querySelector('#chat-error').textContent=message;};
const add=document.createElement('button');add.id='attach-files';add.type='button';add.textContent='+';add.title='Add files for the model to read';add.setAttribute('aria-label',add.title);document.querySelector('#composer').prepend(add);
const chips=document.createElement('div');chips.id='attachment-chips';document.querySelector('#composer').before(chips);
const controls=document.createElement('div');controls.id='assistant-tools';
controls.innerHTML=`<label><input id="use-web" type="checkbox"> Web search</label><label title="Requires a thinking-capable Ollama model"><input id="deep-thinking" type="checkbox"> Deep thinking</label><span id="thinking-availability"></span><button id="terminal-toggle" type="button" hidden>Terminal</button>`;
document.querySelector('#model-controls').before(controls);
const composer=document.querySelector('#composer'),actions=document.createElement('div');actions.id='composer-actions';
composer.append(actions);actions.append(controls,add,document.querySelector('#stop-answer'),document.querySelector('#send'));
add.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11v6a7 7 0 0 1-14 0V7a4 4 0 0 1 8 0v10a1 1 0 0 1-2 0V8"/></svg>';add.classList.add('attachment-button');
controls.querySelector('label:has(#use-web)').lastChild.textContent=' Search';
controls.querySelector('label:has(#deep-thinking)').lastChild.textContent=' DeepThink';
controls.prepend(controls.querySelector('label:has(#deep-thinking)'));
const terminal=document.createElement('section');terminal.id='codex-terminal';terminal.hidden=true;terminal.setAttribute('aria-label','Codex PowerShell terminal');
terminal.innerHTML=`<div class="terminal-head"><strong>PowerShell</strong><span id="terminal-cwd"></span><button id="terminal-hide" type="button">Hide</button></div><label class="terminal-permission"><input id="allow-model-terminal" type="checkbox"> Allow model terminal commands</label><p>Commands run with your Windows account. Model commands require a tool-capable model and a project folder.</p><pre id="terminal-output" role="log" aria-live="polite"></pre><form id="terminal-form"><input id="terminal-command" aria-label="PowerShell command" placeholder="Enter a command…" maxlength="12000" autocomplete="off"><button type="submit" id="terminal-run">Run</button><button id="terminal-stop" type="button" hidden>Stop</button></form><div id="terminal-status" role="status"></div>`;
document.body.append(terminal);
const web=controls.querySelector('#use-web'),deep=controls.querySelector('#deep-thinking'),allow=terminal.querySelector('#allow-model-terminal');
const toggle=controls.querySelector('#terminal-toggle'),output=terminal.querySelector('#terminal-output');
let busy=false,loading=false,terminalBusy=false,prefs={web:false,deep:false,terminalAccess:false},caps={},revision=0;
function pending(rows){chips.replaceChildren();for(const row of rows){const chip=document.createElement('button');chip.type='button';chip.textContent=row.name+(row.truncated?' (excerpt)':'')+' ×';chip.title='Remove attachment';chip.disabled=busy;chip.onclick=()=>api.chat('remove-attachment',row.id);chips.append(chip);}}
function enabled(){add.disabled=busy||loading;web.disabled=busy||loading;deep.disabled=busy||loading||!caps.thinking;allow.disabled=busy||loading||!caps.tools;toggle.hidden=getChatMode()!=='codex';if(toggle.hidden)terminal.hidden=true;terminal.querySelector('#terminal-run').disabled=busy||terminalBusy;terminal.querySelector('#terminal-stop').hidden=!terminalBusy;terminal.querySelector('#terminal-command').disabled=busy||terminalBusy;}
async function refresh(){const request=++revision;try{const state=await api.chat('features');if(request!==revision)return;if(!state.ok)throw Error(state.error);prefs=state.options;caps=state.capabilities;web.checked=prefs.web;deep.checked=prefs.deep;allow.checked=prefs.terminalAccess;pending(state.attachments);controls.querySelector('#thinking-availability').textContent=caps.thinking?'':'Thinking unavailable for this model';if(state.terminal){output.textContent=state.terminal.output;terminalBusy=state.terminal.busy;terminal.querySelector('#terminal-cwd').textContent=state.terminal.cwd||'Choose a project folder';}enabled();}catch(e){error(e.message);}}
async function option(key,value){loading=true;enabled();try{const result=await api.chat('set-options',{[key]:value});if(!result.ok)throw Error(result.error);prefs=result.options;}catch(e){error(e.message);}finally{loading=false;web.checked=prefs.web;deep.checked=prefs.deep;allow.checked=prefs.terminalAccess;enabled();}}
web.onchange=()=>option('web',web.checked);deep.onchange=()=>option('deep',deep.checked);allow.onchange=()=>option('terminalAccess',allow.checked);
add.onclick=async()=>{loading=true;enabled();try{const result=await api.chat('attach-files');if(!result.ok)throw Error(result.error);if(result.errors?.length)error(result.errors.join('\n'));}catch(e){error(e.message);}finally{loading=false;enabled();}};
toggle.onclick=()=>{terminal.hidden=!terminal.hidden;if(!terminal.hidden){refresh();terminal.querySelector('#terminal-command').focus();}};
terminal.querySelector('#terminal-hide').onclick=()=>{terminal.hidden=true;};
terminal.querySelector('#terminal-form').onsubmit=async event=>{event.preventDefault();if(busy||terminalBusy)return;const command=terminal.querySelector('#terminal-command').value.trim();if(!command)return;terminalBusy=true;enabled();try{const result=await api.chat('terminal-run',command);if(!result.ok)throw Error(result.error);terminal.querySelector('#terminal-command').value='';}catch(e){terminal.querySelector('#terminal-status').textContent=e.message;}finally{terminalBusy=false;enabled();}};
terminal.querySelector('#terminal-stop').onclick=()=>api.chat('terminal-stop');
api.onChat(event=>{
  if(event.type==='attachments')pending(event.attachments);
  if(event.type==='model'||event.type==='mode'||event.type==='workspace')refresh();
  if(event.type==='options'){prefs=event.options;web.checked=prefs.web;deep.checked=prefs.deep;allow.checked=prefs.terminalAccess;}
  if(event.type==='busy'){busy=event.busy;enabled();}
  if(event.type==='terminal'){
    if(event.action==='reset'){output.textContent='';terminalBusy=false;}
    if(event.action==='start'){terminalBusy=true;output.textContent+=`\n${event.source==='model'?'MODEL':'YOU'} > ${event.command}\n`;terminal.hidden=false;}
    if(event.action==='output')output.textContent=(output.textContent+event.text).slice(-128000);
    if(event.action==='done'){terminalBusy=false;output.textContent=event.log;terminal.querySelector('#terminal-status').textContent=`${event.status} · exit ${event.exitCode}${event.error?' · '+event.error:''}`;}
    if(event.cwd)terminal.querySelector('#terminal-cwd').textContent=event.cwd;
    output.scrollTop=output.scrollHeight;enabled();
  }
});
addEventListener('new-conversation',refresh);
const updateComposerSpace=()=>{const footer=document.querySelector('footer');if(!document.body.classList.contains('browser-mode'))document.documentElement.style.setProperty('--composer-space',`${innerHeight-footer.offsetTop+15}px`);};
const observer=new ResizeObserver(updateComposerSpace);observer.observe(document.querySelector('footer'));
new MutationObserver(updateComposerSpace).observe(document.body,{attributes:true,attributeFilter:['class']});
addEventListener('resize',updateComposerSpace);
refresh();
