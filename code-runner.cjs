const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function createCodeRunner({ timeout = 15000, maxOutput = 64000 } = {}) {
  let active = null;
  function stop(reason = 'stopped') {
    if (!active) return;
    active.reason = reason;
    if (!active.child) return;
    const child = active.child;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill());
      killer.on('exit', () => child.kill());
    } else child.kill('SIGKILL');
  }
  async function run(language, source) {
    if (active) throw Error('Stop the current program before running another.');
    if (!['javascript', 'python'].includes(language)) throw Error('Run supports JavaScript and Python. HTML can be previewed in chat.');
    if (typeof source !== 'string' || !source.trim() || source.length > 100000) throw Error('Run code up to 100,000 characters.');
    const task = { child: null, reason: '', output: '', size: 0 }; active = task;
    let folder;
    try {
      folder = await fs.mkdtemp(path.join(os.tmpdir(), 'liquid-run-'));
      const file = path.join(folder, language === 'python' ? 'main.py' : 'main.cjs');
      await fs.writeFile(file, source, 'utf8');
      if (task.reason) return { output: '', exitCode: null, status: task.reason, error: '', language };
      const command = language === 'javascript' ? process.execPath : process.platform === 'win32' ? 'py.exe' : 'python3';
      const args = language === 'python' ? [...(process.platform === 'win32' ? ['-3'] : []), '-u', file] : [file];
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' }; delete env.NODE_OPTIONS;
      return await new Promise(resolve => {
        const child = spawn(command, args, { cwd: folder, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        task.child = child;
        const timer = setTimeout(() => stop('timeout'), timeout);
        const collect = chunk => {
          task.size += chunk.length;
          task.output += chunk.slice(0, Math.max(0, maxOutput - Buffer.byteLength(task.output))).toString();
          if (task.size > maxOutput && !task.reason) stop('output-limit');
        };
        child.stdout.on('data', collect); child.stderr.on('data', collect);
        child.once('error', error => { task.error = error.code === 'ENOENT' ? 'Python 3 is unavailable. Install Python with the Windows py launcher to run Python code.' : error.message; });
        child.once('close', code => {
          clearTimeout(timer); if (active === task) active = null;
          resolve({ output: task.output, exitCode: code, status: task.error ? 'error' : task.reason || (code === 0 ? 'complete' : 'error'), error: task.error || '', language });
        });
      });
    } finally { if (active === task) active = null; if (folder) await fs.rm(folder, { recursive: true, force: true }).catch(() => {}); }
  }
  return { run, stop, get busy() { return !!active; } };
}
module.exports = { createCodeRunner };
