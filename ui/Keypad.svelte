<script lang="ts">
  import type { KeypadProps } from '../contracts/ui.ts';

  let { prompt, entered, state, ondigit, oncancel }: KeypadProps = $props();

  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
  const SLOTS = [0, 1, 2] as const;
</script>

<div
  class="keypad"
  class:wrong={state === 'wrong'}
  class:accepted={state === 'accepted'}
  role="dialog"
  aria-modal="true"
  aria-label={`Ketuk ${prompt[0]}, ${prompt[1]}, ${prompt[2]}`}
  data-state={state}
>
  <div class="keypad-header">
    <p class="prompt">Ketuk {prompt[0]}, {prompt[1]}, {prompt[2]}</p>
    <button type="button" class="close-button" aria-label="Tutup" onclick={oncancel}>
      <span aria-hidden="true">×</span>
    </button>
  </div>

  <div class="entered-row" aria-live="polite">
    {#each SLOTS as slot (slot)}
      <span class="entry-slot" class:filled={entered[slot] !== undefined}>
        {entered[slot] ?? '•'}
      </span>
    {/each}
  </div>

  <div class="digit-grid">
    {#each DIGITS as digit (digit)}
      <button
        type="button"
        class="digit-button"
        onclick={() => {
          ondigit(digit);
        }}
      >
        {digit}
      </button>
    {/each}
  </div>
</div>

<style>
  .keypad {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-parent-surface);
    color: var(--color-parent-text);
    box-shadow: var(--shadow-lifted);
    font-family: var(--font-family-body);
  }

  .keypad.wrong {
    border-color: var(--color-semantic-hint);
    box-shadow: var(--shadow-hint-glow);
  }

  .keypad.accepted {
    border-color: var(--color-semantic-success);
    box-shadow: var(--shadow-success-glow);
  }

  .keypad-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .prompt {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  .close-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-touch-secondary);
    min-height: var(--space-touch-secondary);
    border-radius: var(--radius-pill);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    color: var(--color-parent-text);
    font-size: var(--font-size-xl);
    cursor: pointer;
  }

  .entered-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
  }

  .entry-slot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-touch-secondary);
    min-height: var(--space-touch-secondary);
    border-radius: var(--radius-md);
    border: var(--space-border-sm) solid var(--color-palette-sand);
    background-color: var(--color-palette-paper);
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
  }

  .entry-slot.filled {
    border-color: var(--color-parent-accent);
    color: var(--color-parent-accent);
  }

  .digit-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-sm);
  }

  .digit-button {
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
    touch-action: manipulation;
  }

  .digit-button:active {
    background-color: var(--color-parent-accent);
    color: var(--color-parent-accent-text);
  }
</style>
