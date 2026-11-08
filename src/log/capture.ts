import type { Logger } from './logger';

type ErrorTarget = Pick<Window, 'addEventListener'>;

/** Routes uncaught errors and unhandled rejections into the structured log (ARCHITECTURE §11). */
export function captureGlobalErrors(target: ErrorTarget, logger: Logger): void {
  target.addEventListener('error', (event: ErrorEvent) => {
    logger.error('app.uncaught_error', event.error ?? event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    logger.error('app.unhandled_rejection', event.reason);
  });
}
