<script lang="ts">
  import type { SwatchProps } from '../contracts/ui.ts';

  let { label, swatch, selected, onpick }: SwatchProps = $props();
</script>

<button
  type="button"
  class="swatch"
  class:selected
  aria-label={label}
  aria-pressed={selected}
  data-swatch={swatch}
  onclick={onpick}
>
  <span class="swatch-fill" aria-hidden="true"></span>
</button>

<style>
  .swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--space-touch-primary);
    height: var(--space-touch-primary);
    padding: var(--space-sm);
    border-radius: var(--radius-pill);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    box-shadow: var(--shadow-soft);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    transition:
      transform 140ms ease-out,
      box-shadow 140ms ease-out;
  }

  .swatch:hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-lifted);
  }

  .swatch:active {
    transform: scale(0.95);
  }

  .swatch.selected {
    transform: scale(1.1);
    border-width: var(--space-border-lg);
    box-shadow: var(--shadow-hint-glow);
  }

  .swatch-fill {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-swatch-0);
  }

  .swatch[data-swatch='0'] .swatch-fill {
    background-color: var(--color-swatch-0);
  }
  .swatch[data-swatch='1'] .swatch-fill {
    background-color: var(--color-swatch-1);
  }
  .swatch[data-swatch='2'] .swatch-fill {
    background-color: var(--color-swatch-2);
  }
  .swatch[data-swatch='3'] .swatch-fill {
    background-color: var(--color-swatch-3);
  }
  .swatch[data-swatch='4'] .swatch-fill {
    background-color: var(--color-swatch-4);
  }
  .swatch[data-swatch='5'] .swatch-fill {
    background-color: var(--color-swatch-5);
  }
</style>
