const {ENDPOINT}=require('./ollama-models.cjs');
async function streamReply({selected,messages,tools=[],think,fallbackThink=false,deep=false,codex=false,signal,fetch:request=globalThis.fetch,onContent=()=>{},onThinking=()=>{},onActivity=()=>{},onTool=()=>{},runTool=async()=>{throw Error('Tool unavailable.');}}) {
  let continuations=0,emptyRetries=0,toolRounds=0;
  for(let round=0;round<12;round++) {
    if(signal.aborted)throw Error('Request canceled.');
    const response=await request(ENDPOINT+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model:selected.name,stream:true,keep_alive:'10m',messages,...(tools.length&&toolRounds<6?{tools}:{}),...(think!==undefined?{think}:{}),options:{num_ctx:12288,num_predict:codex||deep?8192:4096,temperature:codex?.2:.65}})});
    if(!response.ok) {
      const message=await response.text();
      throw Error([401,403].includes(response.status)&&selected.cloud?'Ollama cloud access was denied. Sign in with ollama signin and check your cloud access.':response.status===404?`${selected.name} is unavailable. Choose another model or check its Ollama tag.`:`Ollama returned ${response.status}: ${message.slice(0,200)}`);
    }
    const decoder=new TextDecoder();let buffer='',done=false,reason='',content='',thinking='';const calls=new Map();
    function consume(line) {
      if(!line.trim())return;const part=JSON.parse(line);if(part.error)throw Error(part.error);
      if(part.message?.thinking){thinking+=part.message.thinking;onThinking(part.message.thinking.length);}
      if(part.message?.content){content+=part.message.content;onContent(part.message.content);}
      for(const [position,call] of (part.message?.tool_calls||[]).entries()) {
        const index=call.function?.index??call.index??position,previous=calls.get(index);
        if(previous&&typeof call.function?.arguments==='string'&&typeof previous.function.arguments==='string')previous.function.arguments+=call.function.arguments;
        else calls.set(index,call);
      }
      if(part.done){done=true;reason=part.done_reason||'';}
    }
    for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});let split;while((split=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,split));buffer=buffer.slice(split+1);}}
    buffer+=decoder.decode();if(buffer.trim())consume(buffer);
    if(!done)throw Error('The Ollama connection ended before the answer completed.');
    if(!calls.size) {
      if(!content.trim()) {
        if(emptyRetries++>=1)throw Error('The model returned no answer after retrying. Try another model or turn off Deep thinking.');
        think=fallbackThink;onActivity('Preparing an answer from the available information…');
        messages.push({role:'user',content:'Return a visible final answer now using the information already provided. Do not perform additional searches or return only thinking.'});
        tools=[];continue;
      }
      if(reason==='length') {
        if(continuations++>=3)throw Error('The response is still incomplete after three continuations. Ask to continue from the last line.');
        messages.push({role:'assistant',content},{role:'user',content:'Continue exactly from the last character of your previous answer. Do not repeat previous content or restart a code fence that is already open. Finish all remaining code and close any open code fence.'});
        onActivity('Continuing the answer after the model output limit…');continue;
      }
      return;
    }
    if(reason==='length')throw Error('The model cut off a tool request before completion. Ask it to create a smaller file.');
    if(toolRounds++===6)throw Error('The model exceeded the six-round tool limit. Ask it to continue with a smaller task.');
    const toolCalls=[...calls.values()];messages.push({role:'assistant',content,...(thinking?{thinking}:{}),tool_calls:toolCalls});
    for(const [index,call] of toolCalls.entries()) {
      if(signal.aborted)throw Error('Request canceled.');
      const name=call.function?.name;
      let result;
      try {
        if(index>=6)throw Error('Only six tools may run per round. Use the existing results.');
        if(!tools.some(tool=>tool.function.name===name))throw Error('This tool is not enabled.');
        const args=typeof call.function.arguments==='string'?JSON.parse(call.function.arguments):call.function.arguments||{};
        onTool({name,status:'running',arguments:args});result=await runTool(name,args);onTool({name,status:'complete',result});
      }catch(error){if(signal.aborted)throw error;result={error:error.message};onTool({name,status:'error',result});}
      messages.push({role:'tool',tool_name:name,content:JSON.stringify(result).slice(0,12000)});
    }
    if(content)onContent('\n\n');
    if(toolRounds===6)messages.push({role:'user',content:'Tool limit reached. Summarize the actual results now without making further tool calls.'});
  }
  throw Error('The response reached its request limit. Ask to continue from the last result.');
}
function tool(name,description,properties,required){return {type:'function',function:{name,description,parameters:{type:'object',properties,required}}};}
module.exports={streamReply,tool};
