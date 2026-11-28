<script lang="ts">
  import type { StepperProps } from '../contracts/ui.ts';

  let { label, value, min, max, step, unit, onchange }: StepperProps = $props();

  const atMin = $derived(value <= min);
  const atMax = $derived(value >= max);

  function decrement(): void {
    const next = Math.max(min, value - step);
    if (next !== value) {
      onchange(next);
    }
  }

  function increment(): void {
    const next = Math.min(max, value + step);
    if (next !== value) {
      onchange(next);
    }
  }
</script>

<div class="stepper" role="group" aria-label={label}>
  <span class="stepper-label">{label}</span>
  <div class="stepper-controls">
    <button
      type="button"
      class="step-btn"
      aria-label={`Kurangi ${label}`}
      disabled={atMin}
      onclick={decrement}
    >
      −
    </button>
    <output class="step-value" aria-live="polite">
      {unit ? `${value} ${unit}` : value}
    </output>
    <button
      type="button"
      class="step-btn"
      aria-label={`Tambah ${label}`}
      disabled={atMax}
      onclick={increment}
    >
      +
    </button>
  </div>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background-color: var(--color-parent-surface);
    color: var(--color-parent-text);
    font-family: var(--font-family-body);
    font-size: var(--font-size-md);
  }

  .stepper-label {
    font-weight: var(--font-weight-bold);
  }

  .stepper-controls {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .step-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-touch-secondary);
    min-height: var(--space-touch-secondary);
    border-radius: var(--radius-md);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    color: var(--color-parent-text);
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
  }

  .step-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .step-value {
    min-width: var(--space-touch-primary);
    text-align: center;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }
</style>
