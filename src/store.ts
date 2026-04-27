import { syncActiveCode } from './slots';

export type AppState = {
  code: string;
  isPlaying: boolean;
  cps: number;
  apiKey: string;
};

type Listener = (state: AppState) => void;

const KEY_STORAGE = 'loopcraft:openai-key';
const CODE_STORAGE = 'loopcraft:code';

const envKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() ?? '';

class AppStore {
  private _state: AppState = {
    code: localStorage.getItem(CODE_STORAGE) ?? '',
    isPlaying: false,
    cps: 0.5,
    apiKey: envKey || localStorage.getItem(KEY_STORAGE) || '',
  };

  private listeners = new Set<Listener>();

  get state(): Readonly<AppState> { return this._state; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn(this._state));
  }

  setCode(code: string) {
    this._state = { ...this._state, code };
    localStorage.setItem(CODE_STORAGE, code);
    syncActiveCode(code);
    this.notify();
  }

  setPlaying(isPlaying: boolean, cps?: number) {
    this._state = { ...this._state, isPlaying, ...(cps !== undefined ? { cps } : {}) };
    this.notify();
  }

  setApiKey(key: string) {
    this._state = { ...this._state, apiKey: key };
    localStorage.setItem(KEY_STORAGE, key);
  }
}

export const store = new AppStore();
