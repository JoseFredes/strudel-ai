const STORAGE_KEY = 'strudel-ai:slots';
const COUNT = 8;

export type Slot = { code: string; name: string };

function load(): Slot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return Array.from({ length: COUNT }, (_, i) => ({ code: '', name: `${i + 1}` }));
}

function save(slots: Slot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
}

let slots = load();
let activeIdx = 0;

export function getSlot(i: number): Slot { return slots[i]; }
export function getActiveIdx() { return activeIdx; }
export function getCount() { return COUNT; }

export function setSlotCode(i: number, code: string) {
  slots[i] = { ...slots[i], code };
  save(slots);
}

export function setSlotName(i: number, name: string) {
  slots[i] = { ...slots[i], name: name.trim() || `${i + 1}` };
  save(slots);
}

export function activateSlot(i: number): string {
  activeIdx = i;
  return slots[i].code;
}

export function syncActiveCode(code: string) {
  setSlotCode(activeIdx, code);
}
