#!/usr/bin/env node
// npm run contracts:schema: writes contracts/schema/<name>.schema.json for editors. Generated and
// gitignored; the zod schemas in contracts/ are the source of truth.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_SCHEMAS, jsonSchema, type ContractName } from '../../contracts/jsonSchema.ts';

const OUT = fileURLToPath(new URL('../../contracts/schema/', import.meta.url));

mkdirSync(OUT, { recursive: true });
const names = Object.keys(CONTRACT_SCHEMAS) as ContractName[];
for (const name of names) {
  writeFileSync(join(OUT, `${name}.schema.json`), `${JSON.stringify(jsonSchema(name), null, 2)}\n`);
}
console.log(
  JSON.stringify({
    level: 'info',
    event: 'contracts.schema_written',
    dir: 'contracts/schema',
    schemas: names,
  }),
);
