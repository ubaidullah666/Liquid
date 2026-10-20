const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
function createTerminal({emit=()=>{},timeout=60000,maxOutput=128000}={}) {
  let active=null,cwd='',log='';
  const event=data=>emit({type:'terminal',...data});
  function stop(reason='stopped') {
    if(!active)return;active.reason=reason;
    const child=active.child;
    if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());killer.on('exit',()=>child.kill());}else child.kill('SIGKILL');
  }
  function reset(directory=''){if(active)throw Error('Stop the terminal command first.');cwd=directory;log='';event({action:'reset',cwd,output:''});}
  async function run(command,{directory=cwd,signal,source='user'}={}) {
    if(active)throw Error('The terminal is busy. Stop its command first.');
    if(typeof command!=='string'||!command.trim()||command.length>12000)throw Error('Enter a terminal command up to 12,000 characters.');
    if(!directory)throw Error('Choose a Codex project folder first.');
    if(signal?.aborted)throw Error('Terminal command canceled.');
    directory=await fs.realpath(directory);
    if(active)throw Error('The terminal is busy.');
    const marker='__LIQUID_CWD_'+randomUUID().replaceAll('-','')+'__';
    const script=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $global:LASTEXITCODE=0; & {\n${command}\n}; $liquidSuccess=$?; $liquidExit=if($LASTEXITCODE -ne 0){$LASTEXITCODE}elseif($liquidSuccess){0}else{1}; [Console]::WriteLine("\n${marker}"+(Get-Location).Path); exit $liquidExit`;
    const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
    const child=spawn('powershell.exe',args,{cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const task={child,reason:'',output:'',size:0};active=task;cwd=directory;
    log+=`\n${source==='model'?'MODEL':'YOU'} > ${command}\n`;log=log.slice(-64000);event({action:'start',command,source,cwd});
    const abort=()=>stop();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    return await new Promise(resolve=>{
      const timer=setTimeout(()=>stop('timeout'),timeout);
      const collect=chunk=>{task.size+=chunk.length;const text=chunk.slice(0,Math.max(0,maxOutput-Buffer.byteLength(task.output))).toString('utf8');task.output+=text;log=(log+text).slice(-64000);event({action:'output',text});if(task.size>maxOutput&&!task.reason)stop('output-limit');};
      child.stdout.on('data',collect);child.stderr.on('data',collect);
      child.once('error',error=>{task.error=error.message;});
      child.once('close',code=>{
        clearTimeout(timer);signal?.removeEventListener('abort',abort);if(active===task)active=null;
        const location=task.output.indexOf(marker);if(location>=0){cwd=task.output.slice(location+marker.length).split(/[\r\n]/)[0].trim()||cwd;task.output=task.output.slice(0,location).trimEnd();}
        // Replace streaming log so the internal working-directory marker is removed.
        log=log.replace(new RegExp(marker+'[^\\r\\n]*[\\r\\n]*','g'),'');
        const result={command,output:task.output,exitCode:code,status:task.error?'error':task.reason||(code===0?'complete':'error'),error:task.error||'',cwd};
        event({action:'done',...result,log});resolve(result);
      });
    });
  }
  return {run,stop,reset,get busy(){return !!active;},get state(){return {cwd,output:log,busy:!!active};}};
}
module.exports={createTerminal};
