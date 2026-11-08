export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogData = Readonly<Record<string, unknown>>;

/** Shape fixed by docs/ARCHITECTURE.md §11; the parent area exports these verbatim. */
export interface LogEntry {
  readonly ts: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly scene: string | null;
  readonly sessionId: string;
  readonly data: LogData;
}

export interface LogSink {
  write(entry: LogEntry): void;
}

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack ?? null };
  }
  return { name: 'NonError', message: safeStringify(err), stack: null };
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    // JSON.stringify returns undefined for functions and undefined, despite its declared type.
    const json = JSON.stringify(value) as string | undefined;
    return json ?? String(value);
  } catch {
    // Circular or exotic values: fall back to the engine's own coercion.
    return Object.prototype.toString.call(value);
  }
}

export class Logger {
  constructor(
    private readonly sinks: readonly LogSink[],
    private readonly sessionId: string,
    private readonly scene: string | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** A logger that stamps every entry with the given scene key. */
  forScene(scene: string): Logger {
    return new Logger(this.sinks, this.sessionId, scene, this.now);
  }

  debug(event: string, data: LogData = {}): void {
    this.emit('debug', event, data);
  }

  info(event: string, data: LogData = {}): void {
    this.emit('info', event, data);
  }

  warn(event: string, data: LogData = {}): void {
    this.emit('warn', event, data);
  }

  error(event: string, err: unknown, data: LogData = {}): void {
    this.emit('error', event, { ...data, error: serializeError(err) });
  }

  private emit(level: LogLevel, event: string, data: LogData): void {
    const entry: LogEntry = {
      ts: this.now().toISOString(),
      level,
      event,
      scene: this.scene,
      sessionId: this.sessionId,
      data,
    };
    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch (sinkErr) {
        // A broken sink must not take the game down, but it must not vanish either.
        console.error(
          JSON.stringify({
            ...entry,
            level: 'error',
            event: 'log.sink_failed',
            data: { error: serializeError(sinkErr) },
          }),
        );
      }
    }
  }
}
