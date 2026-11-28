<script lang="ts">
  import type { ProgressDotsProps } from '../contracts/ui.ts';

  let { total, done }: ProgressDotsProps = $props();

  const safeTotal = $derived(Math.max(0, Math.floor(total)));
  const clampedDone = $derived(Math.max(0, Math.min(safeTotal, Math.floor(done))));
  const indices = $derived(Array.from({ length: safeTotal }, (_, i) => i));
</script>

<div
  class="progress-dots"
  role="img"
  aria-label={`${clampedDone} / ${safeTotal}`}
  data-total={safeTotal}
  data-done={clampedDone}
>
  {#each indices as i (i)}
    <span class="dot" class:filled={i < clampedDone} data-filled={i < clampedDone}></span>
  {/each}
</div>

<style>
  .progress-dots {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-pill);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    box-shadow: var(--shadow-soft);
  }

  .dot {
    display: inline-block;
    width: var(--space-dot-lg);
    height: var(--space-dot-lg);
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-sand);
    transition:
      background-color 180ms ease-out,
      transform 180ms ease-out;
  }

  .dot.filled {
    background-color: var(--color-semantic-success);
    transform: scale(1.08);
  }
</style>
