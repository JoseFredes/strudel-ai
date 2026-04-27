export type CpsMatch = { value: number; from: number; to: number; raw: string };

const CPS_RE = /setcps\s*\(\s*([\d.]+)\s*\)/;

export function parseCps(code: string): CpsMatch | null {
  const m = CPS_RE.exec(code);
  if (!m) return null;
  return {
    value: parseFloat(m[1]),
    from: m.index,
    to: m.index + m[0].length,
    raw: m[0],
  };
}

export function cpsToBpm(cps: number): number {
  return Math.round(cps * 60 * 4);
}

export function bpmToCps(bpm: number): number {
  return Math.round((bpm / 240) * 1000) / 1000;
}
