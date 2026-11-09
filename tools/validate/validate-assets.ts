#!/usr/bin/env node
// npm run validate:assets: assets/ against contracts/ (CI validate stage).
import { fileURLToPath } from 'node:url';
import { validateAssets } from './assets.ts';
import { printReport } from './lane.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

process.exitCode = printReport(validateAssets(ROOT));
