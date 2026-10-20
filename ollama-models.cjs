const fs = require('node:fs');
const path = require('node:path');
const DEFAULT_MODEL = 'qwen2.5:3b';
const ENDPOINT = 'http://127.0.0.1:11434';
function validName(name) { return typeof name === 'string' && name.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(name); }
function cloudName(name) { return /(?::cloud|-cloud)$/.test(name); }
class OllamaModels {
  async capabilities(signal) {
    const name=this.selected.name;
    if(this.cached?.name===name)return this.cached.value;
    try {
      const response=await this.request(ENDPOINT+'/api/show',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:name}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Model capabilities unavailable.');
      const data=await response.json(),list=data.capabilities||[];
      const thinkingValues=Array.isArray(data.thinking?.values)?data.thinking.values:list.includes('thinking')?(name.startsWith('gpt-oss')?['low','medium','high']:[false,true]):[];
      const value={tools:list.includes('tools'),vision:list.includes('vision'),thinking:thinkingValues.some(value=>value!==false),thinkingValues};
      this.cached={name,value};return value;
    }catch{return {tools:false,vision:false,thinking:false,thinkingValues:[],unavailable:true};}
  }
  constructor(directory, { fetch: request = globalThis.fetch } = {}) {
    this.request = request; this.file = path.join(directory, 'chat-settings.json');
    this.selected = { name: DEFAULT_MODEL, cloud: false };
    try { const value = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (validName(value.name)) this.selected = { name: value.name, cloud: !!value.cloud || cloudName(value.name) }; } catch {}
  }
  async list() {
    try {
      const response = await this.request(ENDPOINT + '/api/tags', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error(`Ollama returned ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data.models)) throw Error('Ollama returned an invalid model list.');
      const models = data.models.filter(row => validName(row.name)).map(row => ({ name: row.name, cloud: !!row.remote_model || !!row.remote_host || cloudName(row.name) }));
      const known = models.find(row => row.name === this.selected.name);
      if (known) this.selected = { ...known };
      return { ok: true, online: true, models, selected: this.selected, ready: !!known || this.selected.cloud };
    } catch (error) { return { ok: true, online: false, models: [], selected: this.selected, ready: false, error: `Cannot list Ollama models. Start Ollama, then refresh. ${error.message}` }; }
  }
  async select(name) {
    if (!validName(name)) throw Error('Enter a valid Ollama model name.');
    const state = await this.list();
    if (!state.online) throw Error(state.error);
    const known = state.models.find(row => row.name === name);
    if (!known && !cloudName(name)) throw Error('Choose a downloaded model, or enter an Ollama cloud tag ending in :cloud or -cloud.');
    const selected = known || { name, cloud: true };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(selected, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
    this.selected = selected;
    return selected;
  }
}
module.exports = { OllamaModels, DEFAULT_MODEL, ENDPOINT };
