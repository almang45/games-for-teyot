<script lang="ts">
  import type { SegmentedControlProps } from '../contracts/ui.ts';

  let { label, options, value, onchange }: SegmentedControlProps = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class="segment"
      class:selected={option.value === value}
      role="radio"
      aria-checked={option.value === value}
      onclick={() => {
        onchange(option.value);
      }}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    align-items: stretch;
    gap: var(--space-xs);
    padding: var(--space-xs);
    border-radius: var(--radius-md);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream-shade);
    font-family: var(--font-family-body);
  }

  .segment {
    flex: 1 1 auto;
    min-height: var(--space-touch-secondary);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    border: var(--space-border-sm) solid transparent;
    background-color: transparent;
    color: var(--color-parent-text);
    font-family: inherit;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    transition:
      background-color 140ms ease-out,
      color 140ms ease-out;
  }

  .segment.selected {
    background-color: var(--color-parent-accent);
    color: var(--color-parent-accent-text);
    border-color: var(--color-palette-outline);
  }
</style>
