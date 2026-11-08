/**
 * Browsers keep an AudioContext suspended until a user gesture. The context is created at startup
 * (silent) and resumed inside the "Mulai" tap handler (PRD US-AUD-01).
 */
export async function unlockAudio(context: AudioContext): Promise<void> {
  if (context.state === 'running') return;
  await context.resume();
  // resume() can settle without starting (e.g. iOS interruption); re-read the live state.
  const state = context.state as AudioContextState;
  if (state !== 'running') {
    throw new Error(`AudioContext did not start after the gesture (state: ${state})`);
  }
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
