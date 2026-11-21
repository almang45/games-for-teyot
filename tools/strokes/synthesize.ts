// Writes the synthetic stroke fixtures. Logic: tools/strokes/fixtures.ts.
// Usage: node tools/strokes/synthesize.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStroke } from '../../src/engine/tracing/path.ts';
import { fixturesFor, serialize, TARGETS } from './fixtures.ts';

const GLYPHS = 'src/content/glyphs';
const OUT = 'tests/fixtures/strokes';

mkdirSync(OUT, { recursive: true });
let count = 0;
for (const { glyph, stroke } of TARGETS) {
  const source = JSON.parse(readFileSync(join(GLYPHS, `${glyph}.json`), 'utf8')) as {
    strokes: { path: string }[];
  };
  const path = source.strokes[stroke]?.path;
  if (!path) throw new Error(`${glyph} has no stroke ${stroke}`);
  for (const [name, fixture] of fixturesFor(glyph, stroke, parseStroke(path))) {
    writeFileSync(join(OUT, name), serialize(fixture));
    count++;
  }
}
console.log(JSON.stringify({ event: 'strokes.synthesized', count, out: OUT }));
