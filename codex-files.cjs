const fs = require('node:fs/promises');
const path = require('node:path');
function safeFilename(filename) {
  const value = String(filename || '').replaceAll('\\','/');
  const parts = value.split('/');
  if (!value || value.length > 240 || parts.some(part=>!part || part==='.' || part==='..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('Use a relative filename inside the project, such as src/main.py.');
  return parts;
}
async function createProjectFile(root, filename, content) {
  if (!root) throw Error('Choose a project folder in Codex first.');
  if (typeof content !== 'string' || content.length > 1000000) throw Error('Use file content up to 1,000,000 characters.');
  const parts = safeFilename(filename), canonical = await fs.realpath(root);
  let directory = canonical;
  for (const part of parts.slice(0,-1)) {
    directory = path.join(directory,part);
    await fs.mkdir(directory).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const stat = await fs.lstat(directory);
    const resolved = await fs.realpath(directory);
    const relative = path.relative(canonical,resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink() || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Project files cannot be created through linked directories.');
  }
  const target = path.join(directory,parts.at(-1));
  try { await fs.writeFile(target,content,{encoding:'utf8',flag:'wx'}); }
  catch(error) { if(error.code==='EEXIST')throw Error('That file already exists. Choose another filename, or use Save… to replace it.');throw error; }
  return {filename:parts.join('/'),path:target};
}
module.exports = { createProjectFile, safeFilename };
