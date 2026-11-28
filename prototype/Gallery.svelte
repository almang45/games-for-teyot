<script lang="ts">
  import type { InteractiveState } from '../contracts/ui.ts';
  import BigButton from '../ui/BigButton.svelte';
  import ChoiceTile from '../ui/ChoiceTile.svelte';
  import FileImport from '../ui/FileImport.svelte';
  import HoldButton from '../ui/HoldButton.svelte';
  import Keypad from '../ui/Keypad.svelte';
  import MasteryBadge from '../ui/MasteryBadge.svelte';
  import ProgressDots from '../ui/ProgressDots.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Slider from '../ui/Slider.svelte';
  import SpeakerPortrait from '../ui/SpeakerPortrait.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Swatch from '../ui/Swatch.svelte';
  import SwatchPalette from '../ui/SwatchPalette.svelte';
  import Toggle from '../ui/Toggle.svelte';

  const STATES: readonly InteractiveState[] = ['idle', 'active', 'success', 'hint', 'locked'];

  let lastEvent = $state('Ready — interact with any component below.');
  let selectedSwatch = $state(0);
  let holdProgress = $state(0.45);
  let enteredDigits = $state<number[]>([7]);
  let sessionMinutes = $state(10);
  let unlockT1 = $state(false);
  let tolerance = $state(3);
  let narrator = $state('mama');

  function log(msg: string): void {
    lastEvent = msg;
  }

  function handleDigit(d: number): void {
    enteredDigits = enteredDigits.length >= 3 ? [d] : [...enteredDigits, d];
    log(`Keypad digit: ${d} (entered: ${enteredDigits.join(', ')})`);
  }
</script>

<main class="gallery">
  <header class="gallery-header">
    <h1>Rumah Cici Theia — M1 UI Component Gallery</h1>
    <p class="event-log" role="status">{lastEvent}</p>
  </header>

  <section class="card">
    <h2>BigButton (boot &amp; primary, all 5 InteractiveStates)</h2>
    <div class="row">
      <BigButton
        label="Mulai"
        icon="ui.play"
        size="boot"
        state="idle"
        onpress={() => log('BigButton boot pressed')}
      />
      {#each STATES as st (st)}
        <div class="item">
          <BigButton
            label={`Aksi ${st}`}
            icon="ui.undo"
            size="primary"
            state={st}
            onpress={() => log(`BigButton (${st}) pressed`)}
          />
          <span class="caption">{st}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>HoldButton (idle, holding, complete, quiet)</h2>
    <div class="row">
      {#each [0, 0.45, 1] as prog (prog)}
        <div class="item">
          <HoldButton
            label={`Pulang ${prog}`}
            icon="ui.home"
            holdMs={1000}
            progress={prog}
            quiet={false}
            onholdstart={() => log(`HoldButton start (${prog})`)}
            onholdcancel={() => log(`HoldButton cancel (${prog})`)}
            oncomplete={() => log(`HoldButton complete (${prog})`)}
          />
          <span class="caption">progress {prog}</span>
        </div>
      {/each}
      <div class="item">
        <HoldButton
          label="Orang tua"
          icon="ui.parent"
          holdMs={1000}
          progress={holdProgress}
          quiet={true}
          onholdstart={() => log('Quiet HoldButton start')}
          onholdcancel={() => log('Quiet HoldButton cancel')}
          oncomplete={() => log('Quiet HoldButton complete')}
        />
        <span class="caption">quiet</span>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>SpeakerPortrait (Mama &amp; Papa — #48 spritesheets, all states &amp; mouths)</h2>
    <div class="row">
      <div class="item">
        <SpeakerPortrait speaker="mama" mouth={0} state="idle" />
        <span class="caption">mama idle</span>
      </div>
      {#each [0, 1, 2] as m (m)}
        <div class="item">
          <SpeakerPortrait speaker="mama" mouth={m as 0 | 1 | 2} state="talking" />
          <span class="caption">mama talking ({m})</span>
        </div>
      {/each}
      <div class="item">
        <SpeakerPortrait speaker="mama" mouth={0} state="smile" />
        <span class="caption">mama smile</span>
      </div>
      <div class="item">
        <SpeakerPortrait speaker="mama" mouth={0} state="encourage" />
        <span class="caption">mama encourage</span>
      </div>
      <div class="item">
        <SpeakerPortrait speaker="papa" mouth={2} state="talking" />
        <span class="caption">papa talking (2)</span>
      </div>
      <div class="item">
        <SpeakerPortrait speaker="papa" mouth={0} state="smile" />
        <span class="caption">papa smile</span>
      </div>
      <div class="item">
        <SpeakerPortrait speaker="mama" mouth={0} state="hidden" />
        <span class="caption">hidden</span>
      </div>
    </div>
  </section>

  <section class="card">
    <h2>ChoiceTile (text &amp; asset, all 5 states)</h2>
    <div class="row">
      {#each STATES as st, idx (st)}
        <div class="item">
          <ChoiceTile
            label={`Pilihan ${idx + 1}`}
            content={{ kind: 'text', text: String(idx + 1) }}
            state={st}
            onpick={() => log(`ChoiceTile ${idx + 1} (${st}) picked`)}
          />
          <span class="caption">{st}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>Swatch &amp; SwatchPalette (6 Indonesian swatches)</h2>
    <div class="row">
      <Swatch
        label="merah"
        swatch={0}
        selected={true}
        onpick={() => log('Single Swatch merah picked')}
      />
      <SwatchPalette
        selected={selectedSwatch}
        onpick={(i) => {
          selectedSwatch = i;
          log(`SwatchPalette picked index ${i}`);
        }}
      />
    </div>
  </section>

  <section class="card">
    <h2>ProgressDots (0/3, 1/3, 2/3, 3/3)</h2>
    <div class="row">
      {#each [0, 1, 2, 3] as d (d)}
        <ProgressDots total={3} done={d} />
      {/each}
    </div>
  </section>

  <section class="card">
    <h2>Keypad (idle, wrong, accepted)</h2>
    <div class="row">
      <Keypad
        prompt={[7, 2, 9]}
        entered={enteredDigits}
        state="idle"
        ondigit={handleDigit}
        oncancel={() => log('Keypad cancelled')}
      />
      <Keypad
        prompt={[7, 2, 9]}
        entered={[7, 1, 9]}
        state="wrong"
        ondigit={handleDigit}
        oncancel={() => log('Keypad wrong cancelled')}
      />
      <Keypad
        prompt={[7, 2, 9]}
        entered={[7, 2, 9]}
        state="accepted"
        ondigit={handleDigit}
        oncancel={() => log('Keypad accepted cancelled')}
      />
    </div>
  </section>

  <section class="card">
    <h2>Parent Settings &amp; Data Controls</h2>
    <div class="stack">
      <Stepper
        label="Durasi sesi"
        value={sessionMinutes}
        min={5}
        max={20}
        step={5}
        unit="menit"
        onchange={(v) => {
          sessionMinutes = v;
          log(`Stepper: ${v} menit`);
        }}
      />
      <Toggle
        label="Buka latihan huruf (T1)"
        checked={unlockT1}
        onchange={(c) => {
          unlockT1 = c;
          log(`Toggle: ${c}`);
        }}
      />
      <Toggle label="Terkunci (disabled)" checked={true} disabled={true} onchange={() => {}} />
      <Slider
        label="Toleransi garis"
        value={tolerance}
        min={1}
        max={5}
        step={1}
        onchange={(v) => {
          tolerance = v;
          log(`Slider: ${v}`);
        }}
      />
      <SegmentedControl
        label="Suara narator"
        options={[
          { value: 'mama', label: 'Mama' },
          { value: 'papa', label: 'Papa' },
          { value: 'alt', label: 'Bergantian' },
        ]}
        value={narrator}
        onchange={(v) => {
          narrator = v;
          log(`SegmentedControl: ${v}`);
        }}
      />
      <div class="row">
        <FileImport
          label="Impor (idle)"
          accept=".json"
          state="idle"
          onfile={(f) => log(`FileImport: ${f.name}`)}
        />
        <FileImport
          label="Membaca..."
          accept=".json"
          state="reading"
          message="Sedang membaca cadangan..."
          onfile={() => {}}
        />
        <FileImport
          label="Impor (error)"
          accept=".json"
          state="error"
          message="Berkas tidak dikenali."
          onfile={() => {}}
        />
        <FileImport
          label="Impor (done)"
          accept=".json"
          state="done"
          message="Cadangan berhasil dipulihkan."
          onfile={() => {}}
        />
      </div>
      <div class="row">
        {#each [1, 2, 3, 4, 5] as b (b)}
          <MasteryBadge box={b as 1 | 2 | 3 | 4 | 5} label={`Kotak ${b}`} />
        {/each}
      </div>
    </div>
  </section>
</main>

<style>
  .gallery {
    max-width: 1120px;
    margin: 0 auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .gallery-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .gallery-header h1 {
    margin: 0;
    font-size: 28px;
  }

  .event-log {
    margin: 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--color-palette-paper);
    border: 2px solid var(--color-palette-sand);
    font-size: 16px;
  }

  .card {
    background: var(--color-palette-cream);
    border: 3px solid var(--color-palette-outline);
    border-radius: 20px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .card h2 {
    margin: 0;
    font-size: 20px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 680px;
  }

  .item {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .caption {
    font-size: 13px;
    color: var(--color-palette-slate-calm);
  }
</style>
