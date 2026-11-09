import { describe, expect, it, vi } from 'vitest';
import { captureGlobalErrors } from '../../src/log/capture';
import { Logger, serializeError, type LogEntry, type LogSink } from '../../src/log/logger';
import { ConsoleSink, RingBufferSink } from '../../src/log/sinks';

const fixedClock = (): Date => new Date('2026-11-09T08:00:00.000Z');

class CollectingSink implements LogSink {
  readonly entries: LogEntry[] = [];
  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

describe('Logger', () => {
  it('writes entries in the ARCHITECTURE §11 shape', () => {
    const sink = new CollectingSink();
    new Logger([sink], 'sess-1', null, fixedClock).forScene('House').info('house.room_tap', {
      room: 'dapur',
    });
    expect(sink.entries).toEqual([
      {
        ts: '2026-11-09T08:00:00.000Z',
        level: 'info',
        event: 'house.room_tap',
        scene: 'House',
        sessionId: 'sess-1',
        data: { room: 'dapur' },
      },
    ]);
  });

  it('serializes errors with their stack', () => {
    const sink = new CollectingSink();
    new Logger([sink], 's', null, fixedClock).error('boom', new TypeError('bad'), { step: 2 });
    const data = sink.entries[0]?.data as {
      step: number;
      error: { name: string; message: string };
    };
    expect(data.step).toBe(2);
    expect(data.error).toMatchObject({ name: 'TypeError', message: 'bad' });
  });

  it('keeps logging to other sinks and reports when one sink throws', () => {
    const good = new CollectingSink();
    const broken: LogSink = {
      write: () => {
        throw new Error('quota');
      },
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      new Logger([broken, good], 's', null, fixedClock).warn('w');
      expect(good.entries).toHaveLength(1);
      expect(consoleError).toHaveBeenCalledOnce();
      expect(String(consoleError.mock.calls[0]?.[0])).toContain('log.sink_failed');
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('serializeError', () => {
  it('handles non-Error values, including circular ones', () => {
    expect(serializeError('plain')).toEqual({ name: 'NonError', message: 'plain', stack: null });
    expect(serializeError({ code: 7 }).message).toBe('{"code":7}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeError(circular).message).toBe('[object Object]');
  });
});

describe('RingBufferSink', () => {
  const entry = (event: string): LogEntry => ({
    ts: 't',
    level: 'info',
    event,
    scene: null,
    sessionId: 's',
    data: {},
  });

  it('keeps the newest entries, oldest first', () => {
    const ring = new RingBufferSink(3);
    ['a', 'b', 'c', 'd', 'e'].forEach((e) => {
      ring.write(entry(e));
    });
    expect(ring.entries().map((e) => e.event)).toEqual(['c', 'd', 'e']);
  });

  it('returns partial contents before it wraps', () => {
    const ring = new RingBufferSink(5);
    ring.write(entry('a'));
    ring.write(entry('b'));
    expect(ring.entries().map((e) => e.event)).toEqual(['a', 'b']);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new RingBufferSink(0)).toThrow(RangeError);
  });
});

describe('ConsoleSink', () => {
  it('filters below the minimum level and writes JSON', () => {
    const target = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger = new Logger([new ConsoleSink('info', target)], 's', null, fixedClock);
    logger.debug('hidden');
    logger.info('shown');
    expect(target.debug).not.toHaveBeenCalled();
    expect(JSON.parse(String(target.info.mock.calls[0]?.[0]))).toMatchObject({ event: 'shown' });
  });
});

describe('captureGlobalErrors', () => {
  it('logs uncaught errors and unhandled rejections', () => {
    const listeners = new Map<string, (e: unknown) => void>();
    const target = {
      addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    } as unknown as Window;
    const sink = new CollectingSink();
    captureGlobalErrors(target, new Logger([sink], 's', null, fixedClock));

    listeners.get('error')?.({
      error: new Error('x'),
      message: 'x',
      filename: 'a.js',
      lineno: 1,
      colno: 2,
    });
    listeners.get('unhandledrejection')?.({ reason: 'nope' });

    expect(sink.entries.map((e) => e.event)).toEqual([
      'app.uncaught_error',
      'app.unhandled_rejection',
    ]);
    expect(sink.entries[0]?.data).toMatchObject({ source: 'a.js', line: 1, column: 2 });
  });

  it('calls onFatal for uncaught Errors only, after logging them', () => {
    const listeners = new Map<string, (e: unknown) => void>();
    const target = {
      addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    } as unknown as Window;
    const sink = new CollectingSink();
    const fatal: Error[] = [];
    captureGlobalErrors(target, new Logger([sink], 's', null, fixedClock), (err) => {
      expect(sink.entries).toHaveLength(1);
      fatal.push(err);
    });

    const boom = new Error('boom');
    listeners.get('error')?.({ error: boom, message: 'boom' });
    listeners.get('error')?.({ error: null, message: 'ResizeObserver loop completed' });
    listeners.get('unhandledrejection')?.({ reason: new Error('later') });

    expect(fatal).toEqual([boom]);
    expect(sink.entries).toHaveLength(3);
  });
});
