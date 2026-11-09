import type { Logger } from './logger';

type ErrorTarget = Pick<Window, 'addEventListener'>;

/** Chromium reports this notice through window.onerror; layout settles on the next frame. */
const BENIGN_ERROR_MESSAGES = [/^ResizeObserver loop/];

/**
 * Routes uncaught errors and unhandled rejections into the structured log (ARCHITECTURE §11), then
 * calls `onFatal` (NFR-REL-01). A throw in a scene, an input handler, or a promise nobody awaited
 * lands here outside any try/catch of ours, and whatever the thrown value is, the game may be half
 * torn down, so every one of them is fatal except the known benign notices.
 */
export function captureGlobalErrors(
  target: ErrorTarget,
  logger: Logger,
  onFatal: (reason: unknown) => void = () => undefined,
): void {
  target.addEventListener('error', (event: ErrorEvent) => {
    const reason: unknown = event.error ?? event.message;
    logger.error('app.uncaught_error', reason, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
    const benign =
      event.error == null && BENIGN_ERROR_MESSAGES.some((re) => re.test(event.message));
    if (!benign) onFatal(reason);
  });
  target.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    logger.error('app.unhandled_rejection', reason);
    onFatal(reason);
  });
}
