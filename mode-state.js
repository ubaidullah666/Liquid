let mode = 'chat';
export const getChatMode = () => mode;
export function setChatMode(value) { mode = value === 'codex' ? 'codex' : 'chat'; }
