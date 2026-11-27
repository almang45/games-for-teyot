import { progressExport, SCHEMA_VERSION, type ProgressExport } from './schema';

/**
 * Why an import was refused. The parent area turns each into a sentence for the parent
 * (US-PARENT-04: "refuses invalid files with a clear message"); `detail` goes to the log.
 */
export type ImportProblem =
  | { readonly kind: 'not-json'; readonly detail: string }
  | { readonly kind: 'not-progress'; readonly detail: string }
  | { readonly kind: 'newer-version'; readonly version: number; readonly detail: string }
  | { readonly kind: 'invalid'; readonly issues: readonly string[]; readonly detail: string };

export type ImportResult =
  | { readonly ok: true; readonly data: ProgressExport }
  | { readonly ok: false; readonly problem: ImportProblem };

/** Import files are a few hundred KB at most; anything far larger isn't one of ours. */
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/** The file name the parent area offers when saving an export. */
export function exportFileName(data: ProgressExport): string {
  return `rumah-cici-theia-${data.exportedAt.slice(0, 10)}.json`;
}

export function serializeExport(data: ProgressExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads an export file. Nothing is written here: the caller replaces the stored progress only
 * with a result that came back ok, so a bad file never touches what is on the device.
 */
export function parseImport(text: string): ImportResult {
  const fail = (problem: ImportProblem): ImportResult => ({ ok: false, problem });
  if (text.length > MAX_IMPORT_BYTES) {
    return fail({ kind: 'not-progress', detail: `${text.length} characters is too large` });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return fail({ kind: 'not-json', detail: err instanceof Error ? err.message : String(err) });
  }
  if (!isObject(json) || typeof json.schemaVersion !== 'number') {
    return fail({ kind: 'not-progress', detail: 'no schemaVersion' });
  }
  if (json.schemaVersion > SCHEMA_VERSION) {
    return fail({
      kind: 'newer-version',
      version: json.schemaVersion,
      detail: `schemaVersion ${json.schemaVersion}, this app reads up to ${SCHEMA_VERSION}`,
    });
  }
  const parsed = progressExport.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return fail({ kind: 'invalid', issues, detail: issues.slice(0, 5).join('; ') });
  }
  return { ok: true, data: parsed.data };
}
