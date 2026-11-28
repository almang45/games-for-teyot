<script lang="ts">
  import type { BigButtonProps } from '../contracts/ui.ts';

  let { label, icon, size, state, onpress }: BigButtonProps = $props();

  const isLocked = $derived(state === 'locked');

  function handleClick(): void {
    if (!isLocked) {
      onpress();
    }
  }
</script>

<button
  type="button"
  class="big-button"
  class:boot={size === 'boot'}
  class:primary={size === 'primary'}
  class:active={state === 'active'}
  class:success={state === 'success'}
  class:hint={state === 'hint'}
  class:locked={isLocked}
  aria-label={label}
  aria-pressed={state === 'active'}
  disabled={isLocked}
  data-icon={icon}
  data-size={size}
  data-state={state}
  onclick={handleClick}
>
  <span class="icon-frame" aria-hidden="true">
    {#if icon.endsWith('.play') || icon.endsWith('.start')}
      <svg viewBox="0 0 64 64" class="icon-svg">
        <polygon points="22,14 52,32 22,50" />
      </svg>
    {:else if icon.endsWith('.undo') || icon.endsWith('.oops')}
      <svg viewBox="0 0 64 64" class="icon-svg icon-stroke">
        <path d="M24 22 L12 32 L24 42" fill="none" />
        <path d="M14 32 H38 C46 32 52 38 52 46" fill="none" />
      </svg>
    {:else if icon.endsWith('.home')}
      <svg viewBox="0 0 64 64" class="icon-svg">
        <polygon points="32,12 54,32 10,32" />
        <rect x="18" y="32" width="28" height="22" rx="4" />
      </svg>
    {:else}
      <svg viewBox="0 0 64 64" class="icon-svg">
        <polygon points="32,10 38,26 55,26 41,36 46,52 32,42 18,52 23,36 9,26 26,26" />
      </svg>
    {/if}
  </span>
</button>

<style>
  .big-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-semantic-interactive);
    color: var(--color-palette-cream);
    box-shadow: var(--shadow-soft);
    cursor: pointer;
    padding: 0;
    transition:
      transform 140ms ease-out,
      box-shadow 140ms ease-out,
      background-color 140ms ease-out;
    touch-action: manipulation;
    user-select: none;
  }

  .big-button.primary {
    width: var(--space-touch-primary);
    height: var(--space-touch-primary);
  }

  .big-button.boot {
    width: var(--space-touch-boot);
    height: var(--space-touch-boot);
    border-width: var(--space-border-lg);
    box-shadow: var(--shadow-lifted);
    animation: breathe var(--motion-boot-breathe, 2400ms) ease-in-out infinite;
  }

  .big-button:hover:not(:disabled) {
    transform: scale(1.04);
    box-shadow: var(--shadow-lifted);
  }

  .big-button:active:not(:disabled) {
    transform: scale(0.95);
    box-shadow: var(--shadow-soft);
  }

  .big-button.active {
    background-color: var(--color-palette-sun-gold);
    color: var(--color-palette-outline);
  }

  .big-button.success {
    background-color: var(--color-semantic-success);
    box-shadow: var(--shadow-success-glow);
  }

  .big-button.hint {
    box-shadow: var(--shadow-hint-glow);
    animation: hint-pulse var(--motion-hud-speaker-pulse, 1600ms) ease-in-out infinite;
  }

  .big-button.locked {
    background-color: var(--color-semantic-locked);
    opacity: 0.65;
    cursor: not-allowed;
    animation: none;
    box-shadow: none;
  }

  .icon-frame {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56%;
    height: 56%;
  }

  .icon-svg {
    width: 100%;
    height: 100%;
    fill: currentcolor;
    stroke: var(--color-palette-outline);
    stroke-width: 3;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .icon-stroke {
    fill: none;
    stroke: currentcolor;
    stroke-width: 6;
  }

  @keyframes breathe {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.04);
    }
  }

  @keyframes hint-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.06);
    }
  }
</style>
