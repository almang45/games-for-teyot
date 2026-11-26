#!/usr/bin/env node
// npm run sprites:pack -- --key <key> --src <dir> [--fps idle=6 …] [--write-manifest]
// Packs pose strips (<dir>/<animation>.png, e.g. walk.fr.png) into assets/<key path>.png
// (ASSETS.md §3.6). Strips stay outside the repo: they are generated working files.
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { manifest } from '../../contracts/manifest.ts';
import { decodePng, encodePng } from '../build/png.ts';
import { packSheet, upsertEntry } from './pack.ts';
import type { Raster } from './raster.ts';

const log = (level: 'info' | 'warn' | 'error', event: string, fields: object): void => {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
};

function parseRates(pairs: readonly string[]): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const pair of pairs) {
    const [name, value] = pair.split('=');
    const fps = Number(value);
    if (!name || !Number.isInteger(fps) || fps < 1 || fps > 30) {
      throw new Error(`--fps takes <animation>=<1–30>, got ${pair}`);
    }
    rates[name] = fps;
  }
  return rates;
}

function readStrips(dir: string): Map<string, Raster> {
  const strips = new Map<string, Raster>();
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
  for (const file of files.sort((a, b) => a.localeCompare(b))) {
    const full = join(dir, file);
    if (lstatSync(full).isSymbolicLink()) {
      throw new Error(`${file} is a symlink; copy the strip in`);
    }
    strips.set(file.slice(0, -'.png'.length), decodePng(readFileSync(full)));
  }
  if (strips.size === 0) throw new Error(`no .png strips in ${dir}`);
  return strips;
}

async function writeManifest(
  root: string,
  entry: ReturnType<typeof packSheet>['entry'],
): Promise<void> {
  const file = join(root, 'assets', 'manifest.json');
  const current = manifest.parse(JSON.parse(readFileSync(file, 'utf8')));
  const next = upsertEntry(current, entry);
  const options = (await resolveConfig(file)) ?? {};
  writeFileSync(file, await format(JSON.stringify(next), { ...options, filepath: file }));
  log('info', 'sprites.pack.manifest', { file: 'assets/manifest.json', key: entry.key });
}

try {
  const { values } = parseArgs({
    options: {
      key: { type: 'string' },
      src: { type: 'string' },
      fps: { type: 'string', multiple: true, default: [] },
      'write-manifest': { type: 'boolean', default: false },
    },
  });
  if (!values.key || !values.src) throw new Error('usage: sprites:pack -- --key <key> --src <dir>');
  const root = process.cwd();
  const packed = packSheet(values.key, readStrips(resolve(values.src)), {
    fps: parseRates(values.fps),
  });
  for (const issue of packed.issues) {
    log(issue.severity === 'error' ? 'error' : 'warn', 'sprites.pack.issue', issue);
  }
  const errors = packed.issues.filter((i) => i.severity === 'error').length;
  if (errors > 0) {
    log('error', 'sprites.pack.failed', { key: values.key, errors });
    process.exitCode = 1;
  } else {
    const out = join(root, 'assets', packed.entry.path);
    mkdirSync(dirname(out), { recursive: true });
    const { width, height, rgba } = packed.sheet;
    writeFileSync(
      out,
      encodePng(width, height, (x, y) => {
        const o = (y * width + x) * 4;
        return [rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0, rgba[o + 3] ?? 0];
      }),
    );
    log('info', 'sprites.pack.wrote', { file: `assets/${packed.entry.path}`, width, height });
    if (values['write-manifest']) await writeManifest(root, packed.entry);
    else log('info', 'sprites.pack.entry', { entry: packed.entry });
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  log('error', 'sprites.pack.crashed', { message });
  process.exitCode = 1;
}
