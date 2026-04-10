"use client";

import { useRef, useEffect } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";

interface CodeEditorProps {
  initialCode?: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ initialCode = "", onChange, readOnly = false }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialCode,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        autocompletion(),
        python(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-geist-mono), monospace" },
          ".cm-content": { minHeight: "200px" },
        }),
        ...(onChange
          ? [
              EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                  onChange(update.state.doc.toString());
                }
              }),
            ]
          : []),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="border rounded-lg overflow-hidden h-full"
    />
  );
}
