import type { LogEntry, LogLevel, LogSink } from './logger';

/** Bounded in-memory buffer; the IndexedDB-backed ring buffer (ARCHITECTURE §11) builds on this. */
export class RingBufferSink implements LogSink {
  private readonly buffer: (LogEntry | undefined)[];
  private next = 0;
  private size = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`RingBufferSink capacity must be a positive integer, got ${capacity}`);
    }
    this.buffer = new Array<LogEntry | undefined>(capacity);
  }

  write(entry: LogEntry): void {
    this.buffer[this.next] = entry;
    this.next = (this.next + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  /** Oldest first. */
  entries(): LogEntry[] {
    const start = (this.next - this.size + this.capacity) % this.capacity;
    const out: LogEntry[] = [];
    for (let i = 0; i < this.size; i++) {
      const entry = this.buffer[(start + i) % this.capacity];
      if (entry) out.push(entry);
    }
    return out;
  }
}

type ConsoleLike = Pick<Console, LogLevel>;

export class ConsoleSink implements LogSink {
  constructor(
    private readonly minLevel: LogLevel = 'info',
    private readonly target: ConsoleLike = console,
  ) {}

  write(entry: LogEntry): void {
    if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[this.minLevel]) return;
    this.target[entry.level](JSON.stringify(entry));
  }
}

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };
