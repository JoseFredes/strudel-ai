const MAX = 20;
let stack: string[] = [];
let pos = -1;

export function historyPush(code: string) {
  if (code === stack[pos]) return;
  stack = stack.slice(0, pos + 1);
  stack.push(code);
  if (stack.length > MAX) stack.shift();
  pos = stack.length - 1;
}

export function historyBack(): string | null {
  if (pos <= 0) return null;
  return stack[--pos];
}

export function historyForward(): string | null {
  if (pos >= stack.length - 1) return null;
  return stack[++pos];
}

export function historyCanBack() { return pos > 0; }
export function historyCanForward() { return pos < stack.length - 1; }
