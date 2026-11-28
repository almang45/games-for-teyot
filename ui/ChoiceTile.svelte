<script lang="ts">
  import type { ChoiceTileProps } from '../contracts/ui.ts';

  let { label, content, state, onpick }: ChoiceTileProps = $props();

  const isLocked = $derived(state === 'locked');

  function handleClick(): void {
    if (!isLocked) {
      onpick();
    }
  }
</script>

<button
  type="button"
  class="choice-tile"
  class:active={state === 'active'}
  class:success={state === 'success'}
  class:hint={state === 'hint'}
  class:locked={isLocked}
  aria-label={label}
  aria-pressed={state === 'active'}
  disabled={isLocked}
  data-state={state}
  data-content-kind={content.kind}
  onclick={handleClick}
>
  {#if content.kind === 'text'}
    <span class="tile-text">{content.text}</span>
  {:else}
    <span class="tile-asset" data-asset-key={content.key} aria-hidden="true"></span>
  {/if}
</button>

<style>
  .choice-tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-touch-primary);
    min-height: var(--space-touch-primary);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-palette-paper);
    color: var(--color-palette-outline);
    box-shadow: var(--shadow-soft);
    font-family: var(--font-family-display);
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-bold);
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    transition:
      transform 140ms ease-out,
      box-shadow 140ms ease-out,
      background-color 140ms ease-out;
  }

  .choice-tile:hover:not(:disabled) {
    transform: scale(1.04);
    box-shadow: var(--shadow-lifted);
  }

  .choice-tile:active:not(:disabled) {
    transform: scale(0.95);
  }

  .choice-tile.active {
    background-color: var(--color-palette-sun-gold);
  }

  .choice-tile.success {
    background-color: var(--color-semantic-success);
    color: var(--color-palette-cream);
    box-shadow: var(--shadow-success-glow);
  }

  .choice-tile.hint {
    box-shadow: var(--shadow-hint-glow);
    border-color: var(--color-semantic-hint);
  }

  .choice-tile.locked {
    background-color: var(--color-semantic-locked);
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  .tile-text {
    display: inline-block;
  }

  .tile-asset {
    display: block;
    width: 100%;
    height: 100%;
    min-width: var(--space-touch-secondary);
    min-height: var(--space-touch-secondary);
    background-position: center;
    background-repeat: no-repeat;
    background-size: contain;
  }
</style>
