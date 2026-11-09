import type { Logger } from './logger';

type ErrorTarget = Pick<Window, 'addEventListener'>;

/**
 * Routes uncaught errors and unhandled rejections into the structured log (ARCHITECTURE §11).
 *
 * `onFatal` runs after an uncaught Error (a throw in a scene's create() or an input handler lands
 * here, outside any try/catch of ours). Error events without an Error object, such as the benign
 * "ResizeObserver loop" notice, and unhandled rejections are logged only.
 */
export function captureGlobalErrors(
  target: ErrorTarget,
  logger: Logger,
  onFatal: (err: Error) => void = () => undefined,
): void {
  target.addEventListener('error', (event: ErrorEvent) => {
    const err: unknown = event.error;
    logger.error('app.uncaught_error', err ?? event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
    if (err instanceof Error) onFatal(err);
  });
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    logger.error('app.unhandled_rejection', event.reason);
  });
}
