const { test } = require('node:test');
const assert = require('node:assert/strict');
test('extracts code without prose and preserves incomplete streaming code', async () => {
  const { extractCode } = await import('./code-output.js');
  assert.equal(extractCode('Here is code:\n```python\nprint("hello")\n```\nExplanation'), 'print("hello")');
  assert.equal(extractCode('```js\nconst x = 1;'), 'const x = 1;');
  assert.equal(extractCode('plain code'), 'plain code');
});
test('chat parses multiple fenced blocks, prose, and old coding records', async () => {
  const { codeParts, normalizeLanguage, sourceFilename } = await import('./code-output.js');
  const parts = codeParts('First:\n```py\nprint(1)\n```\nThen:\n```js\nconsole.log(2)\n```');
  const blocks = parts.filter(part => part.type === 'code');
  assert.equal(blocks.length, 2); assert.equal(blocks[0].content, 'print(1)');
  assert.equal(normalizeLanguage(blocks[1].language), 'javascript');
  assert.equal(sourceFilename('py'), 'code.py');
  assert.equal(codeParts('print(3)', 'Python')[0].type, 'code');
  assert.equal(codeParts('An ordinary answer')[0].type, 'text');
  const file=codeParts('```python filename=src/main.py\nprint(42)\n```')[0];
  assert.equal(file.language,'python');assert.equal(file.filename,'src/main.py');
  assert.equal(codeParts('```src/main.py\nprint(42)\n```')[0].language,'python');
  assert.equal(codeParts('```filename=app.js\nconsole.log(42)\n```')[0].language,'javascript');
  assert.equal(normalizeLanguage('python3'),'python');
  assert.equal(normalizeLanguage('index.htm'),'html');
});
