/**
 * Stand-in colors for code-generated placeholders only. Real screens use design/tokens.json via
 * src/design once Antigravity delivers it (AGENTS.md: placeholders unblock logic).
 */
export const placeholderPalette = {
  /** Also the shell: canvas, page, splash, and status bar (theme_color). */
  sky: 0xfff4e6,
  floor: 0xf2d4a8,
  wallLeft: 0xf7c6c7,
  wallRight: 0xe8a5a8,
  outline: 0x6b4f4f,
  highlight: 0xfff59d,
  button: 0xff8a80,
  buttonPressed: 0xe57373,
  theia: 0xffb74d,
  installWarning: 0xffe0b2,
  text: '#5d4037',
  textOnButton: '#ffffff',
} as const;

/** `0xfff4e6` → `#fff4e6`, for the manifest, index.html, and CSS. */
export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * `top` drawn at `alpha` over `bottom`, as one opaque color. Overlapping shapes in one Graphics
 * would otherwise blend twice where they meet.
 */
export function mixColor(top: number, bottom: number, alpha: number): number {
  const a = Math.min(1, Math.max(0, alpha));
  let mixed = 0;
  for (const shift of [16, 8, 0]) {
    const t = (top >> shift) & 0xff;
    const b = (bottom >> shift) & 0xff;
    mixed |= Math.round(t * a + b * (1 - a)) << shift;
  }
  return mixed;
}

export const placeholderFont = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
