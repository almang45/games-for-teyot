import type { LatencySummary } from '../engine/tracing/latency';
import type { IgnoreReason } from '../engine/tracing/pointerGate';
import { SPIKE_SLIDERS, sliderValue, type SpikeItem, type SpikeSettings } from './tracing';

export interface PanelReadout {
  readonly item: string;
  readonly stroke: string;
  readonly latency: LatencySummary | undefined;
  readonly contact:
    { readonly type: string; readonly width: number; readonly height: number } | undefined;
  readonly ignored: Readonly<Record<IgnoreReason, number>>;
  readonly fps: number;
}

export interface PanelOptions {
  readonly items: readonly SpikeItem[];
  readonly settings: SpikeSettings;
  /** Every slider move, so the change is felt on the next stroke sample. */
  readonly onSettings: (settings: SpikeSettings) => void;
  /** Once a slider or toggle is let go, for the log. */
  readonly onSettled: (settings: SpikeSettings) => void;
  readonly onItem: (id: string) => void;
  readonly onRestart: () => void;
}

export interface TracingPanel {
  show(readout: PanelReadout): void;
  destroy(): void;
}

/**
 * The spike's debug panel (PRD US-TRACE-00): a developer tool for Papa, not a game screen, so it
 * is plain DOM here rather than a `ui/` component.
 */
export function createTracingPanel(parent: HTMLElement, options: PanelOptions): TracingPanel {
  const doc = parent.ownerDocument;
  let settings = options.settings;
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = '',
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.textContent = text;
    return node;
  };

  const panel = el('aside');
  panel.className = 'spike-panel';
  panel.dataset.testid = 'tracing-panel';
  const toggle = el('button', 'Debug');
  toggle.type = 'button';
  toggle.className = 'spike-panel__toggle';
  const body = el('div');
  body.className = 'spike-panel__body';
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
  });

  const items = el('div');
  items.className = 'spike-panel__row';
  for (const item of options.items) {
    const button = el('button', item.label);
    button.type = 'button';
    button.dataset.item = item.id;
    button.addEventListener('click', () => {
      options.onItem(item.id);
    });
    items.append(button);
  }
  const restart = el('button', 'Restart');
  restart.type = 'button';
  restart.addEventListener('click', options.onRestart);
  items.append(restart);
  body.append(items);

  for (const spec of SPIKE_SLIDERS) {
    const label = el('label');
    const name = el('span', spec.label);
    const value = el('output', String(settings[spec.key]));
    const input = el('input');
    input.type = 'range';
    input.name = spec.key;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(settings[spec.key]);
    input.addEventListener('input', () => {
      settings = { ...settings, [spec.key]: sliderValue(spec, input.value) };
      value.textContent = String(settings[spec.key]);
      options.onSettings(settings);
    });
    input.addEventListener('change', () => {
      options.onSettled(settings);
    });
    label.append(name, input, value);
    body.append(label);
  }

  for (const key of ['showCorridor', 'showTrail'] as const) {
    const label = el('label');
    label.className = 'spike-panel__check';
    const input = el('input');
    input.type = 'checkbox';
    input.name = key;
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings = { ...settings, [key]: input.checked };
      options.onSettings(settings);
      options.onSettled(settings);
    });
    label.append(input, el('span', key === 'showCorridor' ? 'Show corridor' : 'Show finger trail'));
    body.append(label);
  }

  const readout = el('pre');
  readout.className = 'spike-panel__readout';
  readout.dataset.testid = 'tracing-readout';
  body.append(readout);
  panel.append(toggle, body);
  parent.append(panel);

  return {
    show(r: PanelReadout): void {
      readout.textContent = formatReadout(r);
    },
    destroy(): void {
      panel.remove();
    },
  };
}

export function formatReadout(r: PanelReadout): string {
  const latency = r.latency
    ? `p50 ${r.latency.p50} · p95 ${r.latency.p95} · max ${r.latency.max} ms (n ${r.latency.count})`
    : 'no samples yet';
  const contact = r.contact
    ? `${r.contact.type} ${Math.round(r.contact.width)}×${Math.round(r.contact.height)} px`
    : 'none yet';
  const ignored = `palm ${r.ignored.palm} · 2nd finger ${r.ignored['second-pointer']} · away ${r.ignored['out-of-reach']}`;
  return [
    `${r.item}, stroke ${r.stroke}`,
    `input→frame ${latency}`,
    `last touch ${contact}`,
    `ignored ${ignored}`,
    `${Math.round(r.fps)} fps`,
  ].join('\n');
}
