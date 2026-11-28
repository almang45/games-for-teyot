<script lang="ts">
  import type { MasteryBadgeProps } from '../contracts/ui.ts';

  let { box, label }: MasteryBadgeProps = $props();

  const LEVELS = [1, 2, 3, 4, 5] as const;
</script>

<div class="mastery-badge" role="img" aria-label={`${label}: ${box} / 5`} data-box={box}>
  <span class="badge-label">{label}</span>
  <span class="badge-pips" aria-hidden="true">
    {#each LEVELS as level (level)}
      <span class="pip" class:filled={level <= box}></span>
    {/each}
  </span>
</div>

<style>
  .mastery-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-parent-surface);
    color: var(--color-parent-text);
    font-family: var(--font-family-body);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  .badge-pips {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .pip {
    display: inline-block;
    width: var(--space-dot-sm);
    height: var(--space-dot-sm);
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-sand);
  }

  .pip.filled {
    background-color: var(--color-semantic-success);
  }

  .mastery-badge[data-box='1'] .pip.filled {
    background-color: var(--color-semantic-hint);
  }
</style>
