import { StateEffect, StateField, Extension } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';

const addFlash = StateEffect.define<{ from: number; to: number }>();
const removeFlash = StateEffect.define<{ from: number; to: number }>();

const flashMark = Decoration.mark({ class: 'cm-flash' });

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(addFlash)) {
        const { from, to } = e.value;
        decos = decos.update({ add: [flashMark.range(from, to)] });
      } else if (e.is(removeFlash)) {
        const { from, to } = e.value;
        decos = decos.update({
          filter: (f, t) => !(f === from && t === to),
        });
      }
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

export const highlightExtension: Extension = [flashField];

export function flashRange(view: EditorView, from: number, to: number, ms = 140) {
  const len = view.state.doc.length;
  const f = Math.max(0, Math.min(from, len));
  const t = Math.max(f, Math.min(to, len));
  if (f === t) return;
  view.dispatch({ effects: addFlash.of({ from: f, to: t }) });
  setTimeout(() => {
    view.dispatch({ effects: removeFlash.of({ from: f, to: t }) });
  }, ms);
}

export function flashLocations(view: EditorView, locations: unknown, ms = 140) {
  if (!Array.isArray(locations)) return;
  for (const loc of locations) {
    let from: number | undefined;
    let to: number | undefined;
    if (Array.isArray(loc)) {
      from = loc[0];
      to = loc[1];
    } else if (loc && typeof loc === 'object') {
      const o = loc as Record<string, unknown>;
      from = typeof o.start === 'number' ? o.start : typeof o.from === 'number' ? o.from : undefined;
      to = typeof o.end === 'number' ? o.end : typeof o.to === 'number' ? o.to : undefined;
    }
    if (typeof from === 'number' && typeof to === 'number' && to > from) {
      flashRange(view, from, to, ms);
    }
  }
}
