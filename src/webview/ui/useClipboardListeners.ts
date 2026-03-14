import { Selection, editor } from "monaco-editor";
import { useEffect } from "react";

interface Context {
    editorRefs: React.MutableRefObject<editor.IStandaloneCodeEditor[]>;
    requestClipboardText: () => Promise<string>;
    writeClipboardText: (text: string) => Promise<void>;
}

export function useClipboardListeners({ editorRefs, requestClipboardText, writeClipboardText }: Context) {
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent, activeEditor: editor.IStandaloneCodeEditor) => {
            if (!activeEditor.getOption(editor.EditorOption.readOnly)) {
                e.preventDefault();
                requestClipboardText().then((text) => activeEditor.trigger("keyboard", "paste", { text }));
            }
        };

        const getSelectionText = (ed: editor.IStandaloneCodeEditor) => {
            const selection = ed.getSelection();
            const model = ed.getModel();
            if (!(selection && model)) return null;
            return {
                text: selection.isEmpty() ? `${model.getLineContent(selection.startLineNumber)}\n` : model.getValueInRange(selection),
                rangeToDelete: selection.isEmpty()
                    ? new Selection(selection.startLineNumber, 1, selection.startLineNumber + 1, 1)
                    : selection,
            };
        };

        const handleCopyCut = (e: ClipboardEvent, activeEditor: editor.IStandaloneCodeEditor) => {
            const result = getSelectionText(activeEditor);
            if (!result) return;
            const { text, rangeToDelete } = result;
            if (text) {
                e.preventDefault();
                writeClipboardText(text);
                if (e.type === "cut" && !activeEditor.getOption(editor.EditorOption.readOnly)) {
                    activeEditor.executeEdits("cut", [{ range: rangeToDelete, text: "" }]);
                }
            }
        };

        const handleClipboard = (e: ClipboardEvent) => {
            const activeEditor = editorRefs.current.find((ed) => ed?.hasWidgetFocus());
            if (!activeEditor) return;
            if (e.type === "paste") handlePaste(e, activeEditor);
            else if (e.type === "copy" || e.type === "cut") handleCopyCut(e, activeEditor);
            else return;
        };

        document.addEventListener("copy", handleClipboard);
        document.addEventListener("cut", handleClipboard);
        document.addEventListener("paste", handleClipboard);
        return () => {
            document.removeEventListener("copy", handleClipboard);
            document.removeEventListener("cut", handleClipboard);
            document.removeEventListener("paste", handleClipboard);
        };
    }, [editorRefs, requestClipboardText, writeClipboardText]);
}
