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
import { generatePattern, explainPattern, generateVariations, savePatch, openPatch } from './ai';
import { highlightExtension, flashLocations } from './highlight';
import { parseCps, cpsToBpm, bpmToCps } from './transport';
import { historyPush, historyBack, historyForward, historyCanBack, historyCanForward } from './history';
import { getSlot, getActiveIdx, setSlotName, activateSlot, syncActiveCode } from './slots';
import { initVisualizer, startVisualizer, setVisualizerState } from './visualizer';
import { strudelCompletions } from './completions';

const KEY_STORAGE = 'strudel-ai:openai-key';
const CODE_STORAGE = 'strudel-ai:code';
const CHAT_STORAGE = 'strudel-ai:chat';

// ── Types ────────────────────────────────

type MsgRole = 'user' | 'assistant' | 'variation' | 'error' | 'system';
type ChatMsg = {
  role: MsgRole;
  content: string;
  id?: string;
  patchBefore?: string;
  varCode?: string;
};

// ── Status ───────────────────────────────

const statusEl = document.getElementById('status')!;
function setStatus(msg: string, kind: 'info' | 'error' | 'ok' = 'info') {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind;
}

// ── Strudel engine ───────────────────────

let evaluate: (code: string) => Promise<void>;
let stop: () => void;
let strudelReady = false;
let currentCps = 0.5;
let isPlaying = false;

async function initStrudel(view: EditorView) {
  initAudioOnFirstClick();
  const ctx = getAudioContext() as AudioContext;

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

  const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
  initVisualizer(ctx);
  startVisualizer(canvas);

  const observingOutput = async (
    hap: any, deadline: number, duration: number, cps: number, t: number,
  ) => {
    const locs = hap?.context?.locations;
    if (locs && Array.isArray(locs) && locs.length) {
      const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      if (delayMs < 3000) setTimeout(() => flashLocations(view, locs, 130), delayMs);
    }
    currentCps = cps;
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
  setVisualizerState(false, currentCps);
}

// ── Editor ───────────────────────────────

const initialCode = localStorage.getItem(CODE_STORAGE) ?? getSlot(0).code;
historyPush(initialCode);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const view = new EditorView({
  parent: document.getElementById('editor')!,
  state: EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      highlightExtension,
      strudelCompletions,
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        const code = update.state.doc.toString();
        localStorage.setItem(CODE_STORAGE, code);
        syncActiveCode(code);
        syncBpmFromCode();
        updateSlotButtons();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => historyPush(code), 1500);
      }),
      Prec.highest(
        keymap.of([
          { key: 'Mod-Enter', run: () => { evalCurrent(); return true; } },
          {
            key: 'Mod-z',
            run: () => {
              const code = historyBack();
              if (code !== null) { setCode(code); updateHistoryButtons(); }
              return true;
            },
          },
          indentWithTab,
        ]),
      ),
    ],
  }),
});

function currentCode() { return view.state.doc.toString(); }

function setCode(code: string) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
  localStorage.setItem(CODE_STORAGE, code);
  syncActiveCode(code);
}

async function evalCurrent() {
  if (!strudelReady) { setStatus('strudel still loading…'); return; }
  const code = currentCode();
  try {
    await evaluate(code);
    isPlaying = true;
    setVisualizerState(true, currentCps);
    setStatus('playing ♪', 'ok');
  } catch (e: any) {
    setStatus(`eval error: ${e?.message ?? e}`, 'error');
  }
}

// ── BPM / transport ──────────────────────

const bpmInput = document.getElementById('bpm') as HTMLInputElement;
const bpmLabel = document.getElementById('bpm-label') as HTMLSpanElement;

function syncBpmFromCode() {
  const match = parseCps(currentCode());
  if (!match) { bpmInput.disabled = true; bpmLabel.textContent = '— BPM'; return; }
  bpmInput.disabled = false;
  const bpm = cpsToBpm(match.value);
  bpmInput.value = String(Math.min(200, Math.max(60, bpm)));
  bpmLabel.textContent = `${bpm} BPM`;
}

function applyBpm(bpm: number, commit: boolean) {
  const match = parseCps(currentCode());
  if (!match) return;
  const cps = bpmToCps(bpm);
  view.dispatch({ changes: { from: match.from, to: match.to, insert: `setcps(${cps})` } });
  bpmLabel.textContent = `${bpm} BPM`;
  if (commit && strudelReady) evalCurrent();
}

// Tap tempo
const tapTimes: number[] = [];
function handleTap() {
  const now = performance.now();
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();
  if (tapTimes.length < 2) { setStatus('tap again…'); return; }
  const intervals = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60000 / avgMs);
  if (bpm < 60 || bpm > 200) return;
  bpmInput.value = String(bpm);
  applyBpm(bpm, isPlaying);
  setStatus(`tap: ${bpm} BPM`, 'ok');
}

// ── History buttons ──────────────────────

const histBackBtn = document.getElementById('hist-back') as HTMLButtonElement;
const histFwdBtn = document.getElementById('hist-fwd') as HTMLButtonElement;

function updateHistoryButtons() {
  histBackBtn.disabled = !historyCanBack();
  histFwdBtn.disabled = !historyCanForward();
}

// ── Slots ────────────────────────────────

function updateSlotButtons() {
  const active = getActiveIdx();
  document.querySelectorAll<HTMLButtonElement>('.slot').forEach((btn, i) => {
    btn.classList.toggle('active', i === active);
    btn.classList.toggle('has-code', !!getSlot(i).code.trim());
    const name = getSlot(i).name;
    btn.textContent = name.slice(0, 4);
  });
}

// ── Recording ────────────────────────────

let mediaRecorder: MediaRecorder | null = null;
let recordChunks: Blob[] = [];
const recordBtn = document.getElementById('record') as HTMLButtonElement;

async function toggleRecord() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  try {
    const stream = await (navigator.mediaDevices as any).getDisplayMedia({
      audio: true, video: false,
    });
    recordChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `strudel-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      recordBtn.classList.remove('recording');
      recordBtn.textContent = '⏺ Rec';
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      setStatus('recording saved', 'ok');
    };
    mediaRecorder.start();
    recordBtn.classList.add('recording');
    recordBtn.textContent = '⏹ Stop';
    setStatus('recording…');
  } catch (e: any) {
    setStatus(`recording unavailable: ${e?.message ?? e}`, 'error');
  }
}

// ── Chat ─────────────────────────────────

let chat: ChatMsg[] = [];
try { chat = JSON.parse(localStorage.getItem(CHAT_STORAGE) ?? '[]'); } catch { chat = []; }

const messagesEl = document.getElementById('messages')!;

function persistChat() { localStorage.setItem(CHAT_STORAGE, JSON.stringify(chat)); }

function renderChat() {
  messagesEl.innerHTML = '';
  for (const m of chat) {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    if (m.id) div.dataset.id = m.id;

    if (m.role === 'variation' && m.varCode !== undefined) {
      const label = document.createElement('div');
      label.className = 'var-label';
      label.textContent = m.content;
      const body = document.createElement('span');
      body.className = 'msg-body';
      body.textContent = m.varCode.slice(0, 130) + (m.varCode.length > 130 ? '…' : '');
      div.appendChild(label);
      div.appendChild(body);
      div.title = 'Click to apply this variation';
    } else {
      const body = document.createElement('span');
      body.className = 'msg-body';
      body.textContent = m.content;
      div.appendChild(body);
    }

    if (m.role === 'assistant' && m.patchBefore !== undefined) {
      const btn = document.createElement('button');
      btn.className = 'revert';
      btn.textContent = '↶';
      btn.title = 'Revert';
      btn.dataset.id = m.id ?? '';
      div.appendChild(btn);
    }

    messagesEl.appendChild(div);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMsg(msg: ChatMsg) {
  if (!msg.id) msg.id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  chat.push(msg);
  persistChat();
  renderChat();
}

function clearChat() { chat = []; localStorage.removeItem(CHAT_STORAGE); renderChat(); }

function revertToTurn(id: string) {
  const msg = chat.find(m => m.id === id);
  if (!msg || msg.patchBefore === undefined) return;
  historyPush(currentCode());
  setCode(msg.patchBefore);
  addMsg({ role: 'system', content: '↶ reverted' });
  updateHistoryButtons();
  evalCurrent();
}

function applyVariation(id: string) {
  const msg = chat.find(m => m.id === id);
  if (!msg || msg.role !== 'variation' || !msg.varCode) return;
  historyPush(currentCode());
  setCode(msg.varCode);
  addMsg({ role: 'system', content: `applied ${msg.content}` });
  syncBpmFromCode();
  updateHistoryButtons();
  evalCurrent();
}

function diffSummary(before: string, after: string): string {
  const delta = after.split('\n').length - before.split('\n').length;
  if (delta > 0) return `✓ +${delta} línea${delta === 1 ? '' : 's'}`;
  if (delta < 0) return `✓ ${delta} línea${delta === -1 ? '' : 's'}`;
  return '✓ pattern actualizado';
}

// ── AI actions ───────────────────────────

function getApiKey(): string {
  return (document.getElementById('apikey') as HTMLInputElement).value.trim();
}

const promptEl = () => document.getElementById('prompt') as HTMLTextAreaElement;
const generateBtn = () => document.getElementById('generate') as HTMLButtonElement;
const varsBtn = () => document.getElementById('variations-btn') as HTMLButtonElement;

function setGenerating(busy: boolean) {
  generateBtn().disabled = busy;
  varsBtn().disabled = busy;
}

async function doGenerate() {
  const msg = promptEl().value.trim();
  const apiKey = getApiKey();
  if (!msg) return;
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  const before = currentCode();
  historyPush(before);
  addMsg({ role: 'user', content: msg });
  promptEl().value = '';
  setStatus('generando…');
  setGenerating(true);
  try {
    const code = await generatePattern(msg, before, apiKey);
    setCode(code);
    syncBpmFromCode();
    updateHistoryButtons();
    addMsg({ role: 'assistant', content: diffSummary(before, code), patchBefore: before });
    await evalCurrent();
  } catch (e: any) {
    addMsg({ role: 'error', content: `error: ${e}` });
    setStatus(`generate failed: ${e}`, 'error');
  } finally {
    setGenerating(false);
    promptEl().focus();
  }
}

async function doVariations() {
  const msg = promptEl().value.trim();
  const apiKey = getApiKey();
  if (!msg) return;
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  addMsg({ role: 'user', content: `[vars] ${msg}` });
  promptEl().value = '';
  setStatus('generando 3 variaciones…');
  setGenerating(true);
  try {
    const before = currentCode();
    const [v1, v2, v3] = await generateVariations(msg, before, apiKey);
    for (const [i, code] of [[1, v1], [2, v2], [3, v3]] as [number, string][]) {
      addMsg({ role: 'variation', content: `Var ${i}`, varCode: code });
    }
    setStatus('elige una variación →', 'ok');
  } catch (e: any) {
    addMsg({ role: 'error', content: `error: ${e}` });
    setStatus(`variations failed: ${e}`, 'error');
  } finally {
    setGenerating(false);
  }
}

async function doExplain() {
  const apiKey = getApiKey();
  const code = currentCode();
  if (!code.trim()) { setStatus('nada que explicar', 'error'); return; }
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  setStatus('explicando…');
  const explainBtn = document.getElementById('explain') as HTMLButtonElement;
  explainBtn.disabled = true;
  try {
    const explanation = await explainPattern(code, apiKey);
    addMsg({ role: 'system', content: `✦ ${explanation}` });
    setStatus('listo', 'ok');
  } catch (e: any) {
    setStatus(`explain failed: ${e}`, 'error');
  } finally {
    explainBtn.disabled = false;
  }
}

// ── Wiring ───────────────────────────────

function wire() {
  // Transport
  document.getElementById('play')!.addEventListener('click', evalCurrent);
  document.getElementById('stop')!.addEventListener('click', () => {
    if (strudelReady) {
      stop();
      isPlaying = false;
      setVisualizerState(false, currentCps);
      setStatus('stopped');
    }
  });
  document.getElementById('eval')!.addEventListener('click', evalCurrent);
  document.getElementById('clear')!.addEventListener('click', () => {
    historyPush(currentCode());
    setCode('');
    setStatus('editor cleared');
    syncBpmFromCode();
    updateHistoryButtons();
  });

  // Examples
  const exSelect = document.getElementById('examples') as HTMLSelectElement;
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.name;
    opt.textContent = ex.name;
    exSelect.appendChild(opt);
  }
  exSelect.addEventListener('change', () => {
    const ex = EXAMPLES.find(e => e.name === exSelect.value);
    if (ex) {
      historyPush(currentCode());
      setCode(ex.code);
      exSelect.selectedIndex = 0;
      syncBpmFromCode();
      updateHistoryButtons();
    }
  });

  // BPM
  bpmInput.addEventListener('input', () => applyBpm(parseInt(bpmInput.value, 10), false));
  bpmInput.addEventListener('change', () => applyBpm(parseInt(bpmInput.value, 10), true));

  // Tap tempo
  document.getElementById('tap-tempo')!.addEventListener('click', handleTap);

  // History
  histBackBtn.addEventListener('click', () => {
    const code = historyBack();
    if (code !== null) { setCode(code); updateHistoryButtons(); }
  });
  histFwdBtn.addEventListener('click', () => {
    const code = historyForward();
    if (code !== null) { setCode(code); updateHistoryButtons(); }
  });

  // Slots
  document.querySelectorAll<HTMLButtonElement>('.slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.slot ?? '0', 10);
      historyPush(currentCode());
      const code = activateSlot(i);
      setCode(code);
      syncBpmFromCode();
      updateSlotButtons();
      updateHistoryButtons();
    });
    btn.addEventListener('dblclick', e => {
      e.preventDefault();
      const i = parseInt(btn.dataset.slot ?? '0', 10);
      const name = prompt(`Nombre del slot ${i + 1}:`, getSlot(i).name);
      if (name !== null) {
        setSlotName(i, name);
        updateSlotButtons();
      }
    });
  });

  // File ops
  document.getElementById('save-patch')!.addEventListener('click', async () => {
    const name = await savePatch(currentCode());
    if (name) setStatus(`guardado: ${name}`, 'ok');
  });
  document.getElementById('open-patch')!.addEventListener('click', async () => {
    const patch = await openPatch();
    if (patch) {
      historyPush(currentCode());
      setCode(patch.code);
      syncBpmFromCode();
      updateHistoryButtons();
      setStatus(`abierto: ${patch.name}`, 'ok');
    }
  });

  // Record
  document.getElementById('record')!.addEventListener('click', toggleRecord);

  // API key
  const keyInput = document.getElementById('apikey') as HTMLInputElement;
  const envKey = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim();
  keyInput.value = envKey || localStorage.getItem(KEY_STORAGE) || '';
  if (envKey) localStorage.setItem(KEY_STORAGE, envKey);
  keyInput.addEventListener('change', () => localStorage.setItem(KEY_STORAGE, keyInput.value.trim()));

  // Chat
  document.getElementById('clear-chat')!.addEventListener('click', clearChat);
  document.getElementById('explain')!.addEventListener('click', doExplain);
  document.getElementById('generate')!.addEventListener('click', doGenerate);
  document.getElementById('variations-btn')!.addEventListener('click', doVariations);

  promptEl().addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doGenerate(); }
  });

  // Template chips
  document.querySelectorAll<HTMLButtonElement>('.tpl').forEach(btn => {
    btn.addEventListener('click', () => {
      promptEl().value = btn.dataset.tpl ?? '';
      promptEl().focus();
    });
  });

  // Message clicks: revert or apply variation
  messagesEl.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const msgDiv = target.closest<HTMLElement>('.msg');
    if (!msgDiv) return;

    if (target.classList.contains('revert')) {
      revertToTurn(target.dataset.id ?? '');
      return;
    }
    if (msgDiv.classList.contains('variation') && msgDiv.dataset.id) {
      applyVariation(msgDiv.dataset.id);
    }
  });

  renderChat();
  syncBpmFromCode();
  updateSlotButtons();
  updateHistoryButtons();
}

// ── Boot ─────────────────────────────────

(async () => {
  wire();
  setStatus('cargando samples…');
  try {
    await initStrudel(view);
    setStatus('listo — Play o Ctrl+Enter', 'ok');
  } catch (e: any) {
    setStatus(`strudel init failed: ${e?.message ?? e}`, 'error');
  }
})();
