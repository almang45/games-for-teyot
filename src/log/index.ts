import { Logger } from './logger';
import { ConsoleSink, RingBufferSink } from './sinks';

export { Logger, serializeError } from './logger';
export type { LogEntry, LogLevel, LogSink } from './logger';
export { ConsoleSink, RingBufferSink } from './sinks';
export { captureGlobalErrors } from './capture';
export { createSessionId } from './session';

const RING_CAPACITY = 2000;

export interface AppLog {
  readonly logger: Logger;
  readonly ring: RingBufferSink;
}

export function createAppLog(sessionId: string, verbose: boolean): AppLog {
  const ring = new RingBufferSink(RING_CAPACITY);
  const logger = new Logger([ring, new ConsoleSink(verbose ? 'debug' : 'info')], sessionId);
  return { logger, ring };
}
