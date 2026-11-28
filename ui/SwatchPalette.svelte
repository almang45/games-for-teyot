<script lang="ts">
  import type { SwatchPaletteProps } from '../contracts/ui.ts';
  import Swatch from './Swatch.svelte';

  let { selected, onpick }: SwatchPaletteProps = $props();

  const SWATCH_NAMES = ['merah', 'kuning', 'biru', 'hijau', 'merah-muda', 'ungu'] as const;
</script>

<div class="swatch-palette" role="group" aria-label="Warna">
  {#each SWATCH_NAMES as name, index (name)}
    <Swatch
      label={name}
      swatch={index}
      selected={selected === index}
      onpick={() => {
        onpick(index);
      }}
    />
  {/each}
</div>

<style>
  .swatch-palette {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    box-shadow: var(--shadow-soft);
  }
</style>
