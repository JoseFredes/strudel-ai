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
  ready = false;

  // Always returns the current AudioContext — never a stale reference
  get ctx(): AudioContext | null {
    return getAudioContext() as AudioContext | null;
  }

  // Must be called synchronously inside a user-gesture handler (click, keydown)
  // WKWebView requires resume() to happen within the event handler stack, not async
  resumeCtx(): void {
    this.ctx?.resume().catch(() => {});
  }

  async init(view: View, canvas: HTMLCanvasElement) {
    initAudioOnFirstClick();

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

    const ctx = getAudioContext() as AudioContext;
    initVisualizer(ctx);
    startVisualizer(canvas);

    const observingOutput = async (
      hap: any, deadline: number, duration: number, cps: number, t: number,
    ) => {
      const locs = hap?.context?.locations;
      if (locs?.length) {
        const now = (getAudioContext() as AudioContext).currentTime;
        const delay = Math.max(0, (t - now) * 1000);
        if (delay < 3000) setTimeout(() => flashLocations(view as any, locs, 130), delay);
      }
      store.setPlaying(true, cps);
      return webaudioOutput(hap, deadline, duration, cps, t);
    };

    const r = repl({
      defaultOutput: observingOutput,
      getTime: () => (getAudioContext() as AudioContext).currentTime,
      transpiler,
    });
    this._evaluate = r.evaluate;
    this._stop = r.stop;
    this.ready = true;

    store.subscribe(s => setVisualizerState(s.isPlaying, s.cps));
  }

  async evaluate(code: string): Promise<void> {
    if (!this.ready || !this._evaluate) throw new Error('engine not ready');
    await this._evaluate(code);
    store.setPlaying(true);
  }

  stop() {
    if (!this.ready || !this._stop) return;
    this._stop();
    store.setPlaying(false);
  }

  // Safe to call from async context (e.g. visibilitychange)
  async ensureRunning(): Promise<void> {
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running') await ctx.resume();
  }
}

export const engine = new Engine();
