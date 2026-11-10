// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestedSpike } from '../../src/platform/launch';
import {
  SPIKE_DEFAULTS,
  SPIKE_ITEMS,
  SPIKE_SLIDERS,
  sliderValue,
  type SpikeSettings,
} from '../../src/spike/tracing';
import {
  createTracingPanel,
  formatReadout,
  type PanelOptions,
  type PanelReadout,
} from '../../src/spike/tracingPanel';

const readout: PanelReadout = {
  item: 'Circle',
  stroke: '1/1',
  latency: { count: 12, p50: 9.5, p95: 18, max: 22.4 },
  contact: { type: 'touch', width: 21.6, height: 24.2 },
  ignored: { palm: 1, 'second-pointer': 2, 'out-of-reach': 3 },
  fps: 119.6,
};

describe('tracing spike setup (US-TRACE-00)', () => {
  it('offers a vertical stroke, a circle and the digit 1', () => {
    expect(SPIKE_ITEMS.map((i) => i.glyph.id)).toEqual([
      'stroke.vertical',
      'stroke.circle',
      'digit.1',
    ]);
  });

  it('starts every slider inside its range', () => {
    for (const spec of SPIKE_SLIDERS) {
      expect(SPIKE_DEFAULTS[spec.key]).toBeGreaterThanOrEqual(spec.min);
      expect(SPIKE_DEFAULTS[spec.key]).toBeLessThanOrEqual(spec.max);
    }
  });

  it('clamps and snaps slider values', () => {
    const corridor = SPIKE_SLIDERS.find((s) => s.key === 'corridor');
    if (!corridor) throw new Error('no corridor slider');
    expect(sliderValue(corridor, '0.123')).toBe(0.12);
    expect(sliderValue(corridor, '9')).toBe(0.3);
    expect(sliderValue(corridor, '-1')).toBe(0.04);
    expect(sliderValue(corridor, 'abc')).toBe(0.04);
  });

  it.each([
    ['', undefined],
    ['?browser=1', undefined],
    ['?browser=1&spike=', undefined],
    ['?browser=1&spike=tracing', 'tracing'],
    ['?spike=coloring', 'unknown'],
  ])('reads the spike from %j', (search, spike) => {
    expect(requestedSpike(search)).toBe(spike);
  });
});

describe('tracing spike panel', () => {
  const mocks = () => ({
    items: SPIKE_ITEMS,
    settings: SPIKE_DEFAULTS,
    onSettings: vi.fn<(settings: SpikeSettings) => void>(),
    onSettled: vi.fn<(settings: SpikeSettings) => void>(),
    onItem: vi.fn<(id: string) => void>(),
    onRestart: vi.fn<() => void>(),
  });
  let options: ReturnType<typeof mocks> & PanelOptions;

  beforeEach(() => {
    document.body.innerHTML = '';
    options = mocks();
  });

  const input = (name: string): HTMLInputElement => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!el) throw new Error(`no input ${name}`);
    return el;
  };

  it('changes a setting live while a slider moves, and logs it once let go', () => {
    createTracingPanel(document.body, options);
    const corridor = input('corridor');
    expect(corridor.value).toBe('0.12');
    corridor.value = '0.2';
    corridor.dispatchEvent(new Event('input'));
    const expected: SpikeSettings = { ...SPIKE_DEFAULTS, corridor: 0.2 };
    expect(options.onSettings).toHaveBeenLastCalledWith(expected);
    expect(options.onSettled).not.toHaveBeenCalled();
    corridor.dispatchEvent(new Event('change'));
    expect(options.onSettled).toHaveBeenLastCalledWith(expected);
    expect(corridor.parentElement?.querySelector('output')?.textContent).toBe('0.2');
  });

  it('toggles the corridor and the finger trail', () => {
    createTracingPanel(document.body, options);
    const trail = input('showTrail');
    expect(trail.checked).toBe(false);
    trail.checked = true;
    trail.dispatchEvent(new Event('change'));
    expect(options.onSettings).toHaveBeenLastCalledWith({ ...SPIKE_DEFAULTS, showTrail: true });
    expect(options.onSettled).toHaveBeenCalledTimes(1);
  });

  it('picks an item, restarts, and folds away', () => {
    createTracingPanel(document.body, options);
    document.querySelector<HTMLButtonElement>('button[data-item="circle"]')?.click();
    expect(options.onItem).toHaveBeenCalledWith('circle');
    const buttons = [...document.querySelectorAll('button')];
    buttons.find((b) => b.textContent === 'Restart')?.click();
    expect(options.onRestart).toHaveBeenCalledTimes(1);
    const body = document.querySelector<HTMLElement>('.spike-panel__body');
    buttons.find((b) => b.textContent === 'Debug')?.click();
    expect(body?.hidden).toBe(true);
  });

  it('shows the readout and is removed on destroy', () => {
    const panel = createTracingPanel(document.body, options);
    panel.show(readout);
    expect(document.querySelector('[data-testid="tracing-readout"]')?.textContent).toBe(
      formatReadout(readout),
    );
    panel.destroy();
    expect(document.querySelector('.spike-panel')).toBeNull();
  });

  it('formats latency, contact size and ignored touches', () => {
    expect(formatReadout(readout).split('\n')).toEqual([
      'Circle, stroke 1/1',
      'input→frame p50 9.5 · p95 18 · max 22.4 ms (n 12)',
      'last touch touch 22×24 px',
      'ignored palm 1 · 2nd finger 2 · away 3',
      '120 fps',
    ]);
    expect(formatReadout({ ...readout, latency: undefined, contact: undefined })).toContain(
      'input→frame no samples yet\nlast touch none yet',
    );
  });
});
