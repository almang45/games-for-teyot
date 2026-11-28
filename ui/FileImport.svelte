<script lang="ts">
  import type { FileImportProps } from '../contracts/ui.ts';

  let { label, accept, state, message, onfile }: FileImportProps = $props();

  const isReading = $derived(state === 'reading');

  function handleChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      onfile(file);
    }
  }
</script>

<div
  class="file-import"
  class:reading={isReading}
  class:error={state === 'error'}
  class:done={state === 'done'}
  data-state={state}
>
  <label class="file-trigger" class:disabled={isReading}>
    <span class="file-label">{label}</span>
    <input
      class="file-input"
      type="file"
      {accept}
      disabled={isReading}
      aria-label={label}
      onchange={handleChange}
    />
  </label>

  {#if message}
    <p class="file-message" role={state === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  {/if}
</div>

<style>
  .file-import {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    font-family: var(--font-family-body);
    color: var(--color-parent-text);
  }

  .file-trigger {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--space-touch-secondary);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    border: var(--space-border-sm) solid var(--color-palette-outline);
    background-color: var(--color-parent-accent);
    color: var(--color-parent-accent-text);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
  }

  .file-trigger.disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .file-import.done .file-trigger {
    background-color: var(--color-semantic-success);
  }

  .file-import.error .file-trigger {
    border-color: var(--color-semantic-hint);
    box-shadow: var(--shadow-hint-glow);
  }

  .file-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .file-message {
    margin: 0;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    background-color: var(--color-parent-surface);
    font-size: var(--font-size-sm);
  }
</style>
