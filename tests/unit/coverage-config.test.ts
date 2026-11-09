import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COVERAGE_EXCLUDE } from '../../tools/build/coverage';

function sonarProperty(key: string): string {
  const text = readFileSync(new URL('../../sonar-project.properties', import.meta.url), 'utf8');
  const line = text.split('\n').find((l) => l.startsWith(`${key}=`));
  if (line === undefined) throw new Error(`${key} missing from sonar-project.properties`);
  return line.slice(key.length + 1).trim();
}

describe('coverage configuration', () => {
  it('excludes the same files from Sonar coverage as from Vitest coverage', () => {
    const sonar = sonarProperty('sonar.coverage.exclusions').split(',');
    expect(sonar).toEqual([...COVERAGE_EXCLUDE]);
  });
});
