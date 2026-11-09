/**
 * Browsers keep an AudioContext suspended until a user gesture. The context is created at startup
 * (silent) and resumed inside the "Mulai" tap handler (PRD US-AUD-01).
 */
// Generous next to the 300 ms target: a slow resume should still play, only a hung one is cut off.
export const UNLOCK_TIMEOUT_MS = 1000;

export async function unlockAudio(
  context: AudioContext,
  timeoutMs: number = UNLOCK_TIMEOUT_MS,
): Promise<void> {
  if (context.state === 'running') return;
  // resume() can stay pending forever (no valid user activation, Safari interruption); never let
  // that hold the start screen hostage.
  await withTimeout(context.resume(), timeoutMs, 'AudioContext.resume()');
  // resume() can settle without starting (e.g. iOS interruption); re-read the live state.
  const state = context.state as AudioContextState;
  if (state !== 'running') {
    throw new Error(`AudioContext did not start after the gesture (state: ${state})`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} did not settle within ${ms} ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Code-generated stand-in for the welcome clip until Mama's recordings land (AUDIO.md). */
export function playPlaceholderChime(context: AudioContext): void {
  const start = context.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5, a friendly major arpeggio
  notes.forEach((frequency, i) => {
    const at = start + i * 0.12;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    osc.connect(gain).connect(context.destination);
    osc.start(at);
    osc.stop(at + 0.42);
  });
}
