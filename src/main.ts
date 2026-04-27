import { store } from './store';
import { engine } from './engine';
import { createEditor, createPaneEditor, pushHistoryAndSetCode } from './editor';
import { mountChat, clearChat, handleMessageClick, setPromptFiller, setStatusHandler, setGeneratingHandler, doGenerate, doVariations, doExplain, doSuggest } from './chat';
import { historyBack, historyForward, historyCanBack, historyCanForward } from './history';
import { getSlot, getActiveIdx, setSlotName, setSlotCode, activateSlot } from './slots';
import { parseCps, cpsToBpm, bpmToCps } from './transport';
import { savePatch, openPatch } from './ai';
import { EXAMPLES } from './examples';

// ── DOM refs ─────────────────────────────

const statusEl = document.getElementById('status')!;
const statusSlotEl = document.getElementById('status-slot')!;
const bpmInput = document.getElementById('bpm') as HTMLInputElement;
const bpmLabel = document.getElementById('bpm-label') as HTMLSpanElement;
const histBackBtn = document.getElementById('hist-back') as HTMLButtonElement;
const histFwdBtn = document.getElementById('hist-fwd') as HTMLButtonElement;
const promptEl = document.getElementById('prompt') as HTMLTextAreaElement;
const recordBtn = document.getElementById('record') as HTMLButtonElement;
const keyBtn = document.getElementById('key-btn') as HTMLButtonElement;
const keyModal = document.getElementById('key-modal') as HTMLDivElement;
const modalApikey = document.getElementById('modal-apikey') as HTMLInputElement;
const splitBtn = document.getElementById('split-btn') as HTMLButtonElement;
const editorPane = document.getElementById('editor-pane') as HTMLDivElement;
const editorArea = document.getElementById('editor-area') as HTMLDivElement;
const leftPane = document.getElementById('left-pane') as HTMLDivElement;
const rightPane = document.getElementById('right-pane') as HTMLDivElement;
const splitDivider = document.getElementById('split-divider') as HTMLDivElement;
const leftTab = document.getElementById('left-tab') as HTMLDivElement;
const rightTab = document.getElementById('right-tab') as HTMLDivElement;
const leftSlotLabel = document.getElementById('left-slot-label') as HTMLSpanElement;
const rightSlotLabel = document.getElementById('right-slot-label') as HTMLSpanElement;

function setStatus(msg: string, kind: 'info' | 'error' | 'ok' = 'info') {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind;
}

function updateStatusSlot() {
  const i = getActiveIdx();
  const name = getSlot(i).name;
  statusSlotEl.textContent = `slot ${name}`;
}

// ── Editor ───────────────────────────────

const view = createEditor(
  document.getElementById('editor')!,
  () => evalCurrent(),
);

// ── BPM ──────────────────────────────────

function syncBpm(code: string) {
  const match = parseCps(code);
  if (!match) { bpmInput.disabled = true; bpmLabel.textContent = '— BPM'; return; }
  bpmInput.disabled = false;
  const bpm = cpsToBpm(match.value);
  bpmInput.value = String(Math.min(200, Math.max(60, bpm)));
  bpmLabel.textContent = `${bpm} BPM`;
}

function applyBpm(bpm: number, commit: boolean) {
  const match = parseCps(store.state.code);
  if (!match) return;
  store.setCode(store.state.code.slice(0, match.from) + `setcps(${bpmToCps(bpm)})` + store.state.code.slice(match.to));
  bpmLabel.textContent = `${bpm} BPM`;
  if (commit && engine.ready) evalCurrent();
}

store.subscribe(s => syncBpm(s.code));

// ── Tap tempo ────────────────────────────

const tapTimes: number[] = [];
function handleTap() {
  tapTimes.push(performance.now());
  if (tapTimes.length > 8) tapTimes.shift();
  if (tapTimes.length < 2) { setStatus('tap again…'); return; }
  const intervals = tapTimes.slice(1).map((t, i) => t - tapTimes[i]);
  const bpm = Math.round(60000 / (intervals.reduce((a, b) => a + b) / intervals.length));
  if (bpm < 60 || bpm > 200) return;
  bpmInput.value = String(bpm);
  applyBpm(bpm, store.state.isPlaying);
  setStatus(`tap: ${bpm} BPM`, 'ok');
}

// ── History ──────────────────────────────

function updateHistoryButtons() {
  histBackBtn.disabled = !historyCanBack();
  histFwdBtn.disabled = !historyCanForward();
}

store.subscribe(() => updateHistoryButtons());

// ── Slots ────────────────────────────────

function updateSlots() {
  const active = getActiveIdx();
  document.querySelectorAll<HTMLButtonElement>('.slot').forEach((btn, i) => {
    btn.classList.toggle('active', i === active);
    btn.classList.toggle('has-code', !!getSlot(i).code.trim());
    btn.textContent = getSlot(i).name.slice(0, 4);
  });
}

store.subscribe(updateSlots);
store.subscribe(updateStatusSlot);

// ── Eval ─────────────────────────────────

async function evalCurrent() {
  if (!engine.ready) { setStatus('strudel still loading…'); return; }
  engine.resumeCtx();
  try {
    await engine.evaluate(store.state.code);
    setStatus('playing ♪', 'ok');
  } catch (e: any) {
    setStatus(`eval error: ${e?.message ?? e}`, 'error');
  }
}

// ── Recording ────────────────────────────

let mediaRecorder: MediaRecorder | null = null;
let recordChunks: Blob[] = [];

async function toggleRecord() {
  if (mediaRecorder?.state === 'recording') { mediaRecorder.stop(); return; }
  if (!engine.ready || !engine.ctx) { setStatus('engine not ready', 'error'); return; }
  try {
    const dest = engine.ctx.createMediaStreamDestination();
    const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const ext = mimeType === 'audio/mp4' ? 'm4a' : 'webm';
    recordChunks = [];
    mediaRecorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(recordChunks, { type: mimeType || 'audio/webm' }));
      Object.assign(document.createElement('a'), { href: url, download: `loopcraft-${Date.now()}.${ext}` }).click();
      URL.revokeObjectURL(url);
      recordBtn.classList.remove('recording');
      setStatus('recording saved', 'ok');
    };
    mediaRecorder.start();
    recordBtn.classList.add('recording');
    setStatus('recording…');
  } catch (e: any) {
    setStatus(`recording failed: ${e?.message ?? e}`, 'error');
  }
}

// ── Split pane ────────────────────────────

let splitActive = false;
let rightSlotIdx = 1;
let rightPaneCode = '';
let rightEditor: ReturnType<typeof createPaneEditor> | null = null;
function setActiveTab(side: 'left' | 'right') {
  leftTab.classList.toggle('active', side === 'left');
  rightTab.classList.toggle('active', side === 'right');
}

function updateLeftLabel() {
  leftSlotLabel.textContent = getSlot(getActiveIdx()).name;
}

function updateRightLabel() {
  rightSlotLabel.textContent = getSlot(rightSlotIdx).name;
}

function setRightSlot(idx: number) {
  rightSlotIdx = ((idx % 8) + 8) % 8;
  rightPaneCode = getSlot(rightSlotIdx).code;
  rightEditor?.setCode(rightPaneCode);
  updateRightLabel();
}

function activateSplit() {
  splitActive = true;
  splitDivider.hidden = false;
  rightPane.hidden = false;
  editorPane.classList.add('split');
  splitBtn.classList.add('active');
  splitBtn.title = 'Cerrar split';

  const container = document.getElementById('editor-right')!;
  container.innerHTML = '';
  rightPaneCode = getSlot(rightSlotIdx).code;

  rightEditor = createPaneEditor(
    container,
    rightPaneCode,
    code => { rightPaneCode = code; setSlotCode(rightSlotIdx, code); },
    () => evalPane('right'),
  );

  // Focus tracking
  document.getElementById('editor')!.addEventListener('mousedown', () => setActiveTab('left'), true);
  container.addEventListener('mousedown', () => setActiveTab('right'), true);

  updateLeftLabel();
  updateRightLabel();
  setActiveTab('left');
  initDividerDrag();
}

function deactivateSplit() {
  splitActive = false;
  splitDivider.hidden = true;
  rightPane.hidden = true;
  editorPane.classList.remove('split');
  splitBtn.classList.remove('active');
  splitBtn.title = 'Split view';
  leftTab.classList.remove('active');
  rightEditor?.view.destroy();
  rightEditor = null;
  leftPane.style.flex = '';
  rightPane.style.flex = '';
}

async function evalPane(side: 'left' | 'right') {
  if (!engine.ready) { setStatus('strudel still loading…'); return; }
  engine.resumeCtx(); // sync resume within user gesture
  setActiveTab(side);
  const code = side === 'right' ? rightPaneCode : store.state.code;
  try {
    await engine.evaluate(code);
    setStatus('playing ♪', 'ok');
  } catch (e: any) {
    setStatus(`eval error: ${e?.message ?? e}`, 'error');
  }
}

function initDividerDrag() {
  let dragging = false;
  let startX = 0;
  let startLeftW = 0;

  splitDivider.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startLeftW = leftPane.getBoundingClientRect().width;
    splitDivider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const total = editorArea.getBoundingClientRect().width - 5; // divider width
    const newLeft = Math.max(180, Math.min(total - 180, startLeftW + e.clientX - startX));
    const ratio = newLeft / total;
    leftPane.style.flex = `0 0 ${(ratio * 100).toFixed(2)}%`;
    rightPane.style.flex = `0 0 ${((1 - ratio) * 100).toFixed(2)}%`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    splitDivider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// Keep left label in sync with active slot
store.subscribe(() => { if (splitActive) updateLeftLabel(); });

// ── API Key modal ─────────────────────────

function updateKeyBtn() {
  keyBtn.classList.toggle('has-key', !!store.state.apiKey);
  keyBtn.title = store.state.apiKey ? 'API key saved — click to change' : 'Set OpenAI API key';
}

function openKeyModal() {
  modalApikey.value = store.state.apiKey;
  keyModal.hidden = false;
  setTimeout(() => modalApikey.focus(), 50);
}

function closeKeyModal() { keyModal.hidden = true; }

// ── Wire ─────────────────────────────────

function wire() {
  // Transport — resumeCtx() MUST be called synchronously in the click handler
  // WKWebView requires AudioContext.resume() to run within the user gesture stack
  document.getElementById('play')!.addEventListener('click', () => { engine.resumeCtx(); evalCurrent(); });
  document.getElementById('stop')!.addEventListener('click', () => { engine.stop(); setStatus('stopped'); });
  document.getElementById('eval')!.addEventListener('click', () => { engine.resumeCtx(); evalCurrent(); });
  document.getElementById('clear')!.addEventListener('click', () => {
    pushHistoryAndSetCode('');
    setStatus('editor cleared');
  });

  // Examples
  const exSel = document.getElementById('examples') as HTMLSelectElement;
  EXAMPLES.forEach(ex => { const o = document.createElement('option'); o.value = o.textContent = ex.name; exSel.appendChild(o); });
  exSel.addEventListener('change', () => {
    const ex = EXAMPLES.find(e => e.name === exSel.value);
    if (ex) { pushHistoryAndSetCode(ex.code); exSel.selectedIndex = 0; }
  });

  // BPM
  bpmInput.addEventListener('input', () => applyBpm(parseInt(bpmInput.value, 10), false));
  bpmInput.addEventListener('change', () => applyBpm(parseInt(bpmInput.value, 10), true));
  document.getElementById('tap-tempo')!.addEventListener('click', handleTap);

  // History
  histBackBtn.addEventListener('click', () => {
    const c = historyBack();
    if (c !== null) { store.setCode(c); if (store.state.isPlaying) evalCurrent(); }
  });
  histFwdBtn.addEventListener('click', () => {
    const c = historyForward();
    if (c !== null) { store.setCode(c); if (store.state.isPlaying) evalCurrent(); }
  });

  // Slots
  document.querySelectorAll<HTMLButtonElement>('.slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const wasPlaying = store.state.isPlaying;
      pushHistoryAndSetCode(store.state.code);
      store.setCode(activateSlot(parseInt(btn.dataset.slot ?? '0', 10)));
      if (wasPlaying) evalCurrent();
    });
    btn.addEventListener('dblclick', e => {
      e.preventDefault();
      const i = parseInt(btn.dataset.slot ?? '0', 10);
      const name = prompt(`Nombre del slot ${i + 1}:`, getSlot(i).name);
      if (name !== null) { setSlotName(i, name); updateSlots(); }
    });
  });

  // File ops
  document.getElementById('save-patch')!.addEventListener('click', async () => {
    const name = await savePatch(store.state.code);
    if (name) setStatus(`guardado: ${name}`, 'ok');
  });
  document.getElementById('open-patch')!.addEventListener('click', async () => {
    const patch = await openPatch();
    if (patch) { pushHistoryAndSetCode(patch.code); setStatus(`abierto: ${patch.name}`, 'ok'); }
  });

  // Drag slots into panes
  document.querySelectorAll<HTMLButtonElement>('.slot').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      e.dataTransfer!.setData('text/plain', btn.dataset.slot ?? '0');
      e.dataTransfer!.effectAllowed = 'copy';
    });
  });

  function wireDropTarget(el: HTMLElement, onDrop: (slotIdx: number) => void) {
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const idx = parseInt(e.dataTransfer!.getData('text/plain'), 10);
      if (!isNaN(idx)) onDrop(idx);
    });
  }

  wireDropTarget(document.getElementById('left-tab')!, idx => {
    pushHistoryAndSetCode(store.state.code);
    store.setCode(activateSlot(idx));
    if (store.state.isPlaying) evalCurrent();
  });
  wireDropTarget(document.getElementById('right-tab')!, idx => {
    if (!splitActive) activateSplit();
    setRightSlot(idx);
  });

  // Split pane
  splitBtn.addEventListener('click', () => { splitActive ? deactivateSplit() : activateSplit(); });
  document.getElementById('left-play')!.addEventListener('click', () => evalPane('left'));
  document.getElementById('right-play')!.addEventListener('click', () => evalPane('right'));
  document.getElementById('right-prev')!.addEventListener('click', () => setRightSlot(rightSlotIdx - 1));
  document.getElementById('right-next')!.addEventListener('click', () => setRightSlot(rightSlotIdx + 1));

  // Record
  recordBtn.addEventListener('click', toggleRecord);

  // API key modal
  keyBtn.addEventListener('click', openKeyModal);
  document.getElementById('modal-save')!.addEventListener('click', () => {
    store.setApiKey(modalApikey.value.trim());
    updateKeyBtn();
    closeKeyModal();
  });
  document.getElementById('modal-skip')!.addEventListener('click', closeKeyModal);
  keyModal.addEventListener('click', e => { if (e.target === keyModal) closeKeyModal(); });
  modalApikey.addEventListener('keydown', e => {
    if (e.key === 'Enter') { store.setApiKey(modalApikey.value.trim()); updateKeyBtn(); closeKeyModal(); }
    if (e.key === 'Escape') closeKeyModal();
  });
  updateKeyBtn();

  // Chat
  mountChat(document.getElementById('messages')!);
  setPromptFiller(text => { promptEl.value = text; promptEl.focus(); });
  setStatusHandler(setStatus);
  setGeneratingHandler(setGenerating);
  document.getElementById('messages')!.addEventListener('click', handleMessageClick);
  document.getElementById('clear-chat')!.addEventListener('click', clearChat);
  document.getElementById('suggest-btn')!.addEventListener('click', async () => {
    const btn = document.getElementById('suggest-btn') as HTMLButtonElement;
    btn.disabled = true;
    await doSuggest(setStatus);
    btn.disabled = false;
  });
  document.getElementById('explain')!.addEventListener('click', async () => {
    const btn = document.getElementById('explain') as HTMLButtonElement;
    btn.disabled = true;
    await doExplain(setStatus);
    btn.disabled = false;
  });
  document.getElementById('generate')!.addEventListener('click', async () => {
    const msg = promptEl.value.trim(); if (!msg) return;
    setGenerating(true);
    promptEl.value = '';
    await doGenerate(msg, setStatus);
    setGenerating(false);
    promptEl.focus();
  });
  document.getElementById('variations-btn')!.addEventListener('click', async () => {
    const msg = promptEl.value.trim(); if (!msg) return;
    setGenerating(true);
    promptEl.value = '';
    await doVariations(msg, setStatus);
    setGenerating(false);
  });
  promptEl.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const msg = promptEl.value.trim(); if (!msg) return;
    setGenerating(true);
    promptEl.value = '';
    await doGenerate(msg, setStatus);
    setGenerating(false);
    promptEl.focus();
  });

  // Template chips
  document.querySelectorAll<HTMLButtonElement>('.tpl').forEach(btn => {
    btn.addEventListener('click', () => { promptEl.value = btn.dataset.tpl ?? ''; promptEl.focus(); });
  });

  // Initial render
  syncBpm(store.state.code);
  updateSlots();
  updateHistoryButtons();
  updateStatusSlot();
}

function setGenerating(busy: boolean) {
  (document.getElementById('generate') as HTMLButtonElement).disabled = busy;
  (document.getElementById('variations-btn') as HTMLButtonElement).disabled = busy;
}

// ── Boot ─────────────────────────────────

(async () => {
  wire();
  if (!store.state.apiKey) openKeyModal();

  // Resume AudioContext when returning from another desktop/tab (macOS throttles WKWebView)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') engine.ensureRunning().catch(() => {});
  });

  setStatus('cargando samples…');
  try {
    const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    await engine.init(view, canvas);
    setStatus('listo — Play o Ctrl+Enter', 'ok');
  } catch (e: any) {
    setStatus(`init failed: ${e?.message ?? e}`, 'error');
  }
})();
