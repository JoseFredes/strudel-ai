// @ts-ignore
import { initAudioOnFirstClick, webaudioOutput, samples, registerSynthSounds, getAudioContext } from '@strudel/webaudio';
// @ts-ignore
import { evalScope, controls, repl } from '@strudel/core';
// @ts-ignore
import { transpiler } from '@strudel/transpiler';

import { flashLocations } from './highlight';
import { initVisualizer, startVisualizer, setVisualizerState } from './visualizer';
import { store } from './store';

type View = { state: { doc: { toString(): string } } };

class Engine {
  private _evaluate: ((code: string) => Promise<void>) | null = null;
  private _stop: (() => void) | null = null;
  ctx: AudioContext | null = null;
  ready = false;

  async init(view: View, canvas: HTMLCanvasElement) {
    initAudioOnFirstClick();
    this.ctx = getAudioContext() as AudioContext;

    await evalScope(
      controls,
      import('@strudel/core'),
      import('@strudel/mini'),
      import('@strudel/webaudio'),
      import('@strudel/midi').catch(() => null),
    );

    await Promise.all([
      samples('github:tidalcycles/dirt-samples'),
      registerSynthSounds(),
    ]);

    initVisualizer(this.ctx);
    startVisualizer(canvas);

    const ctx = this.ctx;
    const observingOutput = async (
      hap: any, deadline: number, duration: number, cps: number, t: number,
    ) => {
      const locs = hap?.context?.locations;
      if (locs?.length) {
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        if (delay < 3000) setTimeout(() => flashLocations(view as any, locs, 130), delay);
      }
      store.setPlaying(true, cps);
      return webaudioOutput(hap, deadline, duration, cps, t);
    };

    const r = repl({ defaultOutput: observingOutput, getTime: () => ctx.currentTime, transpiler });
    this._evaluate = r.evaluate;
    this._stop = r.stop;
    this.ready = true;

    store.subscribe(s => setVisualizerState(s.isPlaying, s.cps));
  }

  async ensureRunning(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }

  async evaluate(code: string): Promise<void> {
    if (!this.ready || !this._evaluate) throw new Error('engine not ready');
    await this.ensureRunning();
    await this._evaluate(code);
    store.setPlaying(true);
  }

  stop() {
    if (!this.ready || !this._stop) return;
    this._stop();
    store.setPlaying(false);
  }
}

export const engine = new Engine();
