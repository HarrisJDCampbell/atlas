// A Java editor tuned like an interview pad: highlighting, brackets and indentation,
// but no autocomplete — interviews don't give you one, so practice shouldn't either.

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { java } from "@codemirror/lang-java";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: "#c792ea" },
  { tag: [t.typeName, t.className], color: "#82aaff" },
  { tag: [t.definition(t.variableName), t.function(t.variableName), t.function(t.propertyName)], color: "#e2c08d" },
  { tag: [t.string, t.character], color: "#a5d6a7" },
  { tag: [t.number, t.bool, t.null], color: "#f78c6c" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6b6a63", fontStyle: "italic" },
  { tag: [t.annotation], color: "#21b3c4" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "#a9a89f" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "transparent", color: "var(--color-ink)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--color-ink-4)" },
  ".cm-activeLine": { backgroundColor: "rgb(255 255 255 / 0.03)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-ink-2)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgb(33 179 196 / 0.25) !important" },
  ".cm-matchingBracket": { backgroundColor: "rgb(255 255 255 / 0.08)", outline: "1px solid rgb(255 255 255 / 0.15)" },
  ".cm-line-error": { backgroundColor: "rgb(208 59 59 / 0.16)", boxShadow: "inset 2px 0 0 var(--color-critical)" },
  ".cm-line-warn": { backgroundColor: "rgb(250 178 25 / 0.08)", boxShadow: "inset 2px 0 0 var(--color-warning)" },
}, { dark: true });

export interface Mark { line: number; kind: "error" | "warn" }
const setMarks = StateEffect.define<Mark[]>();
const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const b = new RangeSetBuilder<Decoration>();
      const sorted = [...e.value].filter((m) => m.line >= 1 && m.line <= tr.state.doc.lines).sort((a, z) => a.line - z.line);
      const seen = new Set<number>();
      for (const m of sorted) {
        if (seen.has(m.line)) continue;
        seen.add(m.line);
        const l = tr.state.doc.line(m.line);
        b.add(l.from, l.from, Decoration.line({ class: m.kind === "error" ? "cm-line-error" : "cm-line-warn" }));
      }
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export interface EditorHandle { focus: () => void; jumpTo: (line: number) => void; setValue: (v: string) => void }

const JavaEditor = forwardRef<EditorHandle, {
  value: string; onChange: (v: string) => void; onRun?: () => void; onSubmit?: () => void; marks?: Mark[]; readOnly?: boolean;
}>(function JavaEditor({ value, onChange, onRun, onSubmit, marks = [], readOnly = false }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The keymap is built once; read the latest handlers through refs.
  const cb = useRef({ onChange, onRun, onSubmit });
  cb.current = { onChange, onRun, onSubmit };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), history(), bracketMatching(), closeBrackets(),
          indentOnInput(), indentUnit.of("    "), EditorState.tabSize.of(4), java(), syntaxHighlighting(highlight), theme, marksField,
          EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
          ...(readOnly ? [EditorView.lineWrapping, EditorView.theme({ "&": { fontSize: "12.5px" } })] : []),
          keymap.of([
            { key: "Mod-Enter", run: () => { cb.current.onRun?.(); return true; } },
            { key: "Mod-Shift-Enter", run: () => { cb.current.onSubmit?.(); return true; } },
            ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab,
          ]),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
  }, [readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outside changes (reset, reveal) replace the document without fighting the cursor.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => { view.current?.dispatch({ effects: setMarks.of(marks) }); }, [marks]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    setValue: (s) => { const v = view.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: s } }); },
    jumpTo: (line) => {
      const v = view.current;
      if (!v || line < 1 || line > v.state.doc.lines) return;
      const l = v.state.doc.line(line);
      v.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
      v.focus();
    },
  }), []);

  return <div ref={host} className="selectable h-full min-h-0 overflow-hidden" />;
});

export default JavaEditor;
