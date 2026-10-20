const SEARCH = 'https://www.google.com/search?q=';
function resolveAddress(text) {
  text = String(text || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text);
    if (!url.hostname || url.username || url.password) throw new Error('Enter a web address without embedded login details.');
    return url.href;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^localhost:\d+/i.test(text) && !/^[\w.-]+\.\w+:\d+/i.test(text)) {
    throw new Error('Only HTTP and HTTPS web addresses are supported.');
  }
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(text)) return new URL('http://' + text).href;
  if (/^[^\s/]+\.[^\s./]+(?::\d+)?(?:[/?#]\S*)?$/u.test(text)) return new URL('https://' + text).href;
  return SEARCH + encodeURIComponent(text);
}
function browserIntent(text, previous = '') {
  const value = String(text || '').trim().replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i, '').replace(/[.!]+$/, '');
  if (/^(?:open|launch|start)(?:\s+(?:the|a))?\s+(?:web\s+)?browser[.!]?$/i.test(value)) return { query: '' };
  if (/^search\s+(?:that|this|it)\s+(?:on|in)(?:\s+the)?\s+(?:web\s+)?browser$/i.test(value)) return { query: previous };
  const search = value.match(/^(?:search|look up|find)(?:\s+for)?\s+(.+?)\s+(?:on|in)(?:\s+the)?\s+(?:web\s+)?browser$/i);
  if (search) return { query: search[1] };
  const leading = value.match(/^search\s+(?:on|in)(?:\s+the)?\s+(?:web\s+)?browser(?:\s+for)?\s+(.+)$/i);
  if (leading) return { query: leading[1] };
  const combined = value.match(/^open\s+(?:the\s+)?browser\s+and\s+search(?:\s+for)?\s+(.+)$/i);
  if (combined) return { query: combined[1] };
  const open = value.match(/^(?:open|browse|go to)\s+(.+?)\s+(?:on|in)(?:\s+the)?\s+(?:web\s+)?browser$/i);
  if (open) return { query: open[1] };
  return null;
}
if (typeof module !== 'undefined') module.exports = { resolveAddress, browserIntent };
