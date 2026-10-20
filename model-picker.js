const api = window.desktop;
let selected = {name:'qwen2.5:3b',cloud:false}, busy = false, updating = false, online = false;
const panel = document.createElement('div'); panel.id = 'model-controls';
panel.innerHTML = `<div class="model-picker-row"><label for="ollama-model">Model</label><select id="ollama-model" aria-label="Ollama model"></select><button id="model-refresh" type="button" title="Refresh downloaded Ollama models">Refresh</button><details id="cloud-model-options"><summary>Cloud model</summary><div class="cloud-model-panel"><p>Sign in to Ollama using <code>ollama signin</code>. Enter a cloud model tag, such as <code>gpt-oss:120b-cloud</code>.</p><div><input id="cloud-model-name" aria-label="Ollama cloud model tag" placeholder="model:cloud" maxlength="200"><button id="cloud-model-use" type="button">Use model</button></div><p>Cloud requests include your message, relevant history and calendar context.</p></div></details></div><div id="model-notice" role="status" aria-live="polite"></div>`;
document.querySelector('footer .hint').replaceWith(panel);
const picker = panel.querySelector('select'), notice = panel.querySelector('#model-notice');
function controls() { picker.disabled = busy || updating || !online; panel.querySelector('#model-refresh').disabled = busy || updating; panel.querySelector('#cloud-model-use').disabled = busy || updating || !online; }
export function modelLabel() { return `${selected.name} · ${selected.cloud ? 'CLOUD' : 'LOCAL'}`; }
function updateLabel(thinking = busy) {
  const status = document.querySelector('#model-status');
  if (status) status.textContent = modelLabel() + (thinking ? ' · THINKING' : !online ? ' · OLLAMA OFFLINE' : '');
  notice.textContent = selected.cloud ? 'Cloud model · Messages and conversation context are sent to Ollama Cloud.' : 'Local model · Inference runs on this computer.';
}
async function refresh() {
  updating = true; controls();
  try {
    const state = await api.chat('models');
    if (!state.ok) throw Error(state.error);
    selected = state.selected; online = state.online; picker.replaceChildren();
    const rows = [...state.models];
    if (!rows.some(row=>row.name===selected.name)) rows.push({...selected, missing: !selected.cloud});
    for (const cloud of [false, true]) {
      const group = document.createElement('optgroup'); group.label = cloud ? 'Ollama cloud' : 'Downloaded locally';
      for (const row of rows.filter(row=>row.cloud===cloud)) {
        const option = document.createElement('option'); option.value=row.name; option.textContent=row.name+(row.missing?' (not downloaded)':''); group.append(option);
      }
      if(group.children.length) picker.append(group);
    }
    picker.value=selected.name; updateLabel();
    if (!state.online) notice.textContent=state.error;
    else if (!state.ready) notice.textContent='Selected model is not downloaded. Choose an available model.';
  } catch(error) { notice.textContent=error.message; }
  finally { updating=false; controls(); }
}
async function select(name) {
  updating=true; controls();
  try {
    const result=await api.chat('select-model',name);
    if(!result.ok) throw Error(result.error);
    selected=result.selected;
    panel.querySelector('#cloud-model-options').open=false;
    await refresh();
  } catch(error) { picker.value=selected.name; notice.textContent=error.message; }
  finally { updating=false; controls(); }
}
picker.onchange=()=>select(picker.value);
panel.querySelector('#model-refresh').onclick=refresh;
panel.querySelector('#cloud-model-use').onclick=()=>select(panel.querySelector('#cloud-model-name').value.trim());
panel.querySelector('#cloud-model-name').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();if(!busy&&!updating&&online)select(event.target.value.trim());}};
api.onChat(event=>{
  if(event.type==='model'||event.type==='busy') {
    if(event.model) selected={name:event.model,cloud:!!event.cloud};
    if(event.type==='busy') busy=event.busy;
    updateLabel(); controls();
  }
});
refresh();
