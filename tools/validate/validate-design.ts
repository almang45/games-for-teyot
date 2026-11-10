#!/usr/bin/env node
// npm run validate:design: design/ and ui/ against contracts/ (CI validate stage).
import { fileURLToPath } from 'node:url';
import { validateDesign } from './design.ts';
import { printReport } from './lane.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

process.exitCode = printReport(validateDesign(ROOT));
