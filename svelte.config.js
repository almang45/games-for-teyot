/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  // Runes only, so legacy `export let` and `$:` fail to compile instead of half-working.
  compilerOptions: { runes: true },
  vitePlugin: {
    // Packages keep the mode they were written in: Svelte Testing Library ships a legacy wrapper.
    dynamicCompileOptions: ({ filename }) =>
      filename.split(/[/\\]/).includes('node_modules') ? { runes: undefined } : undefined,
  },
};
