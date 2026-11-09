import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Vitest transpiles, so TypeScript that Node can't strip (parameter properties, enums, a method
// named `declare`) passes the other tests and fails only when CI runs the tools with plain Node.
const ROOT = join(import.meta.dirname, '..', '..');
const OUT = mkdtempSync(join(tmpdir(), 'strip-types-'));

const tsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
  });

const stripError = (file: string): string | undefined => {
  let js: string;
  try {
    js = stripTypeScriptTypes(readFileSync(file, 'utf8'));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  // Stripping can succeed and still leave invalid JavaScript, so parse what Node would run.
  const out = join(OUT, `${relative(ROOT, file).replaceAll('/', '__')}.mjs`);
  writeFileSync(out, js);
  try {
    execFileSync(process.execPath, ['--check', out], { stdio: 'pipe' });
    return undefined;
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    return stderr.split('\n').find((line) => line.includes('Error')) ?? stderr;
  }
};

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true });
});

describe('tools under plain Node', () => {
  const files = [...tsFiles(join(ROOT, 'tools')), ...tsFiles(join(ROOT, 'contracts'))];

  it('finds the tool sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => relative(ROOT, file)))('%s runs with Node type stripping', (file) => {
    expect(stripError(join(ROOT, file))).toBeUndefined();
  });
});
