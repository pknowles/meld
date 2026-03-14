import type { editor } from "monaco-editor";
import { useRef, useState } from "react";
import type { Differ } from "../../matchers/diffutil.ts";
import type { PaneDiffs, PaneFiles } from "./appHooks.ts";

export const DEFAULT_DEBOUNCE_DELAY = 300;

export function useAppLogic() {
	const [files, setFiles] = useState<PaneFiles>([
		null,
		null,
		null,
		null,
		null,
	]);
	const filesRef = useRef<PaneFiles>([null, null, null, null, null]);
	const [diffs, setDiffs] = useState<PaneDiffs>([null, null, null, null]);
	const diffsRef = useRef<PaneDiffs>([null, null, null, null]);
	const differRef = useRef<Differ | null>(null);
	const [externalSyncId, setExternalSyncId] = useState(0);
	const [debounceDelay, setDebounceDelay] = useState(DEFAULT_DEBOUNCE_DELAY);
	const [syntaxHighlighting, setSyntaxHighlighting] = useState(true);
	const [baseCompareHighlighting, setBaseCompareHighlighting] =
		useState(false);
	const [smoothScrolling, setSmoothScrolling] = useState(true);
	const [renderTrigger, setRenderTrigger] = useState(0);
	const editorRefArray = useRef<editor.IStandaloneCodeEditor[]>([]);
	const diffsAreReversedRef = useRef<boolean[]>([false, true, false, false]);

	return {
		files,
		setFiles,
		filesRef,
		diffs,
		setDiffs,
		diffsRef,
		differRef,
		externalSyncId,
		setExternalSyncId,
		debounceDelay,
		setDebounceDelay,
		syntaxHighlighting,
		setSyntaxHighlighting,
		baseCompareHighlighting,
		setBaseCompareHighlighting,
		smoothScrolling,
		setSmoothScrolling,
		renderTrigger,
		setRenderTrigger,
		editorRefArray,
		diffsAreReversedRef,
	};
}
