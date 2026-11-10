import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { error, zodIssues, type Issue } from '../../contracts/common.ts';
import { distFiles } from '../build/dist-files.mjs';

/** An Issue tied to the repo-relative file it was found in. */
export interface FileIssue extends Issue {
  readonly file: string;
}

export interface Report {
  readonly lane: string;
  readonly files: number;
  readonly issues: readonly FileIssue[];
}

/** Placeholders that keep an empty folder in git, and notes, are not design work. */
const IGNORED_NAMES = new Set(['.gitkeep', 'README.md']);

export interface LaneFile {
  /** Repo-relative, '/'-separated. */
  readonly path: string;
  readonly symlink: boolean;
}

/**
 * Every file under `<root>/<lane>`, minus folder placeholders. Missing lanes are empty. A linked
 * lane folder is listed as itself and never read through.
 */
export function laneFiles(root: string, lane: string): LaneFile[] {
  const dir = join(root, lane);
  const stat = lstatSync(dir, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isSymbolicLink()) return [{ path: lane, symlink: true }];
  return distFiles(dir, root)
    .filter((f) => !IGNORED_NAMES.has(f.path.slice(f.path.lastIndexOf('/') + 1)))
    .map((f) => ({ path: f.path, symlink: f.symlink }));
}

export const inFile =
  (file: string) =>
  (issue: Issue): FileIssue => ({ ...issue, file });

export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: FileIssue[] };

/** Reads and validates a JSON file, turning syntax and schema errors into issues. */
export function parseJsonFile<T>(root: string, file: string, schema: z.ZodType<T>): Parsed<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, file), 'utf8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [{ ...error('', `not valid JSON: ${message}`), file }] };
  }
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, issues: zodIssues(result.error).map(inFile(file)) };
  return { ok: true, value: result.data };
}

export const symlinkIssue = (f: LaneFile): FileIssue => ({
  ...error('', 'symlinks are not allowed in a lane: they can point into reference/ or recordings/'),
  file: f.path,
});

/** Prints one JSON line per issue plus a summary, and returns the process exit code. */
export function printReport(
  report: Report,
  out: (line: string) => void = (l) => {
    console.log(l);
  },
  err: (line: string) => void = (l) => {
    console.error(l);
  },
): number {
  for (const issue of report.issues) {
    const line = JSON.stringify({
      level: issue.severity === 'error' ? 'error' : 'warn',
      event: 'validate.issue',
      lane: report.lane,
      file: issue.file,
      path: issue.path,
      message: issue.message,
    });
    if (issue.severity === 'error') err(line);
    else out(line);
  }
  const errors = report.issues.filter((i) => i.severity === 'error').length;
  const summary = JSON.stringify({
    level: errors > 0 ? 'error' : 'info',
    event: errors > 0 ? 'validate.failed' : 'validate.ok',
    lane: report.lane,
    files: report.files,
    errors,
    warnings: report.issues.length - errors,
  });
  if (errors > 0) err(summary);
  else out(summary);
  return errors > 0 ? 1 : 0;
}
