import { Logger, type LogEntry, type LogSink } from './logger';
import { ConsoleSink, RingBufferSink } from './sinks';

export { Logger, serializeError } from './logger';
export type { LogEntry, LogLevel, LogSink } from './logger';
export { ConsoleSink, RingBufferSink } from './sinks';
export { captureGlobalErrors } from './capture';
export { createSessionId } from './session';
export { readStoredLog, StoredLogSink } from './storedLog';

const RING_CAPACITY = 2000;

/** Forwards to a sink that only exists later, once IndexedDB has opened. */
class LateSink implements LogSink {
  private target: LogSink | undefined;

  attach(target: LogSink, backlog: readonly LogEntry[]): void {
    if (this.target) throw new Error('the app log is already stored');
    for (const entry of backlog) target.write(entry);
    this.target = target;
  }

  write(entry: LogEntry): void {
    this.target?.write(entry);
  }
}

export interface AppLog {
  readonly logger: Logger;
  readonly ring: RingBufferSink;
  /** Stores this launch's entries so far, and every later one, in `sink`. */
  persistTo(sink: LogSink): void;
}

export function createAppLog(sessionId: string, verbose: boolean): AppLog {
  const ring = new RingBufferSink(RING_CAPACITY);
  const late = new LateSink();
  const logger = new Logger([ring, late, new ConsoleSink(verbose ? 'debug' : 'info')], sessionId);
  return {
    logger,
    ring,
    persistTo: (sink) => {
      late.attach(sink, ring.entries());
    },
  };
}
