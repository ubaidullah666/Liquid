const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const destination = path.join(root, 'dist', 'LiquidGlass-win32-x64');
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'electron', 'dist'), destination, { recursive: true });
fs.copyFileSync(path.join(destination, 'electron.exe'), path.join(destination, 'LiquidGlass.exe'));
fs.unlinkSync(path.join(destination, 'electron.exe'));
const appPath = path.join(destination, 'resources', 'app');
fs.mkdirSync(appPath, { recursive: true });
fs.copyFileSync(path.join(root,'interface.css'),path.join(appPath,'interface.css'));
for (const item of ['main.cjs', 'preload.cjs', 'renderer.js', 'browser-ui.js', 'browser-engine.cjs', 'browser-input.cjs', 'browser-smoke.cjs', 'chat-ui.js', 'chat-engine.cjs', 'history-store.cjs', 'chat-smoke.cjs', 'index.html', 'style.css', 'assets']) {
  fs.cpSync(path.join(root, item), path.join(appPath, item), { recursive: true });
}
fs.mkdirSync(path.join(appPath, 'node_modules'), { recursive: true });
// Preserve the installed dependency layout, including nested versions and optional PDF dependencies.
const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
for(const [relative,entry] of Object.entries(lock.packages||{})) {
  if(!relative.startsWith('node_modules/')||entry.dev)continue;
  const sourceDirectory=path.join(root,relative);
  if(fs.existsSync(sourceDirectory))fs.cpSync(sourceDirectory,path.join(appPath,relative),{recursive:true});
}
for(const item of ['personal-store.cjs','personal-engine.cjs','personal-ui.js','personal-smoke.cjs','native','code-chat.js','code-output.js','code-runner.cjs','model-picker.js','ollama-models.cjs','mode-state.js','codex-files.cjs','attachments.cjs','web-search.cjs','terminal-engine.cjs','preview-engine.cjs','ollama-agent.cjs','feature-controls.js','features-smoke.cjs']) fs.cpSync(path.join(root,item),path.join(appPath,item),{recursive:true});
const source = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.copyFileSync(path.join(root,'session-smoke.cjs'),path.join(appPath,'session-smoke.cjs'));
delete source.devDependencies; delete source.scripts;
fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify(source, null, 2));
console.log('Portable desktop app created: ' + path.join(destination, 'LiquidGlass.exe'));
