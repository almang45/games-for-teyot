<script lang="ts">
  import type { SliderProps } from '../contracts/ui.ts';

  let { label, value, min, max, step, onchange }: SliderProps = $props();

  function handleInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    const parsed = Number(target.value);
    if (!Number.isNaN(parsed)) {
      onchange(parsed);
    }
  }
</script>

<label class="slider">
  <span class="slider-header">
    <span class="slider-label">{label}</span>
    <span class="slider-value">{value}</span>
  </span>
  <input
    class="slider-input"
    type="range"
    aria-label={label}
    {value}
    {min}
    {max}
    {step}
    oninput={handleInput}
  />
</label>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background-color: var(--color-parent-surface);
    color: var(--color-parent-text);
    font-family: var(--font-family-body);
    font-size: var(--font-size-md);
  }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .slider-label {
    font-weight: var(--font-weight-bold);
  }

  .slider-value {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    color: var(--color-parent-accent);
  }

  .slider-input {
    width: 100%;
    min-height: var(--space-xl);
    accent-color: var(--color-parent-accent);
    cursor: pointer;
  }
</style>
