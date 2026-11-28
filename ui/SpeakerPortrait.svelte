<script lang="ts">
  import type { SpeakerPortraitProps } from '../contracts/ui.ts';

  let { speaker, mouth, state }: SpeakerPortraitProps = $props();

  const isHidden = $derived(state === 'hidden');

  /** Maps (state, mouth) to the #48 5×2 spritesheet frame index (0..7). */
  const frameIndex = $derived.by((): number => {
    if (state === 'talking') {
      return 2 + mouth;
    }
    if (state === 'smile') {
      return 5;
    }
    if (state === 'encourage') {
      return 6;
    }
    return 0;
  });

  const colPercent = $derived((frameIndex % 5) * 25);
  const rowPercent = $derived(Math.floor(frameIndex / 5) * 100);
</script>

<div
  class="speaker-portrait"
  class:hidden={isHidden}
  class:talking={state === 'talking'}
  class:smile={state === 'smile'}
  class:encourage={state === 'encourage'}
  class:mama={speaker === 'mama'}
  class:papa={speaker === 'papa'}
  role="img"
  aria-label={speaker}
  aria-hidden={isHidden}
  data-speaker={speaker}
  data-mouth={mouth}
  data-state={state}
  data-frame={frameIndex}
>
  <span
    class="sprite"
    style:background-position={`${colPercent}% ${rowPercent}%`}
    aria-hidden="true"
  ></span>
</div>

<style>
  .speaker-portrait {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--space-portrait);
    height: var(--space-portrait);
    border-radius: var(--radius-pill);
    border: var(--space-border-md) solid var(--color-palette-outline);
    background-color: var(--color-palette-cream);
    box-shadow: var(--shadow-soft);
    overflow: hidden;
    transition:
      opacity 180ms ease-out,
      transform 180ms ease-out,
      box-shadow 180ms ease-out;
  }

  .speaker-portrait.hidden {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.92);
  }

  .speaker-portrait.talking {
    box-shadow: var(--shadow-lifted);
  }

  .speaker-portrait.smile {
    box-shadow: var(--shadow-success-glow);
  }

  .speaker-portrait.encourage {
    box-shadow: var(--shadow-hint-glow);
  }

  .sprite {
    display: block;
    width: 100%;
    height: 100%;
    background-repeat: no-repeat;
    background-size: 500% 200%;
  }

  .speaker-portrait.mama .sprite {
    background-image: var(--sprite-mama-portrait);
  }

  .speaker-portrait.papa .sprite {
    background-image: var(--sprite-papa-portrait);
  }
</style>
