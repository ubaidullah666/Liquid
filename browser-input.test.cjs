const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAddress, browserIntent } = require('./browser-input.cjs');
test('natural browser commands and previous-thought search', () => {
  assert.deepEqual(browserIntent('open browser'), { query: '' });
  assert.deepEqual(browserIntent('Open the web browser!'), { query: '' });
  assert.deepEqual(browserIntent('search that on browser', 'liquid glass'), { query: 'liquid glass' });
  assert.deepEqual(browserIntent('search cats on browser'), { query: 'cats' });
  assert.deepEqual(browserIntent('search for orbital mechanics in the browser'), { query: 'orbital mechanics' });
  assert.deepEqual(browserIntent('open wikipedia.org in browser'), { query: 'wikipedia.org' });
  assert.equal(browserIntent('open wikipedia.org'), null);
  assert.equal(browserIntent('https://example.com'), null);
  assert.equal(browserIntent('search for a better explanation'), null);
  assert.deepEqual(browserIntent('please search on browser for glass'), { query: 'glass' });
  assert.equal(browserIntent('a quiet thought'), null);
});
test('address bar distinguishes web addresses, local development, and searches', () => {
  assert.equal(resolveAddress('example.com'), 'https://example.com/');
  assert.equal(resolveAddress('https://example.com/a?q=1'), 'https://example.com/a?q=1');
  assert.equal(resolveAddress('localhost:3000/test'), 'http://localhost:3000/test');
  assert.equal(resolveAddress('cats & dogs'), 'https://www.google.com/search?q=cats%20%26%20dogs');
  assert.equal(resolveAddress(''), '');
});
test('blocks privileged protocols and embedded credentials', () => {
  for (const input of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com']) assert.throws(() => resolveAddress(input));
});
