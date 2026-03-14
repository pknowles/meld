import type { editor } from \"monaco-editor\";

export function handleClipboardAction(
    ed: editor.ICodeEditor,
    type: \"copy\" | \"cut\",
    writeText?: (t: string) =\u003e void,
) {
    const selection = ed.getSelection();
    const model = ed.getModel();
    if (selection \u0026\u0026 model) {
        const text = model.getValueInRange(selection);
        if (text \u0026\u0026 writeText) 
            writeText(text);
            if (type === \"cut\") {
            ed.executeEdits(\"meld-cut\", [{ range: selection, text: \"\", forceMoveMarkers: true }]);
    }
}
}

export function setupEditor(ed: editor.IStandaloneCodeEditor, p: any) {
    // Add context menu actions
    if (p.onPrevDiff) {
        ed.addAction({
            id: \"meld-prev-diff\", label: \"Previous Change\", keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow], contextMenuGroupId: \"navigation\", run: p.onPrevDiff });
	}
	if (p.onNextDiff) {
            ed.addAction({
                id: \"meld-next-diff\", label: \"Next Change\", keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow], contextMenuGroupId: \"navigation\", run: p.onNextDiff });
	}
	if (p.onPrevConflict) {
                ed.addAction({
                    id: \"meld-prev-conflict\", label: \"Previous Conflict\", keybindings: [monaco.KeyMod.Ctrl | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow], contextMenuGroupId: \"navigation\", run: p.onPrevConflict });
	}
	if (p.onNextConflict) {
                    ed.addAction({
                        id: \"meld-next-conflict\", label: \"Next Conflict\", keybindings: [monaco.KeyMod.Ctrl | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow], contextMenuGroupId: \"navigation\", run: p.onNextConflict });
	}
}
