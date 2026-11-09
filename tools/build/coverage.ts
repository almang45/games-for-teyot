/**
 * The one list of what unit coverage measures. vite.config.ts uses it, and a unit test keeps
 * sonar.coverage.exclusions in sonar-project.properties identical, so local and Sonar coverage agree.
 */
export const COVERAGE_INCLUDE = ['src/**/*.ts', 'tools/**/*.{ts,mjs}'] as const;

export const COVERAGE_EXCLUDE = [
  // Phaser scenes and the browser entry are exercised by Playwright, not unit tests.
  'src/main.ts',
  'src/scenes/**',
  'src/game/createGame.ts',
  // Type declarations.
  'src/**/*.d.ts',
  // CLI entry points run by the build and CI; their logic lives in tested modules.
  'tools/build/check-budget.mjs',
  'tools/build/check-private.mjs',
  'tools/validate/**',
  'tools/dev/**',
] as const;
