// npm run proto: serves Antigravity's prototype/ (component gallery and clickable prototype).
// It never ships (AGENTS.md), so there's no build, PWA or service worker here.
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const repo = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: `${repo}prototype`,
  // The prototype imports design/, ui/ and assets/ itself; the game's public/ isn't its business.
  publicDir: false,
  // Reads svelte.config.js from the repo root, so components compile exactly as in the game.
  plugins: [svelte({ configFile: `${repo}svelte.config.js` })],
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [searchForWorkspaceRoot(repo)],
      // `npm run proto -- --host` puts this on the LAN for Mama's phone; the family's photos and
      // voice recordings must never be reachable through /@fs/.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/reference/**', '**/recordings/**'],
    },
  },
});
