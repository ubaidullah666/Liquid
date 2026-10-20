export function extractCode(text) {
  const match = String(text).match(/```[^\r\n]*\r?\n([\s\S]*?)(?:\r?\n```|$)/);
  return match ? match[1] : String(text);
}
export function codeParts(text, fallbackLanguage = '') {
  const parts = []; let last = 0;
  const pattern = /```([^\r\n`]*)\r?\n([\s\S]*?)(?:\r?\n```|$)/g;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) });
    const header = match[1].trim();
    const filename = header.match(/(?:filename|file)=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
    const token = header.split(/\s+/)[0];
    const namedFile = filename ? filename[1] || filename[2] || filename[3] : /\.[a-z0-9]+$/i.test(token) ? token : '';
    const label = !token || /^(?:filename|file)=/.test(token) ? namedFile || fallbackLanguage || 'text' : token;
    parts.push({ type: 'code', language: normalizeLanguage(label), filename: namedFile, content: match[2] });
    last = match.index + match[0].length;
  }
  if (!parts.length && fallbackLanguage) return [{ type: 'code', language: fallbackLanguage, content: text }];
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });
  return parts;
}
export function normalizeLanguage(language) {
  const value = String(language).toLowerCase().trim();
  const extension = value.match(/\.([a-z0-9]+)$/)?.[1];
  const key = extension || value;
  return ({ js:'javascript', mjs:'javascript', cjs:'javascript', node:'javascript', nodejs:'javascript', 'node.js':'javascript', py:'python', python3:'python', html5:'html', htm:'html', 'c++':'cpp', 'c#':'cs', typescript:'ts', javascript:'javascript', python:'python' })[key] || key;
}
export function sourceFilename(language) {
  const value = normalizeLanguage(language);
  return 'code.' + ({ javascript:'js', python:'py', html:'html', css:'css', java:'java', cpp:'cpp', cs:'cs', rust:'rs', go:'go', ts:'ts', json:'json' }[value] || 'txt');
}
