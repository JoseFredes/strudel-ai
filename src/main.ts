import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';

// @ts-ignore
import {
  initAudioOnFirstClick,
  webaudioOutput,
  samples,
  registerSynthSounds,
  getAudioContext,
} from '@strudel/webaudio';
// @ts-ignore
import { evalScope, controls, repl } from '@strudel/core';
// @ts-ignore
import { transpiler } from '@strudel/transpiler';

import { EXAMPLES } from './examples';
import { generatePattern } from './ai';
import { highlightExtension, flashLocations } from './highlight';
import { parseCps, cpsToBpm, bpmToCps } from './transport';

const KEY_STORAGE = 'strudel-ai:openai-key';
const CODE_STORAGE = 'strudel-ai:code';
const CHAT_STORAGE = 'strudel-ai:chat';

type ChatMsg = {
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  id?: string;
  patchBefore?: string;
};

const statusEl = document.getElementById('status')!;
function setStatus(msg: string, kind: 'info' | 'error' | 'ok' = 'info') {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind;
}

let evaluate: (code: string) => Promise<void>;
let stop: () => void;
let strudelReady = false;

async function initStrudel(view: EditorView) {
  initAudioOnFirstClick();
  const ctx = getAudioContext();

  await evalScope(
    controls,
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/webaudio'),
  );

  await Promise.all([
    samples('github:tidalcycles/dirt-samples'),
    registerSynthSounds(),
  ]);

  const observingOutput = async (
    hap: any,
    deadline: number,
    duration: number,
    cps: number,
    t: number,
  ) => {
    const locs = hap?.context?.locations;
    if (locs && Array.isArray(locs) && locs.length) {
      const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      if (delayMs < 3000) {
        setTimeout(() => flashLocations(view, locs, 130), delayMs);
      }
    }
    return webaudioOutput(hap, deadline, duration, cps, t);
  };

  const r = repl({
    defaultOutput: observingOutput,
    getTime: () => ctx.currentTime,
    transpiler,
  });
  evaluate = r.evaluate;
  stop = r.stop;
  strudelReady = true;
}

const initialCode = localStorage.getItem(CODE_STORAGE) ?? EXAMPLES[0].code;

const view = new EditorView({
  parent: document.getElementById('editor')!,
  state: EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      highlightExtension,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          localStorage.setItem(CODE_STORAGE, update.state.doc.toString());
          syncBpmFromCode();
        }
      }),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              evalCurrent();
              return true;
            },
          },
          indentWithTab,
        ]),
      ),
    ],
  }),
});

function currentCode(): string {
  return view.state.doc.toString();
}

function setCode(code: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: code },
  });
  localStorage.setItem(CODE_STORAGE, code);
}

async function evalCurrent() {
  if (!strudelReady) {
    setStatus('strudel still loading…');
    return;
  }
  const code = currentCode();
  localStorage.setItem(CODE_STORAGE, code);
  try {
    await evaluate(code);
    setStatus('playing ♪', 'ok');
  } catch (e: any) {
    setStatus(`eval error: ${e?.message ?? e}`, 'error');
  }
}

// --- BPM / transport ---

const bpmInput = document.getElementById('bpm') as HTMLInputElement;
const bpmLabel = document.getElementById('bpm-label') as HTMLSpanElement;

function syncBpmFromCode() {
  const match = parseCps(currentCode());
  if (!match) {
    bpmInput.disabled = true;
    bpmLabel.textContent = '— BPM';
    return;
  }
  bpmInput.disabled = false;
  const bpm = cpsToBpm(match.value);
  bpmInput.value = String(Math.min(180, Math.max(60, bpm)));
  bpmLabel.textContent = `${bpm} BPM`;
}

function applyBpm(bpm: number, commit: boolean) {
  const match = parseCps(currentCode());
  if (!match) return;
  const cps = bpmToCps(bpm);
  const insert = `setcps(${cps})`;
  view.dispatch({
    changes: { from: match.from, to: match.to, insert },
  });
  bpmLabel.textContent = `${bpm} BPM`;
  if (commit && strudelReady) evalCurrent();
}

// --- chat ---

let chat: ChatMsg[] = [];
try {
  chat = JSON.parse(localStorage.getItem(CHAT_STORAGE) ?? '[]');
} catch { chat = []; }

const messagesEl = document.getElementById('messages')!;

function persistChat() {
  localStorage.setItem(CHAT_STORAGE, JSON.stringify(chat));
}

function renderChat() {
  messagesEl.innerHTML = '';
  for (const m of chat) {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    if (m.id) div.dataset.id = m.id;

    const body = document.createElement('span');
    body.className = 'msg-body';
    body.textContent = m.content;
    div.appendChild(body);

    if (m.role === 'assistant' && m.patchBefore !== undefined) {
      const btn = document.createElement('button');
      btn.className = 'revert';
      btn.textContent = '↶ revert';
      btn.title = 'Volver al estado anterior';
      btn.dataset.id = m.id ?? '';
      div.appendChild(btn);
    }
    messagesEl.appendChild(div);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(msg: ChatMsg) {
  if (!msg.id) msg.id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  chat.push(msg);
  persistChat();
  renderChat();
}

function clearChat() {
  chat = [];
  localStorage.removeItem(CHAT_STORAGE);
  renderChat();
}

function revertToTurn(id: string) {
  const msg = chat.find(m => m.id === id);
  if (!msg || msg.role !== 'assistant' || msg.patchBefore === undefined) return;
  setCode(msg.patchBefore);
  addMessage({ role: 'system', content: `↶ reverted to state before «${summarizePrevUserPrompt(id)}»` });
  evalCurrent();
}

function summarizePrevUserPrompt(assistantId: string): string {
  const idx = chat.findIndex(m => m.id === assistantId);
  for (let i = idx - 1; i >= 0; i--) {
    if (chat[i].role === 'user') {
      const text = chat[i].content;
      return text.length > 40 ? text.slice(0, 40) + '…' : text;
    }
  }
  return '?';
}

function diffSummary(before: string, after: string): string {
  const delta = after.split('\n').length - before.split('\n').length;
  if (delta > 0) return `✓ +${delta} línea${delta === 1 ? '' : 's'}`;
  if (delta < 0) return `✓ ${delta} línea${delta === -1 ? '' : 's'}`;
  return '✓ pattern actualizado';
}

// --- wiring ---

function wireControls() {
  document.getElementById('play')!.addEventListener('click', evalCurrent);
  document.getElementById('stop')!.addEventListener('click', () => {
    if (strudelReady) {
      stop();
      setStatus('stopped');
    }
  });
  document.getElementById('eval')!.addEventListener('click', evalCurrent);

  document.getElementById('clear')!.addEventListener('click', () => {
    setCode('');
    setStatus('editor cleared');
    syncBpmFromCode();
  });

  document.getElementById('clear-chat')!.addEventListener('click', clearChat);

  const select = document.getElementById('examples') as HTMLSelectElement;
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.name;
    opt.textContent = ex.name;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    const ex = EXAMPLES.find(e => e.name === select.value);
    if (ex) {
      setCode(ex.code);
      select.selectedIndex = 0;
      syncBpmFromCode();
    }
  });

  // BPM slider
  bpmInput.addEventListener('input', () => {
    const bpm = parseInt(bpmInput.value, 10);
    applyBpm(bpm, false);
  });
  bpmInput.addEventListener('change', () => {
    const bpm = parseInt(bpmInput.value, 10);
    applyBpm(bpm, true);
  });

  const keyInput = document.getElementById('apikey') as HTMLInputElement;
  const envKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  keyInput.value = envKey || localStorage.getItem(KEY_STORAGE) || '';
  if (envKey) localStorage.setItem(KEY_STORAGE, envKey);
  keyInput.addEventListener('change', () => {
    localStorage.setItem(KEY_STORAGE, keyInput.value.trim());
  });

  const promptInput = document.getElementById('prompt') as HTMLTextAreaElement;
  const generateBtn = document.getElementById('generate') as HTMLButtonElement;

  async function doGenerate() {
    const msg = promptInput.value.trim();
    const apiKey = keyInput.value.trim();
    if (!msg) return;
    if (!apiKey) {
      addMessage({ role: 'error', content: 'pega tu OpenAI key arriba' });
      return;
    }

    const before = currentCode();
    addMessage({ role: 'user', content: msg });
    promptInput.value = '';

    setStatus('generando…');
    generateBtn.disabled = true;
    try {
      const code = await generatePattern(msg, before, apiKey);
      setCode(code);
      syncBpmFromCode();
      addMessage({
        role: 'assistant',
        content: diffSummary(before, code),
        patchBefore: before,
      });
      await evalCurrent();
    } catch (e: any) {
      addMessage({ role: 'error', content: `error: ${e}` });
      setStatus(`generate failed: ${e}`, 'error');
    } finally {
      generateBtn.disabled = false;
      promptInput.focus();
    }
  }

  generateBtn.addEventListener('click', doGenerate);
  promptInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doGenerate();
    }
  });

  messagesEl.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('revert')) {
      const id = target.dataset.id;
      if (id) revertToTurn(id);
    }
  });

  renderChat();
  syncBpmFromCode();
}

(async () => {
  wireControls();
  setStatus('cargando samples…');
  try {
    await initStrudel(view);
    setStatus('listo — click Play o Ctrl/Cmd+Enter', 'ok');
  } catch (e: any) {
    setStatus(`strudel init failed: ${e?.message ?? e}`, 'error');
  }
})();
