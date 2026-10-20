const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {readAttachment,attachmentContext}=require('./attachments.cjs');
const {searchWeb}=require('./web-search.cjs');
const {createTerminal}=require('./terminal-engine.cjs');
const {previewDocument}=require('./preview-engine.cjs');
const {streamReply}=require('./ollama-agent.cjs');
test('browser previews serve generated assets and built projects without outside files',async t=>{
  const {createWebPreview}=require('./preview-engine.cjs');
  const generated=await createWebPreview('<link href="style.css"><h1>Hello</h1>',[{filename:'style.css',content:'h1{color:red}'}]);t.after(()=>generated.close());
  assert.match(await (await fetch(generated.url)).text(),/Hello/);
  assert.match(await (await fetch(new URL('style.css',generated.url))).text(),/color:red/);
  assert.equal((await fetch(new URL('/private',generated.url))).status,404);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'liquid-web-project-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'dist'));await fs.writeFile(path.join(root,'dist','index.html'),'<script src="/app.js"></script>');await fs.writeFile(path.join(root,'dist','app.js'),'console.log(42)');
  const project=await createWebPreview('',[],root);t.after(()=>project.close());const html=await(await fetch(project.url)).text();assert.match(html,/src="\/[a-f0-9-]+\/app.js/);assert.match(await(await fetch(new URL('app.js',project.url))).text(),/42/);
});
test('reads text, image, DOCX and PDF attachments and bounds excerpts',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'liquid-attachments-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const textFile=path.join(root,'notes.txt');await fs.writeFile(textFile,'attached information');
  assert.equal((await readAttachment(textFile)).text,'attached information');
  const binary=path.join(root,'app.exe');await fs.writeFile(binary,Buffer.from([0,1,2]));await assert.rejects(readAttachment(binary),/binary/);
  const image=path.join(root,'one.png');await fs.writeFile(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=','base64'));assert.ok((await readAttachment(image)).image);
  const zip=new (require('jszip'))();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from DOCX</w:t></w:r></w:p></w:body></w:document>');
  const docx=path.join(root,'notes.docx');await fs.writeFile(docx,await zip.generateAsync({type:'nodebuffer'}));assert.match((await readAttachment(docx)).text,/Hello from DOCX/);
  const stream='BT /F1 12 Tf 20 100 Td (Hello from PDF) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];let pdf='%PDF-1.4\n',offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF`;
  const pdfFile=path.join(root,'notes.pdf');await fs.writeFile(pdfFile,pdf);assert.match((await readAttachment(pdfFile)).text,/Hello from PDF/);
  assert.ok(attachmentContext([{name:'large.txt',text:'x'.repeat(50000)}]).length<24500);
});
test('web search sends queries to Ollama and validates source links',async()=>{
  let sent;const results=await searchWeb('latest docs',{fetch:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({results:[{title:'Docs',url:'https://example.com/docs',content:'actual text'},{url:'javascript:alert(1)'}]})};}});
  assert.match(sent.url,/experimental\/web_search/);assert.equal(sent.body.query,'latest docs');assert.equal(results.length,1);
  await assert.rejects(searchWeb('test',{fetch:async()=>({ok:false,status:401})}),/sign-in/);
});
test('agent passes native thinking and executes enabled model tools before continuing',async()=>{
  const requests=[],outputs=[],tools=[];let rounds=0;
  const fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));const message=rounds++===0?{thinking:'reasoning',tool_calls:[{function:{name:'run_terminal',arguments:{command:'Write-Output 42'}}}]}:{content:'The result is 42.'};return {ok:true,body:(async function*(){yield Buffer.from(JSON.stringify({message,done:true})+'\n');})()};};
  await streamReply({selected:{name:'test'},messages:[{role:'user',content:'Compute 42'}],tools:[{type:'function',function:{name:'run_terminal'}}],think:true,signal:new AbortController().signal,fetch,onContent:text=>outputs.push(text),onTool:event=>tools.push(event),runTool:async()=>({output:'42',exitCode:0})});
  assert.equal(requests[0].think,true);assert.equal(requests[1].messages.at(-1).role,'tool');assert.match(requests[1].messages.at(-1).content,/42/);assert.match(outputs.join(''),/result is 42/);assert.equal(tools.at(-1).status,'complete');
});
test('terminal streams real PowerShell output, tracks cwd, and stops commands',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'liquid-terminal-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const events=[];
  const terminal=createTerminal({emit:event=>events.push(event),timeout:3000});
  const result=await terminal.run('Write-Output (6 * 7)',{directory:root});assert.equal(result.status,'complete');assert.match(result.output,/42/);assert.ok(events.some(event=>event.action==='output'));
  await fs.mkdir(path.join(root,'sub'));await terminal.run('Set-Location sub');assert.equal(terminal.state.cwd,path.join(root,'sub'));
  const waiting=terminal.run('Start-Sleep -Seconds 20');for(let i=0;!terminal.busy&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));terminal.stop();assert.equal((await waiting).status,'stopped');
});
test('preview combines linked generated CSS and JavaScript with no app bridge',()=>{
  const result=previewDocument('<link rel="stylesheet" href="style.css"><script src="app.js"></script>',[{filename:'style.css',content:'body{color:red}'},{filename:'app.js',content:'console.log(42)'}]);assert.match(result,/<style>body/);assert.match(result,/<script>console/);assert.match(result,/frame-src 'none'/);
});

test('continues token-limited code and recovers thinking-only answers',async()=>{
  const requests=[],output=[];
  const replies=[{message:{content:'```python\nprint('},done:true,done_reason:'length'},{message:{content:'42)\n```'},done:true,done_reason:'stop'}];
  const fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,body:(async function*(){yield Buffer.from(JSON.stringify(replies.shift())+'\n');})()};};
  await streamReply({selected:{name:'cloud',cloud:true},messages:[{role:'user',content:'Write code'}],codex:true,signal:new AbortController().signal,fetch,onContent:text=>output.push(text)});
  assert.equal(output.join(''),'```python\nprint(42)\n```');assert.equal(requests.length,2);assert.match(requests[1].messages.at(-1).content,/Continue exactly/);
  requests.length=0;output.length=0;
  replies.push({message:{thinking:'analysis'},done:true,done_reason:'length'},{message:{content:'Answer from the sources.'},done:true,done_reason:'stop'});
  await streamReply({selected:{name:'local'},messages:[{role:'user',content:'Search'}],think:true,signal:new AbortController().signal,fetch,onContent:text=>output.push(text)});
  assert.equal(requests[1].think,false);assert.equal(output.join(''),'Answer from the sources.');
  replies.push({message:{},done:true},{message:{},done:true});
  await assert.rejects(streamReply({selected:{name:'local'},messages:[],signal:new AbortController().signal,fetch}),/no answer/);
});
