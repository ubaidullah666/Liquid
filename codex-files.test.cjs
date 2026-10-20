const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createProjectFile,safeFilename}=require('./codex-files.cjs');
test('Codex creates nested files and preserves existing files',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'liquid-files-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const result=await createProjectFile(root,'src/main.js','console.log(42)');
  assert.equal(fs.readFileSync(result.path,'utf8'),'console.log(42)');
  await assert.rejects(createProjectFile(root,'src/main.js','changed'),/already exists/);
  assert.equal(fs.readFileSync(result.path,'utf8'),'console.log(42)');
  await assert.rejects(createProjectFile('', 'file.txt','x'),/project folder/);
  for(const name of ['../escape.txt','/absolute.txt','C:\\outside.txt','src/../../outside.txt','src/NUL.txt','src/file.','src//main.js'])assert.throws(()=>safeFilename(name),/relative filename/);
  assert.deepEqual(safeFilename('src\\main.py'),['src','main.py']);
});
