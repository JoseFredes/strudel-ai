import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { indentWithTab } from '@codemirror/commands';
import { basicSetup } from 'codemirror';

import { highlightExtension } from './highlight';
import { strudelCompletions } from './completions';
import { store } from './store';
import { historyPush } from './history';

type OnEvaluate = () => void;

export function createEditor(parent: HTMLElement, onEvaluate: OnEvaluate): EditorView {
  let externalUpdate = false; // prevents echo when store sets code from outside

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: store.state.code,
      extensions: [
        basicSetup,
        javascript(),
        highlightExtension,
        strudelCompletions,
        EditorView.updateListener.of(update => {
          if (!update.docChanged || externalUpdate) return;
          const code = view.state.doc.toString();
          store.setCode(code);
        }),
        Prec.highest(keymap.of([
          { key: 'Mod-Enter', run: () => { onEvaluate(); return true; } },
          indentWithTab,
        ])),
      ],
    }),
  });

  // Sync editor when code changes from outside (AI, slot switch, history nav)
  store.subscribe(state => {
    const current = view.state.doc.toString();
    if (current === state.code) return;
    externalUpdate = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: state.code } });
    externalUpdate = false;
  });

  return view;
}

export function pushHistoryAndSetCode(code: string) {
  historyPush(store.state.code);
  store.setCode(code);
}
