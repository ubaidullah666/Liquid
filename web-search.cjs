const {ENDPOINT}=require('./ollama-models.cjs');
async function searchWeb(query,{fetch:request=globalThis.fetch,signal}={}) {
  if(typeof query!=='string'||!query.trim()||query.length>2000)throw Error('Use a web query up to 2,000 characters.');
  const response=await request(ENDPOINT+'/api/experimental/web_search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,max_results:5}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  if(!response.ok)throw Error([401,403].includes(response.status)?'Web search needs Ollama sign-in. Run ollama signin first.':response.status===404?'Update Ollama to use its web-search service.':`Web search failed (${response.status}).`);
  const data=await response.json();
  if(!Array.isArray(data.results))throw Error('Web search returned an invalid response.');
  return data.results.filter(row=>{try{return ['http:','https:'].includes(new URL(row.url).protocol);}catch{return false;}}).slice(0,5).map(row=>({title:String(row.title||row.url).slice(0,300),url:row.url,content:String(row.content||'').slice(0,3000)}));
}
module.exports={searchWeb};
