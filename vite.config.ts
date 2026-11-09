import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { readGlobalHeaders } from './tools/build/headers.ts';
import { placeholderIcons } from './tools/build/placeholder-icons.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (err) {
    console.warn(
      JSON.stringify({ level: 'warn', event: 'build.git_sha_unavailable', error: String(err) }),
    );
    return 'unknown';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${gitSha()}`),
  },
  // Same CSP and security headers as production, so E2E catches CSP breakage.
  preview: { headers: readGlobalHeaders(`${root}public/_headers`) },
  build: {
    target: 'es2022',
    // Keeps Vite's output folder distinct from the repo's Antigravity-owned assets/.
    assetsDir: 'static',
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    svelte(),
    placeholderIcons(root),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // Manifest fetches omit cookies by default; behind Cloudflare Access that gets a login redirect.
      useCredentials: true,
      manifest: {
        id: '/',
        name: 'Rumah Cici Theia',
        short_name: 'Rumah Theia',
        description: 'Belajar menulis, membaca, berhitung, dan mewarnai bersama Bubu dan Ocica.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#fff4e6',
        theme_color: '#fff4e6',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,webm,json,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'tools/**/*.ts'],
      // Phaser scenes and the browser entry are covered by Playwright, not Vitest; palette is data.
      exclude: [
        'src/main.ts',
        'src/scenes/**',
        'src/game/createGame.ts',
        'src/placeholder/palette.ts',
        'src/**/*.d.ts',
        'tools/dev/**',
      ],
    },
  },
});
