export interface LatencySummary {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

/** Rolling window of input-to-frame times in ms, for the spike's < 30 ms target (NFR). */
export class LatencyMeter {
  private readonly capacity: number;
  private samples: number[] = [];

  constructor(capacity = 240) {
    this.capacity = capacity;
  }

  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  summary(): LatencySummary | undefined {
    if (this.samples.length === 0) return undefined;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const rank = (q: number): number => sorted[Math.ceil(q * sorted.length) - 1] ?? 0;
    return {
      count: sorted.length,
      p50: round(rank(0.5)),
      p95: round(rank(0.95)),
      max: round(sorted.at(-1) ?? 0),
    };
  }

  reset(): void {
    this.samples = [];
  }
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
