<script lang="ts">
  import type { HoldButtonProps } from '../contracts/ui.ts';

  let {
    label,
    icon,
    holdMs,
    progress,
    quiet,
    onholdstart,
    onholdcancel,
    oncomplete,
  }: HoldButtonProps = $props();

  const CIRCUMFERENCE = 276.46;
  const clamped = $derived(Math.max(0, Math.min(1, progress)));
  const dashOffset = $derived(CIRCUMFERENCE * (1 - clamped));
  const isHolding = $derived(clamped > 0 && clamped < 1);
  const isComplete = $derived(clamped >= 1);

  function handlePointerDown(): void {
    onholdstart();
  }

  function handlePointerEnd(): void {
    if (isComplete) {
      oncomplete();
    } else {
      onholdcancel();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      onholdstart();
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      if (isComplete) {
        oncomplete();
      } else {
        onholdcancel();
      }
    }
  }
</script>

<button
  type="button"
  class="hold-button"
  class:quiet
  class:holding={isHolding}
  class:complete={isComplete}
  aria-label={label}
  data-icon={icon}
  data-hold-ms={holdMs}
  data-progress={clamped}
  data-quiet={quiet}
  onpointerdown={handlePointerDown}
  onpointerup={handlePointerEnd}
  onpointercancel={onholdcancel}
  onpointerleave={onholdcancel}
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
>
  <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="ring-track" cx="50" cy="50" r="44" />
    <circle
      class="ring-fill"
      cx="50"
      cy="50"
      r="44"
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={dashOffset}
    />
  </svg>
  <span class="icon-slot" aria-hidden="true">
    {#if icon.endsWith('.home')}
      <svg viewBox="0 0 64 64" class="icon-svg">
        <polygon class="roof" points="32,12 54,32 10,32" />
        <rect class="wall" x="18" y="32" width="28" height="22" rx="4" />
      </svg>
    {:else}
      <svg viewBox="0 0 64 64" class="icon-svg">
        <circle class="gear" cx="32" cy="32" r="18" />
        <circle class="gear-core" cx="32" cy="32" r="7" />
      </svg>
    {/if}
  </span>
</button>

<style>
  .hold-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--space-touch-primary);
    height: var(--space-touch-primary);
    border-radius: var(--radius-pill);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    box-shadow: var(--shadow-soft);
    padding: 0;
    cursor: pointer;
    touch-action: none;
    user-select: none;
    transition:
      transform 140ms ease-out,
      opacity 140ms ease-out,
      box-shadow 140ms ease-out;
  }

  .hold-button.quiet {
    width: var(--space-touch-secondary);
    height: var(--space-touch-secondary);
    opacity: 0.55;
    box-shadow: none;
  }

  .hold-button.quiet:hover,
  .hold-button.quiet.holding {
    opacity: 0.92;
  }

  .hold-button.holding {
    transform: scale(0.96);
    box-shadow: var(--shadow-hint-glow);
  }

  .hold-button.complete {
    box-shadow: var(--shadow-success-glow);
  }

  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .ring-track {
    fill: none;
    stroke: var(--color-palette-cream-shade);
    stroke-width: 7;
  }

  .ring-fill {
    fill: none;
    stroke: var(--color-semantic-interactive);
    stroke-width: 7;
    stroke-linecap: round;
  }

  .hold-button.complete .ring-fill {
    stroke: var(--color-semantic-success);
  }

  .icon-slot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52%;
    height: 52%;
  }

  .icon-svg {
    width: 100%;
    height: 100%;
    stroke: var(--color-palette-outline);
    stroke-width: 3.5;
    stroke-linejoin: round;
  }

  .roof {
    fill: var(--color-semantic-interactive);
  }

  .wall {
    fill: var(--color-palette-wood-warm);
  }

  .gear {
    fill: var(--color-palette-sand);
  }

  .gear-core {
    fill: var(--color-palette-cream);
  }
</style>
