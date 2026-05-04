// Лог боя и общих событий — отдельный модуль, чтобы не зависеть от UI-слоя.

const MAX_LOG_LINES = 80;

export function logEvent(message, kind = '') {
  const log = document.getElementById('log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = 'line' + (kind ? ' ' + kind : '');
  line.textContent = '> ' + message;
  log.appendChild(line);
  while (log.childElementCount > MAX_LOG_LINES) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
