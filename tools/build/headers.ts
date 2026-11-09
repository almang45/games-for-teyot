import { readFileSync } from 'node:fs';

/**
 * Reads the global `/*` block of a Cloudflare `_headers` file so `vite preview` (and so the
 * Playwright run) enforces the same CSP and security headers as production.
 */
export function parseGlobalHeaders(source: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let inGlobal = false;
  for (const line of source.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const indented = /^\s/.test(line);
    if (!indented) {
      inGlobal = line.trim() === '/*';
      continue;
    }
    if (!inGlobal) continue;
    const sep = line.indexOf(':');
    if (sep < 0) throw new Error(`Malformed _headers line: "${line.trim()}"`);
    headers[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return headers;
}

export function readGlobalHeaders(path: string): Record<string, string> {
  return parseGlobalHeaders(readFileSync(path, 'utf8'));
}
