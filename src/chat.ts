import { store } from './store';
import { pushHistoryAndSetCode } from './editor';
import { generatePattern, explainPattern, generateVariations, suggestDirections, type Suggestion } from './ai';
import { engine } from './engine';

const STORAGE_KEY = 'loopcraft:chat';

type MsgRole = 'user' | 'assistant' | 'variation' | 'suggestions' | 'error' | 'system';

type ChatMsg = {
  role: MsgRole;
  content: string;
  id?: string;
  patchBefore?: string;
  varCode?: string;
  suggestions?: Suggestion[];
};

// ── State ────────────────────────────────

let chat: ChatMsg[] = [];
try { chat = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { chat = []; }

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(chat)); }

function genId() { return `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function diffSummary(before: string, after: string): string {
  const d = after.split('\n').length - before.split('\n').length;
  return d > 0 ? `✓ +${d} línea${d === 1 ? '' : 's'}` : d < 0 ? `✓ ${d} línea${d === -1 ? '' : 's'}` : '✓ pattern actualizado';
}

// ── Render ───────────────────────────────

let messagesEl: HTMLElement;

export function mountChat(el: HTMLElement) {
  messagesEl = el;
  render();
}

function render() {
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
    } else if (m.role === 'suggestions' && m.suggestions) {
      const label = document.createElement('div');
      label.className = 'var-label';
      label.textContent = '✦ try one of these';
      div.appendChild(label);
      const chips = document.createElement('div');
      chips.className = 'suggestion-chips';
      for (const s of m.suggestions) {
        const chip = document.createElement('button');
        chip.className = 'suggestion-chip';
        chip.textContent = s.label;
        chip.title = s.prompt;
        chip.dataset.prompt = s.prompt;
        chips.appendChild(chip);
      }
      div.appendChild(chips);
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
  msg.id ??= genId();
  chat.push(msg);
  persist();
  render();
}

export function clearChat() {
  chat = [];
  localStorage.removeItem(STORAGE_KEY);
  render();
}

// ── Actions ──────────────────────────────

function revertToTurn(id: string) {
  const msg = chat.find(m => m.id === id);
  if (!msg?.patchBefore) return;
  pushHistoryAndSetCode(msg.patchBefore);
  addMsg({ role: 'system', content: '↶ reverted' });
  engine.evaluate(msg.patchBefore).catch(() => {});
}

function applyVariation(id: string) {
  const msg = chat.find(m => m.id === id);
  if (msg?.role !== 'variation' || !msg.varCode) return;
  pushHistoryAndSetCode(msg.varCode);
  addMsg({ role: 'system', content: `applied ${msg.content}` });
  engine.evaluate(msg.varCode).catch(() => {});
}

let promptFiller: ((text: string) => void) | null = null;
let statusFn: ((m: string, k?: any) => void) | null = null;
let generatingFn: ((busy: boolean) => void) | null = null;

export function setPromptFiller(fn: (text: string) => void) { promptFiller = fn; }
export function setStatusHandler(fn: (m: string, k?: any) => void) { statusFn = fn; }
export function setGeneratingHandler(fn: (busy: boolean) => void) { generatingFn = fn; }

export function handleMessageClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const msgDiv = target.closest<HTMLElement>('.msg');
  if (!msgDiv) return;
  if (target.classList.contains('revert')) { revertToTurn(target.dataset.id ?? ''); return; }
  if (target.classList.contains('suggestion-chip') && target.dataset.prompt) {
    const prompt = target.dataset.prompt;
    if (statusFn && generatingFn) {
      generatingFn(true);
      target.classList.add('loading');
      doGenerate(prompt, statusFn).finally(() => {
        generatingFn!(false);
        target.classList.remove('loading');
      });
    } else {
      promptFiller?.(prompt);
    }
    return;
  }
  if (msgDiv.classList.contains('variation') && msgDiv.dataset.id) applyVariation(msgDiv.dataset.id);
}

export async function doGenerate(prompt: string, setStatus: (m: string, k?: any) => void) {
  const { apiKey, code: before } = store.state;
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  addMsg({ role: 'user', content: prompt });
  setStatus('generando…');
  try {
    const code = await generatePattern(prompt, before, apiKey);
    pushHistoryAndSetCode(code);
    addMsg({ role: 'assistant', content: diffSummary(before, code), patchBefore: before });
    await engine.evaluate(code);
    setStatus('playing ♪', 'ok');
  } catch (e: any) {
    addMsg({ role: 'error', content: `error: ${e}` });
    setStatus(`generate failed: ${e}`, 'error');
  }
}

export async function doVariations(prompt: string, setStatus: (m: string, k?: any) => void) {
  const { apiKey, code: before } = store.state;
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  addMsg({ role: 'user', content: `[vars] ${prompt}` });
  setStatus('generando 3 variaciones…');
  try {
    const [v1, v2, v3] = await generateVariations(prompt, before, apiKey);
    for (const [i, code] of [[1, v1], [2, v2], [3, v3]] as [number, string][]) {
      addMsg({ role: 'variation', content: `Var ${i}`, varCode: code });
    }
    setStatus('elige una variación →', 'ok');
  } catch (e: any) {
    addMsg({ role: 'error', content: `error: ${e}` });
    setStatus(`variations failed: ${e}`, 'error');
  }
}

export async function doSuggest(setStatus: (m: string, k?: any) => void) {
  const { apiKey, code } = store.state;
  if (!code.trim()) { setStatus('nada que analizar', 'error'); return; }
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  setStatus('analizando…');
  try {
    const suggestions = await suggestDirections(code, apiKey);
    addMsg({ role: 'suggestions', content: '', suggestions });
    setStatus('elige una dirección', 'ok');
  } catch (e: any) {
    addMsg({ role: 'error', content: `error: ${e}` });
    setStatus(`suggest failed: ${e}`, 'error');
  }
}

export async function doExplain(setStatus: (m: string, k?: any) => void) {
  const { apiKey, code } = store.state;
  if (!code.trim()) { setStatus('nada que explicar', 'error'); return; }
  if (!apiKey) { addMsg({ role: 'error', content: 'pega tu OpenAI key arriba' }); return; }

  setStatus('explicando…');
  try {
    const explanation = await explainPattern(code, apiKey);
    addMsg({ role: 'system', content: `✦ ${explanation}` });
    setStatus('listo', 'ok');
  } catch (e: any) {
    setStatus(`explain failed: ${e}`, 'error');
  }
}
