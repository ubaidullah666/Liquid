const configuredSessions=new WeakSet();
function previewDocument(html,files=[]) {
  const related=new Map(files.filter(file=>typeof file.filename==='string'&&typeof file.content==='string').map(file=>[file.filename.replace(/^\.\//,''),file.content]));
  let content=html.replace(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,(tag,url)=>related.has(url.replace(/^\.\//,''))?`<style>${related.get(url.replace(/^\.\//,'')).replace(/<\/style/gi,'<\\/style')}</style>`:tag);
  content=content.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,(tag,url)=>related.has(url.replace(/^\.\//,''))?`<script>${related.get(url.replace(/^\.\//,'')).replace(/<\/script/gi,'<\\/script')}</script>`:tag);
  return `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; connect-src https:; frame-src 'none'; form-action 'none'; base-uri 'none';">`+content;
}
function openPreview(html,files=[]) {
  if(typeof html!=='string'||!html.trim()||html.length>1000000)throw Error('Preview HTML up to 1,000,000 characters.');
  const {BrowserWindow}=require('electron');
  const preview=new BrowserWindow({width:1000,height:760,title:'Liquid · Code preview',backgroundColor:'#ffffff',show:false,webPreferences:{partition:'liquid-code-preview',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const wc=preview.webContents;
  wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.setPermissionCheckHandler(()=>false);
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',event=>event.preventDefault());
  if(!configuredSessions.has(wc.session)){wc.session.on('will-download',event=>event.preventDefault());configuredSessions.add(wc.session);}
  wc.once('did-finish-load',()=>preview.show());
  wc.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(previewDocument(html,files))).catch(()=>preview.close());
  return preview;
}
async function createWebPreview(html,files=[],project) {
  const http=require('node:http'),path=require('node:path'),fs=require('node:fs/promises');
  const {randomUUID}=require('node:crypto');
  const prefix='/'+randomUUID()+'/',assets=new Map();
  for(const file of files)if(typeof file.filename==='string'&&typeof file.content==='string'&&file.content.length<=1000000)assets.set(file.filename.replace(/\\/g,'/').replace(/^\.\//,''),file.content);
  let root=project?await fs.realpath(project):null;
  let entry=[...assets.keys()].find(name=>/(^|\/)index\.html?$/i.test(name))||[...assets.keys()].find(name=>/\.html?$/i.test(name));
  if(html?.trim()){entry=entry||'index.html';assets.set(entry,html);}
  if(!entry&&root){for(const candidate of ['dist/index.html','build/index.html','index.html','public/index.html']){try{await fs.access(path.join(root,candidate));root=path.dirname(path.join(root,candidate));entry='index.html';break;}catch{}}if(!entry)throw Error('No HTML entry found. Build the web project first, or run its development server in Terminal and open its localhost URL.');}
  if(!entry&&[...assets.keys()].some(name=>/\.(tsx?|jsx)$/i.test(name)))throw Error('TypeScript and JSX need a web build. Save the project, build or start it in Terminal, then preview the built project or open its localhost URL.');
  if(!entry){entry='index.html';assets.set(entry,'<!doctype html><html><head><meta charset="utf-8"><title>Code preview</title>'+[...assets.keys()].filter(name=>/\.css$/i.test(name)).map(name=>`<link rel="stylesheet" href="${encodeURI(name).replace(/"/g,'%22')}">`).join('')+'</head><body><main id="app"><h1>Web preview</h1><p>Your styles and scripts are loaded here.</p></main>'+[...assets.keys()].filter(name=>/\.(m?js)$/i.test(name)).map(name=>`<script type="module" src="${encodeURI(name).replace(/"/g,'%22')}"></script>`).join('')+'</body></html>');}
  const mime={'.html':'text/html','.htm':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
      const name=decodeURIComponent(url.pathname.slice(prefix.length))||entry;
      if(name.split(/[\\/]/).some(part=>part==='..'||part.startsWith('.'))){res.writeHead(403).end();return;}
      let body=assets.get(name);
      if(body===undefined&&root){const file=await fs.realpath(path.resolve(root,name));const relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Outside project');const stat=await fs.stat(file);if(!stat.isFile()||stat.size>10000000)throw Error('File unavailable');body=await fs.readFile(file);}
      if(body===undefined){res.writeHead(404).end();return;}
      if(/\.html?$/i.test(name))body=body.toString().replace(/\b(src|href)=(['"])\/(?!\/)/gi,`$1=$2${prefix}`);
      if(/\.css$/i.test(name))body=body.toString().replace(/url\((['"]?)\/(?!\/)/gi,`url($1${prefix}`);
      res.writeHead(200,{'Content-Type':mime[path.extname(name).toLowerCase()]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
    }catch{res.writeHead(404).end('Preview file not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  server.url=`http://127.0.0.1:${server.address().port}${prefix}${entry}`;
  server.isDestroyed=()=>!server.listening;
  server.once('close',()=>server.emit('closed'));
  return server;
}
module.exports={openPreview,previewDocument,createWebPreview};
