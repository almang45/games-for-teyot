<script lang="ts">
  import type { ToggleProps } from '../contracts/ui.ts';

  let { label, checked, disabled = false, onchange }: ToggleProps = $props();

  function handleToggle(): void {
    if (!disabled) {
      onchange(!checked);
    }
  }
</script>

<button
  type="button"
  class="toggle"
  class:checked
  class:disabled
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={handleToggle}
>
  <span class="toggle-label">{label}</span>
  <span class="toggle-track" aria-hidden="true">
    <span class="toggle-thumb"></span>
  </span>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    border: var(--space-border-sm) solid var(--color-palette-sand);
    background-color: var(--color-parent-surface);
    color: var(--color-parent-text);
    font-family: var(--font-family-body);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    text-align: left;
  }

  .toggle.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .toggle-track {
    display: inline-flex;
    align-items: center;
    width: var(--space-touch-secondary);
    min-height: var(--space-xl);
    padding: var(--space-xs);
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-sand);
    transition: background-color 140ms ease-out;
    justify-content: flex-start;
  }

  .toggle.checked .toggle-track {
    background-color: var(--color-parent-accent);
    justify-content: flex-end;
  }

  .toggle-thumb {
    display: block;
    width: var(--space-dot-lg);
    height: var(--space-dot-lg);
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
  }
</style>
