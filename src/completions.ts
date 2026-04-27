import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

const FUNCTIONS = [
  // Pattern constructors
  { label: 'stack', detail: 'stack(...patterns)' },
  { label: 'cat', detail: 'cat(...patterns)' },
  { label: 'seq', detail: 'seq(...patterns)' },
  { label: 'slowcat', detail: 'slowcat(...patterns)' },
  { label: 'fastcat', detail: 'fastcat(...patterns)' },
  { label: 'silence', detail: 'silence' },
  { label: 'setcps', detail: 'setcps(cps)' },
  // Sources
  { label: 's', detail: 's("sample-name*n")' },
  { label: 'note', detail: 'note("c3 e3 g3")' },
  { label: 'n', detail: 'n("0 1 2 3")' },
  { label: 'freq', detail: 'freq(440)' },
  // Modulation signals
  { label: 'sine', detail: 'sine — 0..1 LFO' },
  { label: 'cosine', detail: 'cosine — 0..1 LFO' },
  { label: 'saw', detail: 'saw — 0..1 sawtooth' },
  { label: 'square', detail: 'square — 0/1 square' },
  { label: 'rand', detail: 'rand — random 0..1' },
  { label: 'perlin', detail: 'perlin — smooth noise 0..1' },
  { label: 'irand', detail: 'irand(n) — random int 0..n' },
];

const METHODS = [
  // Gain / pan
  { label: 'gain', detail: '.gain(0..1)' },
  { label: 'pan', detail: '.pan(-1..1)' },
  // Filter
  { label: 'cutoff', detail: '.cutoff(hz)' },
  { label: 'resonance', detail: '.resonance(0..50)' },
  { label: 'hpf', detail: '.hpf(hz)' },
  // FX
  { label: 'room', detail: '.room(0..1)' },
  { label: 'delay', detail: '.delay(0..1)' },
  { label: 'delaytime', detail: '.delaytime(sec)' },
  { label: 'delayfeedback', detail: '.delayfeedback(0..1)' },
  { label: 'crush', detail: '.crush(bits)' },
  { label: 'shape', detail: '.shape(0..1)' },
  { label: 'coarse', detail: '.coarse(n)' },
  // ADSR
  { label: 'attack', detail: '.attack(sec)' },
  { label: 'decay', detail: '.decay(sec)' },
  { label: 'sustain', detail: '.sustain(0..1)' },
  { label: 'release', detail: '.release(sec)' },
  // Time
  { label: 'slow', detail: '.slow(n)' },
  { label: 'fast', detail: '.fast(n)' },
  { label: 'rev', detail: '.rev()' },
  { label: 'iter', detail: '.iter(n)' },
  { label: 'palindrome', detail: '.palindrome()' },
  // Conditional
  { label: 'every', detail: '.every(n, fn)' },
  { label: 'sometimes', detail: '.sometimes(fn)' },
  { label: 'often', detail: '.often(fn)' },
  { label: 'rarely', detail: '.rarely(fn)' },
  { label: 'almostAlways', detail: '.almostAlways(fn)' },
  { label: 'almostNever', detail: '.almostNever(fn)' },
  { label: 'someCycles', detail: '.someCycles(fn)' },
  // Transforms
  { label: 'range', detail: '.range(min, max)' },
  { label: 'rangex', detail: '.rangex(min, max)' },
  { label: 'add', detail: '.add(n)' },
  { label: 'sub', detail: '.sub(n)' },
  { label: 'mul', detail: '.mul(n)' },
  { label: 'div', detail: '.div(n)' },
  { label: 'jux', detail: '.jux(fn)' },
  // Synth
  { label: 's', detail: '.s("sawtooth"|"square"|"sine"|"triangle")' },
  // MIDI
  { label: 'midi', detail: '.midi() — send to MIDI port 0' },
];

const SAMPLES = ['bd','sd','cp','hh','oh','lt','mt','ht','cb','rim','cr','rd','casio','tabla'];
const SYNTHS = ['sawtooth','square','sine','triangle'];

function strudelSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const text = word.text;
  const isDot = text.includes('.');
  const fragment = isDot ? text.split('.').pop()! : text;

  const options = isDot
    ? METHODS.map(m => ({ label: m.label, detail: m.detail, type: 'method' }))
    : [
        ...FUNCTIONS.map(f => ({ label: f.label, detail: f.detail, type: 'function' })),
        ...SAMPLES.map(s => ({ label: `"${s}"`, displayLabel: s, type: 'text' })),
        ...SYNTHS.map(s => ({ label: `"${s}"`, displayLabel: s, type: 'text' })),
      ];

  const filtered = options.filter(o =>
    ((o as any).displayLabel ?? o.label).toLowerCase().startsWith(fragment.toLowerCase())
  );

  if (!filtered.length) return null;

  return {
    from: word.from + (isDot ? text.lastIndexOf('.') + 1 : 0),
    options: filtered,
    validFor: /^[\w"]*$/,
  };
}

export const strudelCompletions = autocompletion({ override: [strudelSource] });
