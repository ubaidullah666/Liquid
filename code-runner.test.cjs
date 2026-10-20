const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCodeRunner } = require('./code-runner.cjs');
test('JavaScript runs with output and captures runtime errors', async () => {
  const runner = createCodeRunner();
  const result = await runner.run('javascript', 'console.log(6 * 7)');
  assert.equal(result.status, 'complete'); assert.match(result.output, /42/); assert.equal(result.exitCode, 0);
  const error = await runner.run('javascript', 'throw new Error("test failure")');
  assert.equal(error.status, 'error'); assert.match(error.output, /test failure/);
  await assert.rejects(runner.run('bash', 'echo hello'), /supports/);
});
test('Python runs when installed or reports the missing runtime', async () => {
  const result = await createCodeRunner().run('python', 'print(6 * 7)');
  if (result.error) assert.match(result.error, /Python 3 is unavailable/);
  else { assert.equal(result.status, 'complete'); assert.match(result.output, /42/); }
});
test('timeouts, cancellation, concurrent execution, and output limits', async () => {
  const runner = createCodeRunner({ timeout: 500, maxOutput: 1000 });
  const timed = await runner.run('javascript', 'setInterval(() => {}, 1000)');
  assert.equal(timed.status, 'timeout');
  const pending = runner.run('javascript', 'setInterval(() => {}, 1000)');
  await assert.rejects(runner.run('javascript', 'console.log(1)'), /current program/);
  runner.stop(); assert.equal((await pending).status, 'stopped');
  const large = await createCodeRunner({timeout:5000,maxOutput:1000}).run('javascript', 'setInterval(() => console.log("x".repeat(2000)), 1)');
  assert.equal(large.status, 'output-limit'); assert.ok(large.output.length <= 1000);
  assert.equal(runner.busy, false);
});
