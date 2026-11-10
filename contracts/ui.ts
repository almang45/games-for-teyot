/**
 * Props and events of the presentational `ui/` components (WORKFLOW.md §3, design brief §5).
 * A component declares `let props: <Name>Props = $props()` with the type imported from here.
 * Events are callback props (`on<event>`), Svelte 5 style. Components hold no logic: `src/`
 * decides every state and reacts to every event.
 */

/** Visual states the game sets (brief §1). `hover` and `pressed` are CSS, not props. */
export type InteractiveState = 'idle' | 'active' | 'success' | 'hint' | 'locked';

/** Accessible name for icon-only controls. Never rendered as text for Theia. */
type Label = string;

/** A `ui.*` manifest key. */
type UiAssetKey = `ui.${string}`;

export interface BigButtonProps {
  readonly label: Label;
  readonly icon: UiAssetKey;
  /** `boot` is the giant ≥ 240 dp Mulai button; `primary` is ≥ 96 dp. */
  readonly size: 'boot' | 'primary';
  readonly state: InteractiveState;
  readonly onpress: () => void;
}

export interface HoldButtonProps {
  readonly label: Label;
  readonly icon: UiAssetKey;
  /** How long to hold, ms. The ring fills over this time. */
  readonly holdMs: number;
  /** 0–1, driven by `src/` so the ring and the logic never disagree. */
  readonly progress: number;
  readonly quiet: boolean;
  readonly onholdstart: () => void;
  readonly onholdcancel: () => void;
  readonly oncomplete: () => void;
}

export interface SpeakerPortraitProps {
  readonly speaker: 'mama' | 'papa';
  /** 0 closed, 1 half, 2 open: picked from the clip's live loudness. */
  readonly mouth: 0 | 1 | 2;
  readonly state: 'hidden' | 'idle' | 'talking' | 'smile' | 'encourage';
}

export interface ChoiceTileProps {
  readonly label: Label;
  /** A digit or word the game renders, never baked into art. */
  readonly content:
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'asset'; readonly key: string };
  readonly state: InteractiveState;
  readonly onpick: () => void;
}

export interface SwatchProps {
  readonly label: Label;
  /** A `color.swatches` index. */
  readonly swatch: number;
  readonly selected: boolean;
  readonly onpick: () => void;
}

export interface SwatchPaletteProps {
  readonly selected: number;
  readonly onpick: (swatch: number) => void;
}

export interface ProgressDotsProps {
  readonly total: number;
  readonly done: number;
}

export interface KeypadProps {
  /** The three digits shown as text for the parent to tap (PRD OVL-PARENT-GATE). */
  readonly prompt: readonly [number, number, number];
  readonly entered: readonly number[];
  readonly state: 'idle' | 'wrong' | 'accepted';
  readonly ondigit: (digit: number) => void;
  readonly oncancel: () => void;
}

export interface StepperProps {
  readonly label: Label;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
  readonly onchange: (value: number) => void;
}

export interface ToggleProps {
  readonly label: Label;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onchange: (checked: boolean) => void;
}

export interface SliderProps {
  readonly label: Label;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onchange: (value: number) => void;
}

export interface SegmentedControlProps<T extends string = string> {
  readonly label: Label;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onchange: (value: T) => void;
}

export interface FileImportProps {
  readonly label: Label;
  /** MIME types or extensions, as for `<input accept>`. */
  readonly accept: string;
  readonly state: 'idle' | 'reading' | 'error' | 'done';
  /** Plain adult text from `content/strings.id.json`, shown in the error state. */
  readonly message?: string;
  readonly onfile: (file: File) => void;
}

export interface MasteryBadgeProps {
  /** Leitner box 1–5 (PRD parent progress). */
  readonly box: 1 | 2 | 3 | 4 | 5;
  readonly label: Label;
}

/** Every `ui/` component and its props type; validate:design rejects any other file name. */
export const UI_COMPONENTS = [
  'BigButton',
  'HoldButton',
  'SpeakerPortrait',
  'ChoiceTile',
  'Swatch',
  'SwatchPalette',
  'ProgressDots',
  'Keypad',
  'Stepper',
  'Toggle',
  'Slider',
  'SegmentedControl',
  'FileImport',
  'MasteryBadge',
] as const;

export type UiComponent = (typeof UI_COMPONENTS)[number];
