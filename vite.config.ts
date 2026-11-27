import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { ROOM_PREFIXES, ROOM_URL_PATTERN } from './tools/build/budget.mjs';
import { COVERAGE_EXCLUDE, COVERAGE_INCLUDE } from './tools/build/coverage.ts';
import { readGlobalHeaders } from './tools/build/headers.ts';
import { cssHex, placeholderPalette } from './src/placeholder/palette.ts';
import { INSTALLED_START_URL } from './src/platform/launch.ts';
import { NETWORK_ONLY_NAVIGATIONS } from './src/platform/swRouting.ts';
import { placeholderIcons } from './tools/build/placeholder-icons.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const SHELL_COLOR = cssHex(placeholderPalette.sky);

/** index.html cannot import the palette, so its theme-color is filled in here. */
function shellColor(): Plugin {
  return {
    name: 'rct-shell-color',
    transformIndexHtml: (html) => html.replaceAll('__SHELL_COLOR__', SHELL_COLOR),
  };
}
const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function gitSha(): string {
  // CI sets APP_COMMIT_SHA to the PR head; GITHUB_SHA on a PR is a temporary merge commit.
  const ciSha = process.env.APP_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (ciSha) return ciSha.slice(0, 7);
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
    shellColor(),
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
        start_url: INSTALLED_START_URL,
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: SHELL_COLOR,
        theme_color: SHELL_COLOR,
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
        // No webmanifest here: vite-plugin-pwa adds the manifest to the precache itself.
        globPatterns: ['**/*.{js,css,html,png,svg,webp,webm,json}'],
        // ARCHITECTURE §8.1: the shell, hub, and boot audio are precached; a room is cached the
        // first time Theia enters it, so the first install stays within the 3 MB budget.
        globIgnores: ROOM_PREFIXES.map((prefix) => `${prefix}**`),
        runtimeCaching: [
          {
            urlPattern: ROOM_URL_PATTERN,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rct-rooms',
              // An Access login redirect to another origin comes back opaque (status 0) or fails
              // CORS, so allowing only 200 keeps it out of the room cache.
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        navigateFallback: '/index.html',
        // Access login/callback and the re-auth path must reach Cloudflare, not the cached shell.
        navigateFallbackDenylist: [...NETWORK_ONLY_NAVIGATIONS],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        // Browser condition and per-test DOM cleanup, so components mount as they do on the tablet.
        plugins: [svelteTesting()],
        test: { name: 'ui', include: ['ui/**/*.test.ts'], environment: 'happy-dom' },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [...COVERAGE_INCLUDE],
      exclude: [...COVERAGE_EXCLUDE],
    },
  },
});
