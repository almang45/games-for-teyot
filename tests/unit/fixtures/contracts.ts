import type { HouseLayout } from '../../../contracts/houseLayout';
import type { Manifest } from '../../../contracts/manifest';
import { REQUIRED_MOMENTS, type Motion } from '../../../contracts/motion';
import type { LayoutElement, ScreenLayout } from '../../../contracts/screenLayout';
import type { LayoutScreen } from '../../../contracts/screens';
import type { Tokens } from '../../../contracts/tokens';

/** Fresh copies, so a test can mutate its document freely. */
const clone = <T>(v: T): T => structuredClone(v);

/**
 * Two ground-floor rooms side by side (sharing the x = 1100 edge), stairs from the living room up
 * to the bedroom on Lt Atas.
 */
const HOUSE: HouseLayout = {
  version: 1,
  size: [1920, 1200],
  rooms: [
    {
      id: 'ruang-keluarga',
      activities: ['coloring', 'tidy'],
      polygon: [
        [1100, 780],
        [1650, 780],
        [1650, 1020],
        [1100, 1020],
      ],
      walk: [
        [1100, 820],
        [1600, 820],
        [1600, 980],
        [1100, 980],
      ],
      stand: [1350, 900],
      storey: 0,
      focus: [1000, 700, 700, 400],
      parking: { bubu: [1250, 900], ocica: [1450, 900] },
    },
    {
      id: 'dapur',
      activities: ['counting'],
      polygon: [
        [350, 780],
        [1100, 780],
        [1100, 1020],
        [350, 1020],
      ],
      walk: [
        [400, 820],
        [1100, 820],
        [1100, 980],
        [400, 980],
      ],
      stand: [750, 900],
      storey: 0,
      focus: [300, 700, 850, 400],
      parking: { bubu: [650, 900], ocica: [850, 900] },
    },
    {
      id: 'kamar-tidur',
      activities: ['tracing', 'bedtime'],
      polygon: [
        [1100, 280],
        [1650, 280],
        [1650, 520],
        [1100, 520],
      ],
      walk: [
        [1100, 320],
        [1600, 320],
        [1600, 480],
        [1100, 480],
      ],
      stand: [1350, 400],
      storey: 2,
      focus: [1000, 200, 700, 400],
      parking: { bubu: [1250, 400], ocica: [1450, 400] },
    },
  ],
  spots: {
    fridge: { room: 'dapur', rect: [500, 650, 120, 160] },
    'sticker-wall': { room: 'kamar-tidur', rect: [1200, 250, 100, 60] },
  },
  occluders: [{ key: 'house.occluders.railing', sortY: 480 }],
  props: [
    {
      key: 'house.props.dapur.kulkas',
      storey: 0,
      room: 'dapur',
      rect: [480, 600, 160, 240],
      base: [
        [560, 780],
        [630, 815],
        [560, 835],
        [490, 815],
      ],
    },
  ],
  waypoints: [
    { id: 'pintu-dapur', pos: [1100, 900], storey: 0 },
    { id: 'tangga-bawah', pos: [1550, 850], storey: 0, stair: true },
    { id: 'tangga-atas', pos: [1550, 400], storey: 2, stair: true },
  ],
  edges: [
    ['dapur', 'pintu-dapur'],
    ['pintu-dapur', 'ruang-keluarga'],
    ['ruang-keluarga', 'tangga-bawah'],
    ['tangga-bawah', 'tangga-atas'],
    ['tangga-atas', 'kamar-tidur'],
  ],
  start: 'ruang-keluarga',
};

export const houseFixture = (): HouseLayout => clone(HOUSE);

const element = (
  key: string,
  bounds: LayoutElement['bounds'],
  extra: Partial<LayoutElement> = {},
): LayoutElement => ({
  key,
  bounds,
  depth: 10,
  ...extra,
});

/** A valid activity-screen layout; tablet and phone differ only in tap-target size. */
export function screenFixture(screen: LayoutScreen = 'SCR-TRACE'): ScreenLayout {
  return {
    version: 1,
    screen,
    devices: {
      tablet: [
        element('hud-home', [100, 1000, 140, 140], { interactive: 'primary', asset: 'ui.home' }),
        element('hud-speaker', [100, 80, 200, 200], { interactive: 'secondary' }),
        element('parent-gate', [1700, 80, 120, 120], { interactive: 'secondary' }),
        element('main', [400, 150, 1100, 900], { depth: 1, anchor: [0.5, 1] }),
      ],
      phone: [
        element('hud-home', [100, 860, 280, 280], { interactive: 'primary', asset: 'ui.home' }),
        element('hud-speaker', [100, 80, 220, 220], { interactive: 'secondary' }),
        element('parent-gate', [1610, 80, 220, 220], { interactive: 'secondary' }),
        element('main', [400, 150, 1100, 900], { depth: 1 }),
      ],
    },
  };
}

const TOKENS: Tokens = {
  version: 1,
  color: {
    palette: { cream: '#fff8e7', ink: '#3b2f2f', pink: '#f8bbd0' },
    // The six co-signed in #22, in palette-bar order.
    swatches: [
      { name: 'merah', hex: '#e53935' },
      { name: 'kuning', hex: '#fdd835' },
      { name: 'biru', hex: '#1e88e5' },
      { name: 'hijau', hex: '#43a047' },
      { name: 'oranye', hex: '#fb8c00' },
      { name: 'merah-muda', hex: '#f06292' },
    ],
    semantic: { interactive: '#ffb300', success: '#66bb6a', hint: '#fff59d', locked: '#b0bec5' },
    backdrop: '#fff8e7',
    tracing: {
      surface: '#1e3a34',
      guide: '#3f6b60',
      dots: '#ffd54f',
      ink: '#ffffff',
      hint: '#fff59d',
    },
    sky: {
      morning: { tint: '#ffe0b2', strength: 0.2 },
      noon: { tint: '#ffffff', strength: 0 },
      afternoon: { tint: '#ffcc80', strength: 0.25 },
      dusk: { tint: '#5c6bc0', strength: 0.45 },
    },
    parent: { surface: '#ffffff', text: '#333333', accent: '#00695c', 'accent-text': '#ffffff' },
  },
  font: {
    family: { body: 'font.andika', display: 'font.andika' },
    size: { body: 18, title: 28 },
    weight: { regular: 400, bold: 700 },
  },
  space: { s: 8, m: 16, l: 32 },
  radius: { button: 24, tile: 32 },
  shadow: { soft: { x: 0, y: 4, blur: 12, spread: 0, color: '#3b2f2f', opacity: 0.2 } },
  z: { hud: 10, overlay: 100 },
};

export const tokensFixture = (): Tokens => clone(TOKENS);

/** Every required moment at its kind's typical length, inside the brief's caps. */
export function motionFixture(): Motion {
  const moments: Motion['moments'] = {};
  for (const [name, rule] of Object.entries(REQUIRED_MOMENTS)) {
    const duration = 'min' in rule ? rule.min : 'max' in rule ? rule.max : 400;
    moments[name] = { kind: rule.kind, duration, easing: 'Sine.easeInOut' };
  }
  moments['house.bubu-follow'] = {
    kind: 'transition',
    duration: 300,
    easing: 'Sine.easeOut',
    delay: -150,
  };
  moments['boot.breathe'] = { kind: 'ambient', duration: 2400, easing: 'Sine.easeInOut' };
  return { version: 1, moments };
}

export const manifestFixture = (): Manifest => ({
  version: 1,
  assets: [
    {
      key: 'character.theia.default',
      type: 'spritesheet',
      path: 'character/theia/default.png',
      frame: [256, 256],
      animations: { 'idle.fr': { frames: [0, 3], fps: 6, loop: true } },
      room: 'global',
    },
    {
      key: 'counting.objects.apel',
      type: 'image',
      path: 'counting/objects/apel.png',
      room: 'dapur',
    },
    {
      key: 'counting.containers.mangkuk',
      type: 'image',
      path: 'counting/containers/mangkuk.png',
      dropZone: [96, 96, 320, 192],
      room: 'dapur',
    },
    { key: 'house.layout', type: 'layout', path: 'house/layout.json', room: 'global' },
    { key: 'font.andika', type: 'font', path: 'fonts/andika-regular.woff2', room: 'global' },
    { key: 'ui.home', type: 'image', path: 'ui/home.png', room: 'global' },
  ],
});
