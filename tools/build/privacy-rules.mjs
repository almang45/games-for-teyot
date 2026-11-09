// PRD US-PRIV-01 rules, shared by the build check and its unit test.
// An allow list, not a deny list: anything that isn't a known web asset type fails the build, so a
// raw voice note (.ogg/.opus/.3gp/.aac/...) or a photo format nobody thought of can't slip through.

const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.webmanifest',
  '.txt',
  '.png',
  '.webp',
  '.svg',
  '.woff2',
  '.webm',
]);
// Cloudflare static-asset config files have no extension.
const ALLOWED_NAMES = new Set(['_headers', '_redirects']);
// Processed voice ships only as Opus .webm sprites under audio/ (docs/AUDIO.md).
const AUDIO_PREFIX = 'audio/';
const FORBIDDEN_SEGMENTS = ['reference', 'recordings'];

/** @param {string} path dist-relative, '/'-separated @returns {string | null} why the file may not ship, or null */
export function violation(path) {
  const lower = path.toLowerCase();
  const segments = lower.split('/');
  const name = segments.at(-1) ?? '';
  if (segments.some((s) => FORBIDDEN_SEGMENTS.includes(s))) return 'private folder';
  if (ALLOWED_NAMES.has(name)) return null;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) return `file type ${ext || '(none)'} is not allow-listed`;
  if (ext === '.webm' && !lower.startsWith(AUDIO_PREFIX)) return '.webm outside audio/';
  return null;
}
