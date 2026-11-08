import { describe, expect, it, vi } from 'vitest';
import { playPlaceholderChime, unlockAudio } from '../../src/engine/audio/unlock';

function fakeContext(initial: AudioContextState, afterResume: AudioContextState) {
  const ctx = {
    state: initial,
    currentTime: 1,
    destination: {},
    resume: vi.fn(() => {
      ctx.state = afterResume;
      return Promise.resolve();
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      osc.connect.mockImplementation(() => gain);
      return osc;
    }),
    createGain: vi.fn(() => gain),
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  return { ctx, gain, asAudio: ctx as unknown as AudioContext };
}

describe('unlockAudio (US-AUD-01)', () => {
  it('resumes a suspended context', async () => {
    const { ctx, asAudio } = fakeContext('suspended', 'running');
    await unlockAudio(asAudio);
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it('does nothing when already running', async () => {
    const { ctx, asAudio } = fakeContext('running', 'running');
    await unlockAudio(asAudio);
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('fails loudly when the context stays suspended', async () => {
    const { asAudio } = fakeContext('suspended', 'suspended');
    await expect(unlockAudio(asAudio)).rejects.toThrow(/state: suspended/);
  });
});

describe('playPlaceholderChime', () => {
  it('schedules three notes from the current time', () => {
    const { ctx, gain, asAudio } = fakeContext('running', 'running');
    playPlaceholderChime(asAudio);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
    const starts = ctx.createOscillator.mock.results.map(
      (r) => (r.value as { start: { mock: { calls: number[][] } } }).start.mock.calls[0]?.[0],
    );
    expect(starts).toEqual([1, 1.12, 1.24]);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
  });
});
