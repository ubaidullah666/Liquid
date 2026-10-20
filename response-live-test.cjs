const {searchWeb}=require('./web-search.cjs');
const {streamReply}=require('./ollama-agent.cjs');
async function main(){
  const sources=await searchWeb('Ollama official documentation');
  let answer='';
  await streamReply({selected:{name:'qwen2.5:3b',cloud:false},messages:[{role:'system',content:'Answer briefly from these web results and include a source URL. Search has already completed. '+JSON.stringify(sources.map(row=>({...row,content:row.content.slice(0,1200)})))},{role:'user',content:'Where can I read the official Ollama documentation?'}],signal:AbortSignal.timeout(180000),onContent:text=>answer+=text});
  if(!answer.trim())throw Error('Empty local web answer');
  console.log(JSON.stringify({model:'qwen2.5:3b',sourceCount:sources.length,answer}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
